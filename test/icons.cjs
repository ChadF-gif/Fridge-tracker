const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const svg = require('fs').readFileSync('public/icon.svg', 'utf8');
  for (const [n, s] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent('<body style="margin:0">' + svg.replace('<svg ', '<svg width="' + s + '" height="' + s + '" ') + '</body>');
    await p.screenshot({ path: 'public/' + n + '.png' }); await p.close();
  }
  await b.close();
})();
