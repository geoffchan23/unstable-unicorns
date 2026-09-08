import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173/unicorns/', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/dev.mjs', url: 'http://localhost:5173/unicorns/', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run build && node scripts/static.mjs dist 5174', url: 'http://localhost:5174/unicorns/', reuseExistingServer: true, timeout: 120_000 },
  ],
  projects: [
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
  ],
});
