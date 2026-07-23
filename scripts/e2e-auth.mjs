// End to end auth smoke test. Logs in as the QA owner with a password and
// verifies routing, org context, live data, and layout at 1440px.
// Usage: S=<screenshot dir> node scripts/e2e-auth.mjs
import { chromium } from 'playwright-core';

const proxy = process.env.HTTPS_PROXY
  ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
  : undefined;
// ssl-version-max: the sandbox egress gateway cannot pass Chromium's TLS 1.3
// ClientHello, so the test browser caps at TLS 1.2. Verification stays on.
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  proxy,
  args: ['--ssl-version-max=tls1.2'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const outDir = process.env.S ?? '.';

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
console.log('unauthenticated / lands on:', page.url());
await page.screenshot({ path: outDir + '/shot-login.png', fullPage: true });

await page.click('text=Sign in with a password instead');
await page.fill('input[type=email]', 'insights-qa-owner@tallycivic.com');
await page.fill('input[type=password]', 'Qa-Owner-Testing-2026!');
await page.click('button[type=submit]');
await page.waitForURL('**/districts/**', { timeout: 20000 });
console.log('after login lands on:', page.url());
await page.waitForLoadState('networkidle');
await page.screenshot({ path: outDir + '/shot-district-stub.png', fullPage: true });

const bodyText = await page.textContent('body');
console.log('page mentions org:', bodyText.includes('Tally Insights QA'));
console.log('page shows live bill count:', /\d+ bills currently have sentiment aggregates/.test(bodyText));

const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth
);
console.log('horizontal overflow at 1440px:', overflow);

await browser.close();
