const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 }); await ctx.grantPermissions(['clipboard-read','clipboard-write']);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=shop]'); await p.fill('#shopIn', 'Paper towels'); await p.press('#shopIn', 'Enter'); await p.waitForTimeout(300);
  await p.click('#autoCard .smartrow'); await p.waitForTimeout(500);
  console.log('toggle on:', await p.isChecked('#autoToggle'));
  await p.click('#copyList'); await p.waitForTimeout(300);
  console.log('clipboard:', JSON.stringify(await p.evaluate(() => navigator.clipboard.readText())));
  await p.screenshot({ path: 'test/auto.png' });
  console.log('errors', errs); await b.close();
})();
