import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

async function action(request: APIRequestContext, command: unknown) {
  const { token } = await (await request.get('/api/control-session')).json();
  const response = await request.post('/api/actions', { headers: { 'x-virtualhud-control': token }, data: command });
  expect(response.ok(), await response.text()).toBe(true);
}

// Capture frames before issuing the command. Assertions can observe the actual
// overlap, rather than racing the network to catch a short transition.
async function capture(page: Page, request: APIRequestContext, selector: string, commands: unknown[]) {
  const { token } = await (await request.get('/api/control-session')).json();
  return page.locator(selector).first().evaluate(async (root, { token, commands }) => {
    const frames: { opacity: number; width: number; height: number; layers: { opacity: number; present: boolean; src: string | null; text: string; hidden: boolean }[]; veil: number; filter: string }[] = [];
    const start = performance.now();
    const recording = new Promise<void>(resolve => {
      function frame() {
        const box = root.getBoundingClientRect();
        const veil = root.querySelector('.draft-selection-veil');
        const image = root.querySelector('img');
        frames.push({ opacity: Number(getComputedStyle(root).opacity), width: box.width, height: box.height,
          layers: Array.from(root.querySelectorAll('.draft-swap-layer'), node => ({ opacity: Number(getComputedStyle(node).opacity), present: node.getAttribute('data-present') === 'true', src: node.querySelector('img')?.getAttribute('src') ?? null, text: node.textContent ?? '', hidden: node.getAttribute('aria-hidden') === 'true' })),
          veil: veil ? Number(getComputedStyle(veil).opacity) : 0, filter: image ? getComputedStyle(image).filter : '',
        });
        if (performance.now() - start < 700) requestAnimationFrame(frame); else resolve();
      }
      frame();
    });
    for (const command of commands) {
      const response = await fetch('/api/actions', { method: 'POST', headers: { 'content-type': 'application/json', 'x-virtualhud-control': token }, body: JSON.stringify(command) });
      if (!response.ok) throw new Error(await response.text());
    }
    await recording;
    return frames;
  }, { token, commands });
}

test.beforeEach(async ({ request, page }) => {
  await action(request, { type: 'RESET' });
  await action(request, { type: 'SET_OVERRIDE', value: true });
  await action(request, { type: 'SET_PHASE', phase: 'pick-1', activeSide: 'blue' });
  await page.setViewportSize({ width: 1920, height: 1080 });
});

function expectCrossfade(frames: Awaited<ReturnType<typeof capture>>) {
  expect(frames.some(frame => frame.layers.some(layer => !layer.present && layer.hidden) && frame.layers.some(layer => layer.present && layer.opacity > .05 && layer.opacity < .95))).toBe(true);
  for (const frame of frames) {
    expect(frame.width).toBeCloseTo(frames[0].width, 1);
    expect(frame.height).toBeCloseTo(frames[0].height, 1);
  }
}

test('empty, hover, changed champion, lock, clear, undo and redo stay smooth', async ({ page, request }) => {
  await page.goto('/preview/draft');
  const card = page.locator('.pick-row--blue .pick-card').first();
  const selector = '.pick-row--blue .pick-card > .draft-artwork';
  await expect(card).toHaveAttribute('data-selection', 'empty');
  const first = await capture(page, request, selector, [{ type: 'SET_PICK', side: 'blue', index: 0, championId: 'Aatrox', locked: false }]);
  expectCrossfade(first);
  const swap = await capture(page, request, selector, [{ type: 'SET_PICK', side: 'blue', index: 0, championId: 'Ashe', locked: false }]);
  expectCrossfade(swap);
  await expect(card.getByRole('img', { name: 'Ashe', exact: true })).toHaveCount(1);
  const lock = await capture(page, request, '.pick-row--blue .pick-card', [{ type: 'SET_PICK', side: 'blue', index: 0, championId: 'Ashe', locked: true }]);
  expect(lock.some(frame => frame.veil > .05 && frame.veil < .95)).toBe(true);
  expect(lock.at(-1)!.veil).toBe(0);
  const clear = await capture(page, request, selector, [{ type: 'SET_PICK', side: 'blue', index: 0, championId: null }]);
  expectCrossfade(clear);
  await expect(card).toHaveAttribute('data-selection', 'empty');
  expectCrossfade(await capture(page, request, selector, [{ type: 'UNDO' }]));
  await expect(card.getByRole('img', { name: 'Ashe', exact: true })).toHaveCount(1);
  expectCrossfade(await capture(page, request, selector, [{ type: 'REDO' }]));
  await expect(card.locator('.draft-artwork img')).toHaveCount(0);
});

test('slow superseded artwork cannot overwrite the latest hover; failed artwork clears safely', async ({ page, request }) => {
  await action(request, { type: 'SET_PICK', side: 'blue', index: 0, championId: 'Aatrox', locked: false });
  await page.goto('/preview/draft');
  const art = page.locator('.pick-row--blue .draft-artwork').first();
  await expect(art.locator('[data-present="true"] img')).toHaveAttribute('src', /\/loading\/Aatrox\.jpg$/);
  let release!: () => void, arrive!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const arrived = new Promise<void>(resolve => { arrive = resolve; });
  await page.route('**/loading/Ahri.jpg', async route => { arrive(); await held; await route.continue(); });
  await action(request, { type: 'SET_PICK', side: 'blue', index: 0, championId: 'Ahri', locked: false });
  await arrived;
  await expect(art).toHaveAttribute('aria-busy', 'true');
  await expect(art.locator('[data-present="true"] img')).toHaveAttribute('src', /\/loading\/Aatrox\.jpg$/);
  await action(request, { type: 'SET_PICK', side: 'blue', index: 0, championId: 'Ashe', locked: false });
  await expect(art.locator('[data-present="true"] img')).toHaveAttribute('src', /\/loading\/Ashe\.jpg$/);
  const response = page.waitForResponse(result => result.url().endsWith('/loading/Ahri.jpg'));
  release(); await (await response).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(art.locator('[data-present="true"] img')).toHaveAttribute('src', /\/loading\/Ashe\.jpg$/);
  await page.route('**/loading/Ziggs.jpg', route => route.abort());
  await action(request, { type: 'SET_PICK', side: 'blue', index: 0, championId: 'Ziggs', locked: false });
  await expect(art).toHaveAttribute('aria-busy', 'false');
  await expect(art.locator('img')).toHaveCount(0);
  await expect(art.locator('.pick-empty')).toHaveText('P1');
});

test('ban hover, confirmation, skipped ban and reset animate without moving slots', async ({ page, request }) => {
  await action(request, { type: 'SET_PHASE', phase: 'ban-1', activeSide: 'red' });
  await page.goto('/preview/draft');
  const selector = '.ban-group--red .ban-tile';
  expectCrossfade(await capture(page, request, selector, [{ type: 'SET_BAN', side: 'red', index: 0, championId: 'Ahri', locked: false }]));
  const locked = await capture(page, request, selector, [{ type: 'SET_BAN', side: 'red', index: 0, championId: 'Ahri', locked: true }]);
  expect(locked.some(frame => /grayscale\(0\./.test(frame.filter))).toBe(true);
  expect(locked.at(-1)!.filter).toBe('saturate(0.7) grayscale(1) brightness(0.8)');
  expectCrossfade(await capture(page, request, selector, [{ type: 'SET_BAN', side: 'red', index: 0, championId: null, locked: true }]));
  const ban = page.locator(selector).first();
  await expect(ban).toHaveAttribute('data-selection', 'skipped');
  await expect(ban.locator('.ban-skip')).toHaveText('—');
  expectCrossfade(await capture(page, request, selector, [{ type: 'RESET' }]));
  await expect(ban).toHaveAttribute('data-selection', 'empty');
});

test('turn, phase, player, team identity and score transitions keep the band fixed', async ({ page, request }) => {
  await page.goto('/preview/draft');
  expectCrossfade(await capture(page, request, '.draft-turn', [{ type: 'SET_PHASE', phase: 'ban-2', activeSide: 'red' }]));
  expectCrossfade(await capture(page, request, '.draft-match-label', [{ type: 'SET_PHASE', phase: 'pick-2', activeSide: 'red' }]));
  expectCrossfade(await capture(page, request, '.pick-player-line', [{ type: 'SET_PLAYER', side: 'blue', index: 0, value: 'Nguyễn Văn An' }]));
  expectCrossfade(await capture(page, request, '.team-identity--blue .center-team-code', [{ type: 'SET_TEAM', side: 'blue', field: 'code', value: 'WSG' }]));
  expectCrossfade(await capture(page, request, '.team-identity--blue .center-logo', [{ type: 'SET_TEAM', side: 'blue', field: 'logoUrl', value: '/teams/white-sugar.png' }]));
  await action(request, { type: 'SET_SCORE', side: 'blue', value: 1 });
  await expect(page.locator('.score-pips--blue .is-won')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expectCrossfade(await capture(page, request, '.score-pips--blue', [{ type: 'SET_BEST_OF', value: 5 }]));
  expectCrossfade(await capture(page, request, '.draft-turn', [{ type: 'SET_PHASE', phase: 'complete' }]));
  await expect(page.getByLabel('Draft hoàn tất', { exact: true })).toBeVisible();
  const band = (await page.locator('.broadcast-spine').boundingBox())!;
  expect(band.y + band.height).toBe(1080); expect(band.height).toBe(336);
});

test('normal reveals and hides fade; unified output preserves the draft exit during handoff', async ({ page, request }) => {
  await page.goto('/overlay');
  const overlay = page.locator('.overlay-shell');
  await expect(overlay).toHaveCSS('opacity', '0');
  const reveal = await capture(page, request, '.overlay-shell', [{ type: 'SET_OUTPUT', output: 'draft' }]);
  expect(reveal.some(frame => frame.opacity > .05 && frame.opacity < .95)).toBe(true);
  expect(reveal.at(-1)!.opacity).toBe(1);
  const hide = await capture(page, request, '.overlay-shell', [{ type: 'SET_OUTPUT', output: 'none' }]);
  expect(hide.some(frame => frame.opacity > .05 && frame.opacity < .95)).toBe(true);
  await action(request, { type: 'SET_OUTPUT', output: 'draft' });
  await expect(overlay).toHaveCSS('opacity', '1');
  await action(request, { type: 'POST_MATCH_LOAD_FIXTURE' });
  await action(request, { type: 'POST_MATCH_SET_READY', value: true });
  const handoff = await capture(page, request, '.overlay-shell', [{ type: 'SET_OUTPUT', output: 'post-match' }]);
  expect(handoff.some(frame => frame.opacity > .05 && frame.opacity < .95)).toBe(true);
  await expect(overlay).toHaveCSS('opacity', '0');
  await expect(page.locator('.post-overlay')).toHaveCSS('opacity', '1');
  expect((await page.locator('.post-overlay').boundingBox())!.y).toBe(0);
});

test('reduced motion updates live; hidden drafts and repeated ticks do not replay transitions', async ({ page, request }) => {
  await action(request, { type: 'SET_PICK', side: 'blue', index: 0, championId: 'Ashe', locked: false });
  await page.goto('/overlay');
  const pulse = page.locator('.pick-row--blue .draft-selection-breathe').first();
  await expect(pulse).toHaveCSS('animation-play-state', 'paused');
  await action(request, { type: 'SET_OUTPUT', output: 'draft' });
  await expect(pulse).toHaveCSS('animation-play-state', 'running');
  await expect(page.locator('.pick-row--blue .draft-artwork [data-present="true"] img').first()).toHaveAttribute('src', /\/loading\/Ashe\.jpg$/);
  await expect(page.locator('.pick-row--blue .draft-artwork').first().locator('.draft-swap-layer')).toHaveCount(1);
  const ticks = await capture(page, request, '.pick-row--blue .pick-card > .draft-artwork', [{ type: 'SET_TIMER', timerMs: 20000 }, { type: 'SET_TIMER', timerMs: 19000 }]);
  expect(ticks.every(frame => frame.layers.length === 1)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pulse).toHaveCSS('animation-name', 'none');
  const reduced = await capture(page, request, '.draft-match-label', [{ type: 'SET_PHASE', phase: 'ban-2' }]);
  expect(reduced.every(frame => frame.layers.every(layer => layer.opacity === 0 || layer.opacity === 1))).toBe(true);
  const hidden = await capture(page, request, '.overlay-shell', [{ type: 'SET_OUTPUT', output: 'none' }]);
  expect(hidden.every(frame => frame.opacity === 0 || frame.opacity === 1)).toBe(true);
});
