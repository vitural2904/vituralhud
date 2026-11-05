import { test, expect } from '@playwright/test';

test('each event in a burst remains visible for around two seconds', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let publish: ((events: object[]) => void) | undefined;
  await page.routeWebSocket('**/ws/ingame', socket => {
    publish = events => socket.send(JSON.stringify({ connected: true, gameTime: 100, players: [], events }));
    publish([]);
  });
  await page.goto('/overlay/ingame');
  await expect.poll(() => !!publish).toBe(true);
  await page.waitForTimeout(200);
  const events = Array.from({ length: 6 }, (_, i) => ({ EventID: i + 1, EventTime: 100, EventName: 'ChampionKill', KillerName: 'A', VictimName: `Victim${i + 1}` }));
  publish!(events);
  await expect(page.locator('.ig-event')).toHaveCount(6);
  await expect(page.locator('.ig-event').last()).toHaveAttribute('title', 'A → Victim6');
  await expect(page.locator('.ig-event').first()).toHaveAttribute('title', 'A → Victim1');
  await expect(page.locator('.ig-event').last()).toHaveCSS('opacity', '1');
  await page.waitForTimeout(1400);
  await expect(page.locator('.ig-event')).toHaveCount(6);
  await expect(page.locator('.ig-event')).toHaveCount(0, { timeout: 2000 });
});
