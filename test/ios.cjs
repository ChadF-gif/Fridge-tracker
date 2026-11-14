const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(500);
  await p.click('#tabs [data-tab=add]'); await p.waitForTimeout(300);
  const r = await p.evaluate(() => { const e = document.querySelector('#exp').getBoundingClientRect(); return { right: e.right, vw: innerWidth, sw: document.documentElement.scrollWidth }; });
  console.log(r); await b.close();
})();
