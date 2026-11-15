const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://localhost:8899/'); await p.fill('#gateCode', 'pizza'); await p.press('#gateCode', 'Enter'); await p.waitForTimeout(400);
  await p.click('#tabs [data-tab=add]'); await p.fill('#name', 'Chicken breasts'); await p.click('#addBtn'); await p.waitForTimeout(300);
  console.log(await p.evaluate(() => markBuy({ ingredients: [{ name: 'boneless chicken breast', amount: '1 lb' }, { name: 'Heavy cream', amount: '1 cup' }, { name: 'kosher salt', amount: '1 tsp' }, { name: 'Andouille sausage', amount: '6 oz' }] }).ingredients.map(x => x.name + ':' + x.buy).join(' | ')));
  await b.close();
})();
