const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=meals]'); await p.click('[data-mview=favs]');
  await p.fill('#favName', 'Grandma\'s Cajun Carbonara'); await p.setInputFiles('#favPhoto', 'test/photo.png'); await p.waitForTimeout(1500);
  console.log('typed name used:', await p.textContent('#favList h3'));
  await p.setInputFiles('#favPhoto', 'test/photo.png'); await p.waitForTimeout(1500);
  console.log('AI name used:', await p.locator('#favList h3').first().textContent(), '| cards:', await p.locator('#favList .card').count());
  await p.click('[data-act=renamefav] >> nth=0'); await p.fill('form.favren input', 'Sunday Pot Roast'); await p.press('form.favren input', 'Enter'); await p.waitForTimeout(500);
  console.log('after rename:', await p.$$eval('#favList h3', e => e.map(x => x.textContent)));
  await p.screenshot({ path: 'test/rename.png' });
  console.log('errors', errs); await b.close();
})();
