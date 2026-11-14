const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('http://localhost:8899/');
    await p.fill('#gateCode', 'wrong'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(400);
    console.log(scheme, 'gate msg:', await p.textContent('#gateMsg'));
    await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
    if (scheme === 'light') {
      for (const [n, q] of [['Chicken breasts', 2], ['Black beans canned', 4], ['Whole milk', 1], ['Cheddar cheese', 1]]) {
        await p.click('#tabs [data-tab=add]'); await p.fill('#name', n);
        for (let i = 1; i < q; i++) await p.click('[data-act=qplus]');
        await p.click('#addBtn'); await p.waitForTimeout(250);
      }
    }
    await p.waitForTimeout(1600);
    await p.screenshot({ path: `test/fridge-${scheme}.png` });
    await p.click('#tabs [data-tab=meals]'); await p.click('#mealBtn'); await p.waitForTimeout(1800);
    console.log(scheme, 'recipes:', await p.locator('.recipe').count());
    await p.screenshot({ path: `test/meals-${scheme}.png`, fullPage: true });
    await p.click('#tabs [data-tab=add]'); await p.waitForTimeout(300);
    await p.screenshot({ path: `test/add-${scheme}.png` });
    await ctx.close();
  }
  console.log('errors:', errs);
  await b.close();
})();
