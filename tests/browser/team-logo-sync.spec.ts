import { test, expect } from '@playwright/test';

test('team logo updates propagate to draft and ingame overlays', async ({ browser, request }) => {
  const { token } = await (await request.get('/api/control-session')).json();
  const command = async (side: string, value: string) => {
    const response = await request.post('/api/actions', { headers: { 'x-virtualhud-control': token }, data: { type: 'SET_TEAM', side, field: 'logoUrl', value } });
    expect(response.ok()).toBeTruthy();
  };
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', reducedMotion: 'reduce' });
  await context.routeWebSocket('**/ws/ingame', socket => socket.send(JSON.stringify({ connected: true, gameTime: 100, players: [], events: [] })));
  const draft = await context.newPage(); const ingame = await context.newPage();
  try {
    await draft.goto('/preview/draft'); await ingame.goto('/overlay/ingame');
    for (const [side, file] of [['blue', 'white-sugar'], ['red', 'red-dot']] as const) {
      const url = `/teams/${file}.png`; await command(side, url);
      await expect(draft.locator(`.team-identity--${side} .center-logo img[src="${url}"]`)).toBeVisible();
      await expect(ingame.locator(`.ig-team--${side} .ig-team-logo img[src="${url}"]`)).toBeVisible();
    }
  } finally { await context.close(); }
});
