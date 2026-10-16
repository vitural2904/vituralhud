import { test, expect, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';

async function action(request: APIRequestContext, command: unknown) {
  const { token } = await (await request.get('/api/control-session')).json();
  const response = await request.post('/api/actions', { headers: { 'x-virtualhud-control': token }, data: command });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
test.beforeEach(async ({ request }) => { await action(request, { type: 'RESET' }); });

test('simple draft band matches the reference structure; vertical Vietnamese names stay inside cards', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await action(request, { type: 'RUN_DEMO_STEP' });
  await action(request, { type: 'SET_OVERRIDE', value: true });
  await action(request, { type: 'SET_PHASE', phase: 'pick-2', activeSide: 'red' });
  await action(request, { type: 'TOGGLE_TIMER' });
  await action(request, { type: 'SET_TEAM', side: 'blue', field: 'code', value: 'WSG' });
  await action(request, { type: 'SET_TEAM', side: 'blue', field: 'logoUrl', value: '/teams/white-sugar.png' });
  await action(request, { type: 'SET_TEAM', side: 'red', field: 'code', value: 'RDT' });
  await action(request, { type: 'SET_TEAM', side: 'red', field: 'logoUrl', value: '/teams/red-dot.png' });
  await action(request, { type: 'SET_PLAYER', side: 'blue', index: 0, value: 'Nguyễn Huỳnh Trường Giàu' });
  const bans = ['Ahri', 'Ashe', 'Ziggs', 'Syndra', 'Thresh'];
  for (const side of ['blue', 'red']) for (let index = 0; index < 5; index++) await action(request, { type: 'SET_BAN', side, index, championId: bans[index] });
  await page.goto('/preview/draft');
  await expect(page.locator('.pick-card')).toHaveCount(10);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined))); });
  expect(await page.locator('.timer, .pick-champion, .team-footers').count()).toBe(0);
  const layout = await page.locator('.pick-card').evaluateAll(cards => cards.map(card => {
    const bounds = card.getBoundingClientRect();
    const name = card.querySelector('.pick-player')!;
    const label = card.querySelector('.pick-player-line')!;
    const role = card.querySelector('.pick-role')!;
    const nameBounds = label.getBoundingClientRect(), roleBounds = role.getBoundingClientRect();
    return { inside: nameBounds.top >= bounds.top - 1 && nameBounds.bottom <= bounds.bottom + 1 && nameBounds.left >= bounds.left + 7 && nameBounds.right <= bounds.right, rotated: getComputedStyle(label).transform, gap: roleBounds.left - nameBounds.right, font: parseFloat(getComputedStyle(name).fontSize), roleSize: roleBounds.width, card: bounds.toJSON(), label: nameBounds.toJSON(), origin: getComputedStyle(label).transformOrigin };
  }));
  for (const card of layout) {
    expect(card.inside, JSON.stringify(card)).toBe(true); expect(card.rotated).toBe('matrix(0, -1, 1, 0, 0, 0)');
    expect(card.gap).toBeGreaterThanOrEqual(6); expect(card.gap).toBeLessThanOrEqual(12);
    expect(card.font).toBe(24); expect(card.roleSize).toBe(32);
  }
  expect(await page.locator('.pick-player .draft-swap-layer[data-present="true"]').first().evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  const bounds = (await page.locator('.broadcast-spine').boundingBox())!;
  expect(bounds.height).toBe(336); expect(bounds.y + bounds.height).toBe(1080);
  const leftBans = (await page.locator('.ban-group--blue').boundingBox())!;
  const rightBans = (await page.locator('.ban-group--red').boundingBox())!;
  expect(rightBans.x - (leftBans.x + leftBans.width)).toBeGreaterThanOrEqual(320);
  expect((await page.locator('.ban-tile').first().boundingBox())!.width).toBe(68);
  expect((await page.locator('.draft-countdown').boundingBox())!.height).toBe(8);
  const screenshot = await page.screenshot({ path: 'test-results/playwright/draft-lcs-full-1920.png', omitBackground: true });
  for (const point of [{ left: 960, top: 100 }, { left: 960, top: Math.ceil(bounds.y + 10) }]) {
    const pixel = await sharp(screenshot).ensureAlpha().extract({ ...point, width: 1, height: 1 }).raw().toBuffer();
    expect(pixel[3]).toBe(0);
  }
  await page.screenshot({ path: 'test-results/playwright/draft-lcs-band-1920.png', clip: bounds, omitBackground: true });
  await action(request, { type: 'SET_PHASE', phase: 'complete' });
  await expect(page.getByLabel('Draft hoàn tất', { exact: true })).toBeVisible();
  await expect(page.locator('.draft-countdown')).toHaveAttribute('aria-valuenow', '0');
  expect(errors).toEqual([]);
});

test('countdown shrinks continuously from both ends, freezes, resets and disappears at zero', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await action(request, { type: 'RUN_DEMO_STEP' });
  await action(request, { type: 'SET_OVERRIDE', value: true });
  await action(request, { type: 'SET_TIMER', timerMs: 10000 });
  await page.goto('/preview/draft');
  const timer = page.getByRole('progressbar', { name: 'Thời gian lượt ban/pick' });
  await expect(timer).toBeVisible();
  await expect(timer).toHaveAttribute('aria-valuetext', /Đang chạy/);
  const motion = await page.locator('.draft-countdown__bar').evaluate(async element => {
    // Let the initial state hydration's 200ms refill settle before measuring countdown.
    await new Promise(resolve => setTimeout(resolve, 250));
    const a = element.getBoundingClientRect();
    await new Promise(resolve => setTimeout(resolve, 120));
    const b = element.getBoundingClientRect();
    return { first: { x: a.x, width: a.width }, second: { x: b.x, width: b.width } };
  });
  expect(motion.first.width - motion.second.width).toBeGreaterThan(5);
  expect(motion.second.x).toBeGreaterThan(motion.first.x);
  for (const box of [motion.first, motion.second]) expect(box.x + box.width / 2).toBeCloseTo(960, 1);
  await action(request, { type: 'TOGGLE_TIMER' });
  await expect(timer).toHaveAttribute('aria-valuetext', /Tạm dừng/);
  const paused = await page.locator('.draft-countdown__bar').evaluate(async element => {
    const before = element.getBoundingClientRect().width;
    await new Promise(resolve => setTimeout(resolve, 250));
    return { before, after: element.getBoundingClientRect().width };
  });
  expect(paused.after).toBeCloseTo(paused.before, 1);
  await action(request, { type: 'SET_TIMER', timerMs: 10000 });
  await expect.poll(async () => (await page.locator('.draft-countdown__bar').boundingBox())!.width).toBe(1920);
  await action(request, { type: 'TOGGLE_TIMER' });
  await expect(timer).toHaveAttribute('aria-valuetext', /Đang chạy/);
  await action(request, { type: 'SET_TIMER', timerMs: 0 });
  await expect(timer).toHaveAttribute('aria-valuenow', '0');
  await expect.poll(async () => (await page.locator('.draft-countdown__bar').boundingBox())!.width).toBe(0);
});

test('reset flows outward through intermediate frames while paused, then resumes inward', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await action(request, { type: 'RUN_DEMO_STEP' });
  await action(request, { type: 'SET_OVERRIDE', value: true });
  await action(request, { type: 'SET_TIMER', timerMs: 4000 });
  await page.goto('/preview/draft');
  const bar = page.locator('.draft-countdown__bar');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', /Đang chạy/);
  // Initial hydration can refill outward. Measure only after that 200ms pass;
  // otherwise a small width can belong to the entrance rather than countdown.
  await bar.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThan(1200);
  await action(request, { type: 'TOGGLE_TIMER' });
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', /Tạm dừng/);
  const { token } = await (await request.get('/api/control-session')).json();
  const samples = await bar.evaluate(async (element, token: string) => {
    const frames: { width: number; center: number }[] = [];
    const start = performance.now();
    const sampling = new Promise<void>(resolve => {
      function sample() {
        const bounds = element.getBoundingClientRect();
        frames.push({ width: bounds.width, center: bounds.x + bounds.width / 2 });
        if (performance.now() - start < 500) requestAnimationFrame(sample);
        else resolve();
      }
      sample();
    });
    const response = await fetch('/api/actions', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-virtualhud-control': token },
      body: JSON.stringify({ type: 'SET_TIMER', timerMs: 4000 }),
    });
    if (!response.ok) throw new Error(await response.text());
    await sampling;
    return frames;
  }, token);
  expect(samples[0].width).toBeLessThan(1300);
  expect(samples.at(-1)!.width).toBe(1920);
  expect(samples.filter(sample => sample.width > samples[0].width + 1 && sample.width < 1919).length).toBeGreaterThan(3);
  for (let index = 0; index < samples.length; index++) {
    expect(samples[index].center).toBeCloseTo(960, 1);
    if (index) expect(samples[index].width).toBeGreaterThanOrEqual(samples[index - 1].width - .01);
  }
  await action(request, { type: 'TOGGLE_TIMER' });
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThan(1900);
});

test('tentative picks and bans breathe gently; lock confirmation stops the pulse', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await action(request, { type: 'RUN_DEMO_STEP' });
  await action(request, { type: 'SET_OVERRIDE', value: true });
  await action(request, { type: 'SET_PHASE', phase: 'pick-1', activeSide: 'blue' });
  await action(request, { type: 'TOGGLE_TIMER' });
  await action(request, { type: 'SET_PICK', side: 'blue', index: 0, championId: 'Aatrox', locked: false });
  await action(request, { type: 'SET_PICK', side: 'blue', index: 1, championId: null, locked: false });
  await action(request, { type: 'SET_PICK', side: 'red', index: 0, championId: 'Syndra', locked: false });
  await action(request, { type: 'SET_BAN', side: 'blue', index: 0, championId: 'Ashe', locked: false });
  await action(request, { type: 'SET_BAN', side: 'red', index: 0, championId: 'Ahri' });
  await page.goto('/preview/draft');
  const pick = page.locator('.pick-row--blue .pick-card').first();
  const ban = page.locator('.ban-group--blue .ban-tile').first();
  await expect(pick).toHaveAttribute('data-selection', 'hover');
  await expect(ban).toHaveAttribute('aria-label', /Chưa khóa ban/);
  await expect(page.locator('.overlay-shell')).toHaveAttribute('data-draft-active', 'true');
  await expect(page.locator('.pick-row--blue .pick-card').nth(1)).toHaveAttribute('data-selection', 'empty');
  const hover = await page.locator('[data-selection="hover"]').evaluateAll(elements => elements.map(element => {
    const pulse = element.querySelector('.draft-selection-breathe')!;
    const animation = pulse.getAnimations().find(item => 'animationName' in item && item.animationName === 'draft-selection-breathe');
    if (!animation) throw new Error('Missing hover pulse');
    animation.pause(); animation.currentTime = 0;
    const low = Number(getComputedStyle(pulse).opacity);
    animation.currentTime = 900;
    const high = Number(getComputedStyle(pulse).opacity);
    const label = element.querySelector('.pick-player');
    return { low, high, duration: animation.effect!.getTiming().duration, labelOpacity: label ? getComputedStyle(label).opacity : null };
  }));
  expect(hover).toHaveLength(3); // Includes the other side's exposed pick intent.
  for (const sample of hover) {
    expect(sample.low).toBeCloseTo(.28); expect(sample.high).toBeCloseTo(.8);
    expect(sample.duration).toBe(1800);
    if (sample.labelOpacity) expect(sample.labelOpacity).toBe('1');
  }
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined))); });
  await page.screenshot({ path: 'test-results/playwright/draft-hover-states.png', clip: (await page.locator('.broadcast-spine').boundingBox())!, omitBackground: true });
  await action(request, { type: 'SET_PICK', side: 'blue', index: 0, championId: 'Aatrox', locked: true });
  await action(request, { type: 'SET_BAN', side: 'blue', index: 0, championId: 'Ashe', locked: true });
  for (const element of [pick, ban]) {
    await expect(element).toHaveAttribute('data-selection', 'locked');
    await expect(element.locator('.draft-selection-breathe')).toHaveCSS('animation-play-state', 'paused');
    await expect(element.locator('.draft-selection-veil')).toHaveCSS('opacity', '0');
  }
  await expect(ban.locator('img')).toHaveCSS('filter', 'saturate(0.7) grayscale(1) brightness(0.8)');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const remainingHover = page.locator('.pick-row--red .pick-card').first();
  await expect(remainingHover.locator('.draft-selection-breathe')).toHaveCSS('animation-name', 'none');
  await expect(remainingHover.locator('.draft-selection-breathe')).toHaveCSS('border-top-width', '2px');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await action(request, { type: 'SET_PHASE', phase: 'complete' });
  await expect(page.locator('.overlay-shell')).toHaveAttribute('data-draft-active', 'false');
  await expect(remainingHover.locator('.draft-selection-breathe')).toHaveCSS('animation-play-state', 'paused');
  await expect(remainingHover.locator('.draft-selection-veil')).toHaveCSS('opacity', '0');
});
