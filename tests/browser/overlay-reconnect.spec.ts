import { test, expect } from '@playwright/test';

test('an already loaded overlay reconnects and accepts a restarted server state', async ({ page, request }) => {
  const initial = await (await request.get('/api/state')).json();
  initial.serverInstanceId = 'first-server';
  initial.activeOutput = 'none';
  const restarted = structuredClone(initial);
  restarted.serverInstanceId = 'second-server';
  restarted.activeOutput = 'draft';
  let connections = 0;
  let disconnect: (() => void) | undefined;
  await page.route('**/api/state', route => route.fulfill({ json: initial }));
  await page.routeWebSocket('**/ws', socket => {
    connections++;
    if (connections === 1) {
      disconnect = () => socket.close();
      socket.send(JSON.stringify({ type: 'state', state: initial }));
    } else socket.send(JSON.stringify({ type: 'state', state: restarted }));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/overlay');
  await expect.poll(() => Boolean(disconnect)).toBe(true);
  await expect(page.locator('.overlay-shell')).toHaveCSS('opacity', '0');
  disconnect!();
  await expect.poll(() => connections).toBeGreaterThan(1);
  await expect(page.locator('.overlay-shell')).toHaveCSS('opacity', '1');
});
