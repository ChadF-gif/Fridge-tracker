const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=add]'); await p.fill('#name', 'Chicken breasts'); await p.click('#addBtn'); await p.waitForTimeout(300);
  await p.screenshot({ path: 'test/photo.png' });
  await p.click('#tabs [data-tab=meals]'); await p.click('[data-mview=favs]');
  await p.setInputFiles('#favPhoto', 'test/photo.png'); await p.waitForTimeout(1500);
  console.log('msg:', await p.textContent('#favMsg'), '| favorites:', await p.locator('#favList .card').count());
  await p.click('#favList details.pr summary'); console.log('has ingredients:', await p.locator('#favList details.pr li').count());
  await p.screenshot({ path: 'test/photo-fav.png' });
  await p.setInputFiles('#favPhoto', 'test/photo.png'); await p.waitForTimeout(1200); console.log('dup msg:', await p.textContent('#favMsg'));
  await p.click('[data-act=favpick]'); await p.click('[data-act=favdate] >> nth=0'); await p.waitForTimeout(500);
  await p.click('[data-mview=plan]'); await p.waitForTimeout(300);
  console.log('planned recipe:', await p.locator('details.pr').count(), '| Buy tags:', await p.locator('details.pr .tag.low').count());
  console.log('errors', errs); await b.close();
})();
