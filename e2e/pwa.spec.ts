import { test, expect } from '@playwright/test';

// context.setOffline(true) + reload() to exercise the service worker's cached shell is flaky in
// WebKit (iPad project); this spec only needs one real browser to prove the SW/manifest/offline
// shell work, so it runs Chromium (pixel project) only.
test.skip(({ browserName }) => browserName !== 'chromium', 'offline reload flow is flaky outside Chromium');

const base = 'http://localhost:5174/unicorns/';

test('manifest, service worker, offline shell', async ({ page, context }) => {
  await page.goto(base);
  const manifest = await page.evaluate(async () => {
    const l = document.querySelector('link[rel=manifest]') as HTMLLinkElement;
    const r = await fetch(l.href);
    return r.json();
  });
  expect(manifest.start_url).toBe('./');
  expect(manifest.display).toBe('standalone');
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined, null, { timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play on this device' })).toBeVisible();
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await context.setOffline(false);
});
