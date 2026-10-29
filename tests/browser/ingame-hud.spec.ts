import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/sponsors', route => route.fulfill({ json: { logos: [], intervalSeconds: 10 } }));
  await page.routeWebSocket('**/ws/ingame', socket => socket.send(JSON.stringify({
    connected: true, observedAt: new Date().toISOString(), gameTime: 100,
    players: [{ side: 'blue', name: 'Caster test', championName: 'Ahri', level: 5, kills: 1, deaths: 0, assists: 2, cs: 30, isDead: false, respawnTimer: 0, items: [{ id: 3340, count: 1, slot: 6 }], summonerSpells: [{ name: 'Flash', icon: '/summoner-spells/SummonerFlash.png' }, { name: 'Heal', icon: '/summoner-spells/SummonerHeal.png' }] }], events: [],
  })));
});

test('shows recorded summoner spell icons and marks the ultimate as unknown', async ({ page }) => {
  await page.goto('/overlay/ingame');
  const player = page.locator('.ig-player--blue').first();
  await expect(player.locator('.ig-player-name')).toContainText('Caster test');
  const spells = player.locator('.ig-spells .ig-spell img');
  await expect(spells).toHaveCount(2);
  await expect(spells.nth(0)).toHaveAttribute('src', '/summoner-spells/SummonerFlash.png');
  await expect(spells.nth(1)).toHaveAttribute('src', '/summoner-spells/SummonerHeal.png');
  await expect.poll(() => spells.nth(0).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(player.locator('.ig-ultimate')).toContainText('—');
});

test('ingame HUD preserves item slots, loads local images and hides an empty sponsor panel', async ({ page }) => {
  await page.route('https://ddragon.leagueoflegends.com/**', route => route.abort());
  await page.goto('/overlay/ingame');
  await expect(page.locator('.ig-player-name').first()).toContainText('Caster test');
  await expect(page.locator('.ig-player').first().locator('.ig-item')).toHaveCount(7);
  const image = page.locator('.ig-player').first().locator('.ig-item').nth(6).locator('img');
  await expect(image).toHaveAttribute('src', /\/items\/versions\/.*\/3340\.png$/);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.sponsor-display')).toHaveCount(0);
  expect(await page.locator('.ig-sponsor').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
});

test('ingame HUD shows item ID when local and remote images fail', async ({ page }) => {
  await page.route('**/items/versions/**/3340.png', route => route.abort());
  await page.route('https://ddragon.leagueoflegends.com/**', route => route.abort());
  await page.goto('/overlay/ingame');
  await expect(page.locator('.ig-player').first().locator('.ig-item').nth(6)).toContainText('3340');
});

test('roster mirrors item slots, levels and stats across the center', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/preview/ingame');
  const blue = page.locator('.ig-player--blue').first();
  const red = page.locator('.ig-player--red').first();
  const x = async (selector: ReturnType<typeof page.locator>) => (await selector.boundingBox())!.x;
  expect(await x(blue.locator('.ig-item').nth(0))).toBeLessThan(await x(blue.locator('.ig-item').nth(6)));
  expect(await x(red.locator('.ig-item').nth(0))).toBeGreaterThan(await x(red.locator('.ig-item').nth(6)));
  expect(await x(blue.locator('.ig-player-name'))).toBeLessThan(await x(blue.locator('.ig-player-stats')));
  expect(await x(red.locator('.ig-player-name'))).toBeGreaterThan(await x(red.locator('.ig-player-stats')));
  const bluePortrait = await blue.locator('.ig-portrait').boundingBox();
  const redPortrait = await red.locator('.ig-portrait').boundingBox();
  const blueLevel = await blue.locator('.ig-portrait strong').boundingBox();
  const redLevel = await red.locator('.ig-portrait strong').boundingBox();
  expect(Math.abs((bluePortrait!.x + bluePortrait!.width - blueLevel!.x - blueLevel!.width) - (redLevel!.x - redPortrait!.x))).toBeLessThan(2);
});

test('team labels leave the game scoreboard visible at 1920 by 1080', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/preview/ingame');
  const blue = await page.locator('.ig-team--blue').boundingBox();
  const red = await page.locator('.ig-team--red').boundingBox();
  expect(blue).not.toBeNull(); expect(red).not.toBeNull();
  expect(blue!.x).toBeCloseTo(295, 0);
  expect(blue!.x + blue!.width).toBeLessThan(475);
  expect(red!.x).toBeGreaterThan(1440);
  expect(red!.x + red!.width).toBeCloseTo(1625, 0);
  expect(blue!.height).toBeCloseTo(70, 0);
  expect(await page.locator('.ig-top').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('.ig-scoreline, .ig-clock')).toHaveCount(0);
  const label = page.locator('.ig-team--blue b');
  await expect(label).toHaveCSS('font-weight', '900');
  await expect(label).toHaveCSS('font-style', 'normal');
  const loaded = await page.evaluate(async () => (await document.fonts.load('normal 900 32px "Broadcast Barlow"')).length);
  expect(loaded).toBeGreaterThan(0);
  const fontResponse = await page.request.get('/fonts/barlow-condensed/BarlowCondensed-Black.ttf');
  expect(fontResponse.ok()).toBe(true);
});

test('team labels display the configured team logos', async ({ page, request }) => {
  const state = await (await request.get('/api/state')).json();
  state.match.teams.blue.logoUrl = '/teams/white-sugar.png';
  state.match.teams.red.logoUrl = '/teams/red-dot.png';
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.routeWebSocket('**/ws', socket => socket.send(JSON.stringify({ type: 'state', state })));
  await page.goto('/overlay/ingame');
  const blue = page.locator('.ig-team--blue .ig-team-logo img');
  const red = page.locator('.ig-team--red .ig-team-logo img');
  await expect(blue).toHaveAttribute('src', '/teams/white-sugar.png');
  await expect(red).toHaveAttribute('src', '/teams/red-dot.png');
  await expect.poll(() => blue.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => red.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});
