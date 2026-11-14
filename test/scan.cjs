const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route('https://world.openfoodfacts.org/**', r => r.fulfill({ json: { status: 1, product: { product_name: 'Organic Quinoa Crunch Bites' } } }));
  await p.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    HTMLMediaElement.prototype.play = async () => {};
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13']; } async detect() { return [{ rawValue: '0123456789012' }]; } };
  });
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=add]'); await p.click('#scanBtn'); await p.waitForTimeout(900);
  console.log('name:', await p.inputValue('#name'), '| exp:', await p.inputValue('#exp'), '| msg:', await p.textContent('#addMsg'));
  await p.click('#addBtn'); await p.waitForTimeout(600);
  console.log('hash:', await p.evaluate(() => location.hash), '| rows:', await p.locator('.item').count());
  console.log('errors', errs); await b.close();
})();
