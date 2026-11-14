const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await p.goto('http://localhost:8899/#fridge'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(600);
  console.log('meals on:', await p.isVisible('#s-meals'), '| plan visible:', await p.isVisible('#mealPlan'), '| fridge visible:', await p.isVisible('#s-fridge'));
  await b.close();
})();
