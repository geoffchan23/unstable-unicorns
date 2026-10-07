import { defineConfig, devices } from '@playwright/test';

// Same override as scripts/dev.mjs. Without it, `reuseExistingServer` will
// happily adopt any other dev server already holding the default port and run
// the whole suite against the wrong app.
const CLIENT_PORT = process.env.UNICORNS_CLIENT_PORT ?? '5173';
const PROD_PORT = process.env.UNICORNS_PROD_PORT ?? '5174';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${CLIENT_PORT}/unicorns/`, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/dev.mjs', url: `http://localhost:${CLIENT_PORT}/unicorns/`, reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: `npm run build && node scripts/static.mjs dist ${PROD_PORT}`, url: `http://localhost:${PROD_PORT}/unicorns/`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
  projects: [
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
  ],
});
