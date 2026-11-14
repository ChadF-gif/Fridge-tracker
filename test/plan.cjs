const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  for (const n of ['Chicken breasts', 'Spinach']) { await p.click('#tabs [data-tab=add]'); await p.fill('#name', n); await p.click('#addBtn'); await p.waitForTimeout(250); }
  await p.click('#tabs [data-tab=meals]'); await p.waitForTimeout(300);
  console.log('plan view visible:', await p.isVisible('#mealPlan'), '| days:', await p.locator('.day').count());
  // manual add
  await p.click('.day.today [data-slot=Dinner]'); await p.fill('form.padd input', 'Taco night'); await p.press('form.padd input', 'Enter'); await p.waitForTimeout(400);
  console.log('entries after manual add:', await p.locator('.pe').count());
  // ideas -> plan it
  await p.click('[data-mview=ideas]'); await p.click('#mealBtn'); await p.waitForTimeout(1800);
  await p.click('[data-act=planpick] >> nth=0'); await p.click('[data-act=planit] >> nth=1'); await p.waitForTimeout(400);
  await p.click('[data-mview=plan]'); await p.waitForTimeout(300);
  console.log('entries after plan-it:', await p.locator('.pe').count(), '| recipes:', await p.locator('details.pr').count());
  // AI fill
  await p.click('#planAi'); await p.waitForTimeout(1500);
  console.log('entries after AI fill:', await p.locator('.pe').count(), '| msg:', await p.textContent('#planMsg'));
  await p.screenshot({ path: 'test/plan.png', fullPage: false });
  await p.click('.pe .x >> nth=0'); await p.waitForTimeout(300); console.log('after remove:', await p.locator('.pe').count());
  await p.click('[data-act=weeknext]'); console.log('next week label:', await p.textContent('#weekSub'), '| entries:', await p.locator('.pe').count());
  console.log('errors', errs); await b.close();
})();
