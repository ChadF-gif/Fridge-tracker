const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=add]');
  console.log('quick card closed by default:', !(await p.locator('#quickCard').evaluate(e => e.open)));
  await p.click('#quickCard summary'); await p.waitForTimeout(200);
  await p.screenshot({ path: 'test/quick-open.png', fullPage: true });
  console.log('add button disabled before picking:', await p.locator('[data-act=quickadd]').isDisabled());
  for (const n of ['Eggs', 'Chicken breasts', 'Rice']) await p.click('[data-q="' + n + '"]');
  console.log('button text:', await p.textContent('[data-act=quickadd]'));
  await p.click('[data-act=quickadd]'); await p.waitForTimeout(800);
  console.log('fridge text:', (await p.textContent('#list')).replace(/\s+/g, ' ').slice(0, 300));
  await p.click('#tabs [data-tab=add]'); console.log('quick card re-closed:', !(await p.locator('#quickCard').evaluate(e => e.open)));
  await p.click('#quickCard summary');
  console.log('already-have chips dimmed:', await p.locator('#quickBody .chip.have').allTextContents());
  await p.click('[data-q="Cheese"]'); await p.click('[data-q="Cheese"]');
  console.log('toggle off works, button:', await p.textContent('[data-act=quickadd]'));
  // match badge on idea cards
  await p.click('#tabs [data-tab=recipes]'); await p.click('#mealBtn'); await p.waitForTimeout(1800);
  console.log('idea badges:', await p.locator('#meals .tag.have').allTextContents());
  await p.click('[data-act=favidea] >> nth=0'); await p.waitForTimeout(400);
  await p.screenshot({ path: 'test/quick-ideas.png' });
  await p.click('#tabs [data-tab=meals]'); await p.click('[data-mview=favs]'); await p.waitForTimeout(300);
  console.log('fav badge:', await p.locator('#favList .tag.have').allTextContents());
  await p.click('[data-act=favready]'); await p.waitForTimeout(200);
  console.log('Can make now (missing basil) ->', await p.locator('#favList .card').count(), 'cards | msg:', await p.locator('#favList .empty').textContent().catch(() => ''));
  // add basil -> becomes ready
  await p.click('#tabs [data-tab=add]'); await p.fill('#name', 'Fresh basil'); await p.click('#quick [data-days="7"]'); await p.click('#addBtn'); await p.waitForTimeout(400);
  await p.click('#tabs [data-tab=meals]'); await p.click('[data-mview=favs]'); await p.waitForTimeout(300);
  console.log('after adding basil ->', await p.locator('#favList .card').count(), 'cards | badge:', await p.locator('#favList .tag.have').allTextContents());
  await p.screenshot({ path: 'test/quick-favs.png' });
  // planned meal badge
  await p.click('[data-mview=plan]'); await p.click('.day.today [data-slot=Dinner]'); await p.fill('form.padd input', 'Lemon chicken'); await p.press('form.padd input', 'Enter'); await p.waitForTimeout(1500);
  console.log('plan summary:', (await p.locator('details.pr summary').first().textContent()).trim());
  await p.screenshot({ path: 'test/quick-plan.png' });
  console.log('errors', errs); await b.close();
})();
