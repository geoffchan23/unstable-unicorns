import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
const svg = readFileSync('src/ui/pwa/icon.svg', 'utf8');
mkdirSync('src/ui/pwa/icons', { recursive: true });
const browser = await chromium.launch(); const page = await browser.newPage();
async function render(file, size, pad = 0) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:${pad ? '#d63f9a' : 'transparent'}"><div style="padding:${pad}px;width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg}</div></body>`);
  await page.screenshot({ path: `src/ui/pwa/icons/${file}`, omitBackground: !pad });
}
await render('icon-192.png', 192); await render('icon-512.png', 512); await render('apple-touch-icon.png', 180);
await render('icon-maskable-512.png', 512, 64);
await browser.close(); console.log('icons written');
