const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=meals]');
  const dinner = '.day.today [data-slot=Dinner]';
  console.log('add-dinner buttons today before:', await p.locator(dinner).count());
  await p.click(dinner); await p.fill('form.padd input', 'Cajun carbonara'); await p.press('form.padd input', 'Enter'); await p.waitForTimeout(1500);
  console.log('add-dinner buttons today after:', await p.locator(dinner).count(), '| recipe open:', await p.locator('details.pr').first().evaluate(e => e.open));
  await p.screenshot({ path: 'test/collapse-closed.png' });
  await p.click('details.pr summary'); await p.waitForTimeout(200);
  console.log('after tap open:', await p.locator('details.pr').first().evaluate(e => e.open));
  await p.click('[data-mview=favs]'); await p.click('[data-mview=plan]');
  console.log('stays open after re-render:', await p.locator('details.pr').first().evaluate(e => e.open));
  await p.click('.pe [data-act=rmplan]'); await p.waitForTimeout(300);
  console.log('add-dinner button returns after remove:', await p.locator(dinner).count());
  console.log('errors', errs); await b.close();
})();
