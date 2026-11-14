const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  for (const n of ['Chicken breasts', 'Spinach', 'Ketchup', 'Whole milk', 'Strawberries', 'Orange juice', 'Mystery thing']) {
    await p.click('#tabs [data-tab=add]'); await p.fill('#name', n);
    if (n === 'Mystery thing') { await p.click('[data-addcat="Snacks & Sweets"]'); await p.fill('#exp', '2026-12-20'); }
    await p.click('#addBtn'); await p.waitForTimeout(250);
  }
  await p.waitForTimeout(1500);
  const chips = await p.$$eval('#catFilters .chip', e => e.map(x => x.textContent)); console.log(chips.join(' | '));
  await p.screenshot({ path: 'test/cats.png' });
  await p.click('#catFilters [data-cat="Protein"]'); console.log('protein rows:', await p.locator('.item').count());
  await p.click('#catFilters [data-cat="All"]'); await p.fill('#q', 'milk'); console.log('search milk rows:', await p.locator('.item').count());
  await p.fill('#q', 'veg'); console.log('search veg (category) rows:', await p.locator('.item').count());
  await p.fill('#q', 'zzz'); console.log('empty text:', await p.textContent('#list'));
  await p.fill('#q', ''); await p.click('[data-act=edit] >> nth=0'); console.log('edit cat selected:', await p.$$eval('#catSeg [aria-pressed=true]', e => e.map(x => x.textContent)));
  console.log('errors', errs); await b.close();
})();
