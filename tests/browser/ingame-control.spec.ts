import { test, expect } from '@playwright/test';

test('preview fits the 16:9 frame at different window widths', async ({ page }) => {
  await page.goto('/control/ingame');
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const frame = await page.locator('.ic-preview').boundingBox();
      const iframe = await page.locator('.ic-preview iframe').boundingBox();
      return frame && iframe ? Math.abs(frame.width - 2 - iframe.width) < 2 && Math.abs(frame.height - 2 - iframe.height) < 2 : false;
    }).toBe(true);
  }
});

test('ingame controls show connection and save display settings', async ({ page }) => {
  let settings = { visible: true, roster: true, events: true, sponsor: true };
  await page.route('**/api/ingame', route => route.fulfill({ json: { connected: true, observedAt: 'now', gameTime: 90, players: [{}, {}], events: [] } }));
  await page.route('**/api/ingame-settings', async route => {
    if (route.request().method() === 'POST') settings = route.request().postDataJSON();
    await route.fulfill({ json: settings });
  });
  await page.goto('/control/ingame');
  await expect(page.getByText('Đã kết nối game')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Điều khiển HUD ingame' })).toBeVisible();
  const roster = page.getByRole('checkbox', { name: /Bảng người chơi/ });
  await expect(roster).toBeChecked();
  await roster.uncheck();
  await expect.poll(() => settings.roster).toBe(false);
  await expect(page.getByLabel('Địa chỉ OBS')).toHaveValue(/\/overlay\/ingame$/);
  await page.getByRole('button', { name: 'Trực tiếp' }).click();
  await expect(page.getByTitle('Xem trước HUD ingame')).toHaveAttribute('src', '/overlay/ingame');
});

test('failed settings save leaves prior setting visible', async ({ page }) => {
  await page.route('**/api/ingame-settings', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: {} })
    : route.fulfill({ json: { visible: true, roster: true, events: true, sponsor: true } }));
  await page.goto('/control/ingame');
  const visible = page.getByRole('checkbox', { name: /Hiện HUD/ });
  await visible.click();
  await expect(page.getByRole('alert')).toContainText('Không lưu được');
  await expect(visible).toBeChecked();
});
