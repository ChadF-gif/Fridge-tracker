const { chromium, devices } = require('playwright');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=add]');
  console.log('receipt card visible:', await p.locator('#receiptCard').isVisible());
  await p.setInputFiles('#receipt', { name: 'r.png', mimeType: 'image/png', buffer: png }); await p.waitForTimeout(1500);
  console.log('rows:', await p.locator('.ritem').count(), '|', await p.textContent('#receiptMsg'));
  const vals = await p.$$eval('.ritem', rs => rs.map(r => [r.querySelector('[data-rf=name]').value, r.querySelector('[data-rf=cat]').value, r.querySelector('[data-rf=loc]').value, r.querySelector('[data-rf=exp]').value]));
  console.log(vals);
  await p.locator('#receiptList').screenshot({ path: 'test/receipt-review.png' });
  // fix a name (category should follow), move milk to Freezer (date re-estimates), set a date, uncheck one
  await p.fill('.ritem:nth-child(4) [data-rf=name]', 'Cheddar cheese'); await p.press('.ritem:nth-child(4) [data-rf=name]', 'Tab');
  console.log('renamed -> category:', await p.inputValue('.ritem:nth-child(4) [data-rf=cat]'));
  const before = await p.inputValue('.ritem:nth-child(2) [data-rf=exp]');
  await p.selectOption('.ritem:nth-child(2) [data-rf=loc]', 'Freezer');
  console.log('milk date', before, '->', await p.inputValue('.ritem:nth-child(2) [data-rf=exp]'));
  await p.fill('.ritem:nth-child(1) [data-rf=exp]', '2026-11-30');
  console.log('chicken date kept:', await p.inputValue('.ritem:nth-child(1) [data-rf=exp]'));
  await p.uncheck('.ritem:nth-child(3) input[type=checkbox]');
  console.log('button:', await p.textContent('[data-act=receiptadd]'));
  // type into a name and tap Add immediately (blur must not swallow the tap)
  await p.fill('.ritem:nth-child(4) [data-rf=name]', 'Sharp cheddar'); await p.click('[data-act=receiptadd]'); await p.waitForTimeout(1200);
  console.log('on fridge tab:', await p.locator('#s-fridge.on').count());
  console.log((await p.textContent('#list')).replace(/\s+/g, ' ').slice(0, 400));
  await p.click('#tabs [data-tab=fridge]'); await p.click('[data-cat="Dairy & Eggs"]').catch(() => {});
  console.log('errors', errs); await b.close();
})();
