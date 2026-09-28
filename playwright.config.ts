import { defineConfig } from '@playwright/test';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.codex-local/ms-playwright');
const dataDir = path.resolve(`.codex-local/browser-state-${Date.now()}`);
process.env.VIRTUALHUD_BROWSER_DATA_DIR = dataDir;
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30000,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  outputDir: 'test-results/playwright',
  globalTeardown: './tests/browser/teardown.ts',
  use: { baseURL: 'http://127.0.0.1:4187', viewport: { width: 1440, height: 1080 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node --import tsx server/index.ts', url: 'http://127.0.0.1:4187/api/health', reuseExistingServer: false, timeout: 30000, env: { PORT: '4187', HOST: '127.0.0.1', LCU_DISABLED: '1', DRAFT_DATA_DIR: dataDir } },
});
