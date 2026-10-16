import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

async function action(request: APIRequestContext, command: unknown) {
  const token = (await (await request.get('/api/control-session')).json()).token;
  const response = await request.post('/api/actions', { headers: { 'x-virtualhud-control': token }, data: command });
  expect(response.status()).toBe(200); return response.json();
}
const state = async (request: APIRequestContext) => (await request.get('/api/state')).json();
const loaded = async (page: Page, route = '/control/post-match') => { await page.goto(route); await expect(page.getByText('Server online', { exact: true })).toBeVisible(); };
async function liveFixture(request: APIRequestContext) { await action(request, { type: 'POST_MATCH_LOAD_FIXTURE' }); await action(request, { type: 'POST_MATCH_SET_READY', value: true }); await action(request, { type: 'SET_OUTPUT', output: 'post-match' }); }
test.beforeAll(async () => { await mkdir('test-results', { recursive: true }); });
test.beforeEach(async ({ request }) => { await action(request, { type: 'RESET' }); });

test('F06/F09 Tab keeps live approval; Escape cancels; Enter edits take off-air', async ({ page, request }) => {
  await liveFixture(request); await loaded(page);
  const input = page.getByRole('spinbutton', { name: 'Duration', exact: true });
  const revision = (await state(request)).revision;
  await input.focus(); await input.press('Tab');
  expect((await state(request)).revision).toBe(revision);
  await input.fill('99'); await input.press('Escape');
  expect((await state(request)).postMatch.data.durationSeconds).toBe(1986);
  expect((await state(request)).activeOutput).toBe('post-match'); await expect(input).toHaveValue('1986');
  await input.fill('1999'); await input.press('Enter');
  await expect.poll(async () => (await state(request)).postMatch.data.durationSeconds).toBe(1999);
  expect((await state(request)).activeOutput).toBe('none'); expect((await state(request)).postMatch.status).toBe('review');
});
test('F10/F17 manual entry starts blank and permits names and champions', async ({ page, request }) => {
  await loaded(page); await page.getByRole('button', { name: 'TẠO BÁO CÁO TRỐNG', exact: true }).click();
  const duration = page.getByRole('spinbutton', { name: 'Duration', exact: true }); await expect(duration).toHaveValue('');
  const name = page.getByLabel('blue player 1 name', { exact: true }); await name.fill('Đặng Văn Lâm'); await name.press('Enter');
  await expect.poll(async () => (await state(request)).postMatch.data.teams.blue.players[0].player).toBe('Đặng Văn Lâm');
  const champion = page.getByRole('combobox', { name: 'blue player 1 champion', exact: true }); await champion.fill('Ashe'); await champion.press('Enter');
  await expect.poll(async () => (await state(request)).postMatch.data.teams.blue.players[0].championId).toBe('Ashe');
  await page.getByRole('button', { name: 'APPROVE RESULT' }).click(); await expect(page.getByRole('alert').first()).toContainText('Điền trường thiếu');
});
test('failed saves restore the last server value and leave live output unchanged', async ({ page, request }) => {
  await liveFixture(request); await loaded(page);
  await page.route('**/api/actions', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SAVE_FAILED', message: 'Không lưu được dữ liệu.', fields: [] }) }));
  const duration = page.getByRole('spinbutton', { name: 'Duration', exact: true }); await duration.fill('99'); await duration.press('Enter'); await expect(duration).toHaveValue('1986');
  const name = page.getByLabel('blue player 1 name', { exact: true }); const original = await name.inputValue(); await name.fill('Rejected'); await name.press('Enter'); await expect(name).toHaveValue(original);
  const champion = page.getByRole('combobox', { name: 'blue player 1 champion', exact: true }); const previous = await champion.inputValue(); await champion.fill('Ashe'); await champion.press('Enter'); await expect(champion).toHaveValue(previous);
  await expect(page.getByRole('alert').first()).toContainText('Không lưu được dữ liệu'); expect((await state(request)).activeOutput).toBe('post-match');
});
test('F08 unified and dedicated OBS outputs obey live state', async ({ page, request, context }) => {
  const dedicated = await context.newPage(); await page.goto('/overlay'); await dedicated.goto('/overlay/post-match');
  await expect(page.locator('.overlay-shell')).toHaveClass(/is-hidden/); await expect(dedicated.locator('.post-overlay')).toHaveClass(/is-hidden/);
  await liveFixture(request);
  await expect(page.locator('.post-overlay')).toHaveClass(/is-visible/); await expect(dedicated.locator('.post-overlay')).toHaveClass(/is-visible/);
  await action(request, { type: 'SET_OUTPUT', output: 'none' });
  await expect(dedicated.locator('.post-overlay')).toHaveClass(/is-hidden/);
  await dedicated.close();
});
test('F14 frozen server messages hide OBS within five seconds', async ({ page, request }) => {
  let paused = false;
  await page.routeWebSocket('**/ws', socket => { const server = socket.connectToServer(); server.onMessage(message => { if (!paused) socket.send(message); }); });
  await liveFixture(request); await page.goto('/overlay'); await expect(page.locator('.post-overlay')).toHaveClass(/is-visible/);
  paused = true;
  await expect(page.locator('.post-overlay')).toHaveClass(/is-hidden/, { timeout: 6200 });
  await expect(page.locator('.post-overlay')).toHaveCSS('opacity', '0');
});
test('F14 delayed HTTP response cannot overwrite a newer WebSocket revision', async ({ page, request }) => {
  await loaded(page, '/control/draft');
  await page.route('**/api/actions', async route => { const response = await route.fetch(); await new Promise(resolve => setTimeout(resolve, 800)); await route.fulfill({ response }); });
  const matchName = page.getByLabel('Match name', { exact: true }); await matchName.fill('Older HTTP'); await matchName.press('Enter');
  await expect.poll(async () => (await state(request)).match.matchName).toBe('Older HTTP');
  await action(request, { type: 'SET_MATCH', field: 'matchName', value: 'Newest WS' });
  await expect(matchName).toHaveValue('Newest WS');
  await page.waitForTimeout(1000); await expect(matchName).toHaveValue('Newest WS');
});
test('F14 heartbeat catches a missed state message', async ({ page, request }) => {
  let dropState = false;
  await page.routeWebSocket('**/ws', socket => { const server = socket.connectToServer(); server.onMessage(message => { if (!dropState || JSON.parse(String(message)).type !== 'state') socket.send(message); }); });
  await loaded(page, '/control/draft'); dropState = true;
  await action(request, { type: 'SET_MATCH', field: 'matchName', value: 'Recovered from heartbeat' });
  await expect(page.getByLabel('Match name', { exact: true })).toHaveValue('Recovered from heartbeat', { timeout: 4000 });
});
test('F14/F26 actual server crash restarts with a new epoch, saved data and hidden output', async ({ page, request }) => {
  const directory = path.resolve(`.codex-local/browser-restart-${Date.now()}`); const origin = 'http://127.0.0.1:4193';
  let child: ReturnType<typeof spawn> | undefined;
  const start = async () => {
    child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: { ...process.env, HOST: '127.0.0.1', PORT: '4193', LCU_DISABLED: '1', DRAFT_DATA_DIR: directory } });
    await expect.poll(async () => { try { return (await request.get(`${origin}/api/health`, { timeout: 300 })).status(); } catch { return 0; } }, { timeout: 10000 }).toBe(200);
  };
  const stop = async () => { if (child && child.exitCode === null) await new Promise<void>(resolve => { child!.once('exit', () => resolve()); child!.kill('SIGKILL'); }); };
  const command = async (data: unknown) => { const token = (await (await request.get(`${origin}/api/control-session`)).json()).token; expect((await request.post(`${origin}/api/actions`, { headers: { 'x-virtualhud-control': token }, data })).status()).toBe(200); };
  try {
    await start(); await command({ type: 'SET_TEAM', side: 'blue', field: 'name', value: 'Saved through crash' });
    await command({ type: 'POST_MATCH_LOAD_FIXTURE' }); await command({ type: 'POST_MATCH_SET_READY', value: true }); await command({ type: 'SET_OUTPUT', output: 'post-match' });
    const epoch = (await (await request.get(`${origin}/api/state`)).json()).serverInstanceId;
    await page.goto(`${origin}/overlay`); await expect(page.locator('.post-overlay')).toHaveClass(/is-visible/);
    await stop(); await start();
    const restored = await (await request.get(`${origin}/api/state`)).json(); expect(restored.serverInstanceId).not.toBe(epoch); expect(restored.activeOutput).toBe('none'); expect(restored.postMatch.status).toBe('review'); expect(restored.match.teams.blue.name).toBe('Saved through crash');
    await expect(page.locator('.overlay-shell')).toHaveClass(/is-hidden/, { timeout: 5000 });
    await command({ type: 'POST_MATCH_SET_READY', value: true }); await command({ type: 'SET_OUTPUT', output: 'post-match' });
    await expect(page.locator('.post-overlay')).toHaveClass(/is-visible/); await expect(page.locator('.post-team--blue strong')).toHaveText('Saved through crash');
  } finally { await stop(); }
});
test('F18 changed shared metadata removes approval', async ({ page, request }) => {
  await liveFixture(request); await loaded(page, '/control/draft');
  const name = page.getByLabel('Team name', { exact: true }).first(); await name.fill('Đội mới'); await name.press('Enter');
  await expect.poll(async () => (await state(request)).postMatch.status).toBe('review'); expect((await state(request)).activeOutput).toBe('none');
});
for (const width of [375, 390, 768, 1024, 1440, 1920]) {
  test(`F20/F21 controls remain visible and labeled at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 }); await loaded(page, '/control/draft');
    await expect(page.getByText('Server online', { exact: true })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Seconds', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Timer', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('spinbutton', { name: 'Drag', exact: true }).count()).toBe(0);
    await action(request, { type: 'POST_MATCH_LOAD_FIXTURE' }); await loaded(page);
    const labels = await page.getByRole('spinbutton').evaluateAll(inputs => inputs.map(input => input.getAttribute('aria-label')));
    expect(new Set(labels).size).toBe(labels.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByLabel('blue player 1 name', { exact: true }).evaluate(input => input.getBoundingClientRect().width)).toBeGreaterThan(90);
    await mkdir('test-results/playwright', { recursive: true }); await page.screenshot({ path: `test-results/playwright/post-${width}.png`, fullPage: true });
  });
}
test('F27 missing Lens fonts use bundled Vietnamese fallback', async ({ page }) => {
  await page.route('**/api/fonts', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ faces: [] }) }));
  await page.route('**/fonts/lens-grotesk/**', route => route.fulfill({ status: 404, contentType: 'text/plain', body: '' }));
  await loaded(page, '/control/draft');
  expect(await page.locator('html').getAttribute('data-lens')).toBeNull();
  for (const weight of [400, 500, 600, 700]) expect(await page.evaluate(async weight => (await document.fonts.load(`${weight} 16px "Be Vietnam Pro"`, 'Đặng Văn Lâm')).length > 0, weight)).toBe(true);
  expect(await page.locator('.workspace-heading p').evaluate(element => getComputedStyle(element).fontWeight)).toBe('400');
});

test('broadcast fonts load Vietnamese locally; dashboard keeps its existing family', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loaded(page, '/control');
  const dashboardFamily = await page.locator('.control-shell').evaluate(element => getComputedStyle(element).fontFamily);
  await action(request, { type: 'RUN_DEMO_STEP' });
  await action(request, { type: 'SET_TEAM', side: 'blue', field: 'name', value: 'ĐỘI TUYỂN VIỆT NAM' });
  await page.goto('/preview/draft');
  await expect(page.locator('.pick-player').first()).toBeVisible();
  for (const family of ['Unbounded', 'Archivo']) {
    expect(await page.evaluate(async family => (await document.fonts.load(`600 24px "${family}"`, 'Đặng Hữu Trung Ắ Ằ Ẩ Ễ Ộ Ỡ Ự')).length, family)).toBeGreaterThan(0);
  }
  await expect(page.locator('.center-monogram').first()).toHaveCSS('font-family', 'Unbounded, "Be Vietnam Pro", sans-serif');
  await expect(page.locator('.pick-player').first()).toHaveCSS('font-family', 'Archivo, "Be Vietnam Pro", sans-serif');
  await page.screenshot({ path: 'test-results/playwright/obs-draft-fonts-1920.png' });
  await action(request, { type: 'POST_MATCH_LOAD_FIXTURE' });
  await page.goto('/preview/post-match');
  await expect(page.locator('.post-duration strong')).toHaveCSS('font-family', 'Unbounded, "Be Vietnam Pro", sans-serif');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.post-team--blue > b')).toHaveText('18');
  await expect(page.locator('.post-team--red > b')).toHaveText('6');
  await page.screenshot({ path: 'test-results/playwright/obs-post-fonts-1920.png' });
  await loaded(page, '/control');
  expect(await page.locator('.control-shell').evaluate(element => getComputedStyle(element).fontFamily)).toBe(dashboardFamily);
});
test('F28 valid controls have no critical accessibility failures or runtime errors', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await action(request, { type: 'POST_MATCH_LOAD_FIXTURE' }); await loaded(page);
  const audit = await new AxeBuilder({ page }).analyze();
  await writeFile('test-results/accessibility-results.json', JSON.stringify({ violations: audit.violations.map(item => ({ id: item.id, impact: item.impact, count: item.nodes.length, targets: item.nodes.map(node => node.target) })) }, null, 2));
  expect(audit.violations.filter(item => ['critical', 'serious'].includes(item.impact ?? '')).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]); expect(errors).toEqual([]);
});
test('OBS composition fits 1920 x 1080 with no runtime errors', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 }); await liveFixture(request); await page.goto('/overlay');
  await expect(page.locator('.post-overlay')).toHaveClass(/is-visible/);
  await expect(page.locator('.post-overlay')).toHaveCSS('opacity', '1');
  await expect(page.locator('.post-team--blue > b')).toHaveText('18');
  await expect(page.locator('.post-team--red > b')).toHaveText('6');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: 'test-results/playwright/obs-post-1920.png' }); expect(errors).toEqual([]);
  await action(request, { type: 'SET_OUTPUT', output: 'none' }); await expect(page.locator('.overlay-shell')).toHaveCSS('opacity', '0');
  const pixels = await sharp(await page.screenshot({ omitBackground: true })).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  expect(pixels[3]).toBe(0);
});
test('unknown routes show a clear missing-page screen', async ({ page }) => {
  await page.goto('/not-a-route'); await expect(page.getByRole('heading', { name: 'Không tìm thấy trang.' })).toBeVisible();
});
