const { chromium, devices } = require('playwright');
const svg = c => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#f4d9a6"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><circle cx="320" cy="200" r="130" fill="#fff" opacity=".85"/></svg>`;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const calls = [];
  await p.route('https://en.wikipedia.org/**', r => {
    const q = decodeURIComponent(new URL(r.request().url()).searchParams.get('gsrsearch')).toLowerCase(); calls.push(q);
    const pg = (index, title, src) => ({ index, title, thumbnail: { source: src, width: 640, height: 400 } });
    let pages = [];
    if (q.includes('dinner')) pages = [pg(2, 'Pizza', 'https://upload.wikimedia.org/bad.jpg'), pg(1, 'Dinner', 'https://upload.wikimedia.org/dinner.jpg')];
    else if (q.includes('carbonara')) pages = [pg(1, 'Carbonara', 'https://upload.wikimedia.org/carbonara.jpg')];
    else if (q.includes('mystery')) pages = [pg(1, 'Pizza', 'https://upload.wikimedia.org/bad.jpg')];
    else if (q.includes('failing')) return r.abort();
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ query: { pages } }) });
  });
  await p.route('https://upload.wikimedia.org/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(r.request().url().includes('carbonara') ? '#e9b44c' : '#c0504d') }));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=add]'); await p.fill('#name', 'Chicken breasts'); await p.click('#addBtn'); await p.waitForTimeout(400);
  // ideas
  await p.click('#tabs [data-tab=recipes]'); await p.click('#mealBtn'); await p.waitForTimeout(2500);
  console.log('idea cards:', await p.locator('#meals .card').count(), '| photos:', await p.locator('#meals figure.dish').count());
  console.log('wrong-index page skipped, src:', (await p.locator('#meals figure.dish img').first().getAttribute('src')));
  await p.locator('#meals .card').first().screenshot({ path: 'test/pics-ideas.png' });
  // plan: carbonara
  await p.click('#tabs [data-tab=meals]');
  await p.click('.day.today [data-slot=Dinner]'); await p.fill('form.padd input', 'Cajun carbonara'); await p.press('form.padd input', 'Enter'); await p.waitForTimeout(2500);
  console.log('plan: figure before opening is inside closed details:', await p.locator('details.pr figure.dish').count());
  await p.click('details.pr summary'); await p.waitForTimeout(400);
  await p.locator('.day.today').screenshot({ path: 'test/pics-plan.png' });
  console.log('planned title used for lookup (carbonara):', calls.some(c => c.includes('carbonara')));
  // no match + failing
  await p.click('.day.today [data-slot=Lunch]'); await p.fill('form.padd input', 'Mystery stew'); await p.press('form.padd input', 'Enter'); await p.waitForTimeout(1500);
  await p.click('.day.today [data-slot=Breakfast]'); await p.fill('form.padd input', 'Failing toast'); await p.press('form.padd input', 'Enter'); await p.waitForTimeout(1500);
  console.log('photos on page now (expect 1 plan photo, none for mystery/failing):', await p.locator('#mealPlan figure.dish').count());
  const cached = await p.evaluate(() => JSON.parse(localStorage.getItem('chill-pics') || '{}'));
  console.log('cached keys:', Object.keys(cached).map(k => k + '=' + (cached[k].u ? 'photo' : 'none')));
  // reload: cache means no more lookups for known titles
  const before = calls.length; await p.reload(); await p.waitForTimeout(1500); await p.click('#tabs [data-tab=meals]'); await p.waitForTimeout(800);
  const newCalls = calls.slice(before); console.log('lookups after reload:', newCalls);
  console.log('errors', errs); await b.close();
})();
