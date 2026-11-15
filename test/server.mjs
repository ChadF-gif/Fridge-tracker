// Local test server: serves /public and mocks /api with in-memory state.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const state = { items: [], shop: [], plan: [], favs: [], settings: { autoRestock: false }, house: { adults: 2, kids: 0 } };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const recipe = n => JSON.stringify({ title: 'Test dinner ' + n, cuisine: 'Italian', minutes: 25, ingredients: [{ name: 'Chicken breasts', amount: '1.5 lb' }, { name: 'Basil', amount: '1/4 cup', buy: true }], steps: ['Season 1 tsp salt.', 'Bake 400F for 20 min.'] });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    if (req.headers['x-household-code'] !== 'pizza') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"Wrong code","code":"unauthorized"}'); }
    let body = ''; for await (const c of req) body += c;
    res.writeHead(200, { 'content-type': 'application/json' });
    if (u.pathname === '/api/ai') return res.end(JSON.stringify({ text: body.includes('grocery receipt') ? JSON.stringify([{ name: 'Chicken breasts', qty: 2, loc: 'Fridge', days: 2 }, { name: 'Whole milk', qty: 1, loc: 'Fridge', days: 7 }, { name: 'Black pepper', qty: 1, loc: 'Pantry', days: 700 }, { name: 'Mystery item', qty: 1, loc: 'Fridge', days: 9 }]) : body.includes('dinner ideas for these days') ? JSON.stringify(Array.from({length:7},(_,i)=>({title:'Planned dish '+i}))) : body.includes('grocery items') ? JSON.stringify([{ item: 'Pasta', why: 'goes with chicken' }, { item: 'Cheddar cheese', why: 'dup' }, { item: 'Tortillas', why: 'for beans' }]) : recipe(Math.floor(Math.random() * 99)) }));
    if (req.method === 'POST') {
      const b = JSON.parse(body);
      if (b.op === 'addItem') state.items.push(b.item);
      if (b.op === 'removeItem') state.items = state.items.filter(x => x.id !== b.id);
      if (b.op === 'updateItem') state.items = state.items.map(x => x.id === b.id ? { ...x, ...b.fields } : x);
      if (b.op === 'addShop') state.shop.push(b.shop);
      if (b.op === 'updateShop') state.shop = state.shop.map(x => x.id === b.id ? { ...x, ...b.fields } : x);
      if (b.op === 'removeShop') state.shop = state.shop.filter(x => x.id !== b.id);
      if (b.op === 'addPlan') state.plan.push(b.entry);
      if (b.op === 'removePlan') state.plan = state.plan.filter(x => x.id !== b.id);
      if (b.op === 'setPlanRecipe') state.plan = state.plan.map(x => x.id === b.id ? { ...x, recipe: b.recipe } : x);
      if (b.op === 'addFav') state.favs.push(b.fav);
      if (b.op === 'renameFav') state.favs = state.favs.map(x => x.id === b.id ? { ...x, title: b.title } : x);
      if (b.op === 'removeFav') state.favs = state.favs.filter(x => x.id !== b.id);
      if (b.op === 'setSettings') state.settings = { autoRestock: !!b.autoRestock };
      if (b.op === 'setHouse') state.house = { adults: b.adults, kids: b.kids };
      return res.end('{"ok":true}');
    }
    return res.end(JSON.stringify(state));
  }
  let f = path.join('public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(8899);
