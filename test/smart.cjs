const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  for (const n of ['Chicken breasts', 'Cheddar cheese']) { await p.click('#tabs [data-tab=add]'); await p.fill('#name', n); await p.click('#addBtn'); await p.waitForTimeout(250); }
  await p.click('#tabs [data-tab=shop]'); await p.click('.smartrow'); await p.waitForTimeout(1200);
  console.log(await p.textContent('#smartMsg')); console.log('rows:', await p.locator('.shop').count(), 'tags:', await p.locator('.tag.sug').count());
  await p.screenshot({ path: 'test/shop.png' });
  await p.click('.shop .x'); await p.waitForTimeout(300); console.log('after remove:', await p.locator('.shop').count());
  console.log('errors', errs); await b.close();
})();
