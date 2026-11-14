const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  console.log('tabs:', (await p.$$eval('#tabs button', e => e.map(x => x.textContent.trim()))).join(' | '));
  console.log('opens on meals:', await p.isVisible('#s-meals'), '| subtabs:', (await p.$$eval('#mealTabs .chip', e => e.map(x => x.textContent))).join(','));
  await p.click('#tabs [data-tab=add]'); await p.fill('#name', 'Chicken breasts'); await p.click('#addBtn'); await p.waitForTimeout(300);
  await p.screenshot({ path: 'test/nav.png' });
  await p.click('#tabs [data-tab=recipes]'); await p.click('#mealBtn'); await p.waitForTimeout(1800);
  console.log('recipes visible:', await p.isVisible('#s-recipes'), '| cards:', await p.locator('.recipe').count());
  await p.click('[data-act=planpick] >> nth=0'); await p.click('[data-act=planit] >> nth=0'); await p.waitForTimeout(400);
  await p.click('.toast button, #toast button'); await p.waitForTimeout(300);
  console.log('View plan -> meals tab:', await p.isVisible('#s-meals'), '| recipes hidden:', !(await p.isVisible('#s-recipes')), '| planned recipes:', await p.locator('details.pr').count());
  console.log('errors', errs); await b.close();
})();
