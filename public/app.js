'use strict';
/* Chill: a shared fridge tracker. Data and AI calls go through Netlify Functions (/api/data, /api/ai). */

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const plus = n => { const d = today0(); d.setDate(d.getDate() + n); return iso(d); };
const daysLeft = s => Math.round((new Date(s + 'T00:00:00') - today0()) / 864e5);
const qtyOf = i => Math.min(99, Math.max(1, Math.round(Number(i && i.qty) || 1)));
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const LOCS = ['Fridge', 'Freezer', 'Pantry'];
const CUISINES = ['Any', 'Italian', 'Mexican', 'Asian', 'American', 'Mediterranean', 'Indian', 'BBQ'];
const DIETS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Low-carb', 'Kid-friendly'];

const S = { items: [], shop: [], filter: 'All', cat: 'All', q: '', addCat: 'Other', catAuto: true, addLoc: 'Fridge', qty: 1, ready: false, online: true, canWrite: true, canPhoto: true,
  plan: [], favs: [], autoRestock: false, genning: new Set(), opened: new Set(), favPick: null, favEdit: null, favSlot: 'Dinner', mealView: 'plan', weekOff: 0, addSlot: null, planPick: null, planBusy: false, meals: null, house: { adults: 2, kids: 0 }, mealHouse: null, mealPrefs: '', mealNote: '', busy: false, err: '', enter: false, mealEnter: false,
  cuisine: 'Any', diets: [], receipt: [], quick: new Set(), favReady: false, editId: null, expAuto: true, scanCode: null, reading: false, receiptBusy: false };

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
try { const p = JSON.parse(lsGet('chill-prefs')); if (p) { if (CUISINES.includes(p.cuisine)) S.cuisine = p.cuisine; if (Array.isArray(p.diets)) S.diets = p.diets.filter(x => DIETS.includes(x)); } } catch (e) {}
const savePrefs = () => lsSet('chill-prefs', JSON.stringify({ cuisine: S.cuisine, diets: S.diets }));
let barcodes = {};
try { barcodes = JSON.parse(lsGet('chill-barcodes')) || {}; } catch (e) {}
const saveBarcodes = () => lsSet('chill-barcodes', JSON.stringify(barcodes));

// Typical days a food stays good once home. Estimates only; the package date wins.
const SHELF = [
  [/\bcans?\b|canned|broth|stock\b|soup/, 730], [/ketchup|mustard|mayo|dressing|\bsauce\b|\bjam\b|jelly|syrup|relish|vinegar|pickle|olives?\b|honey|peanut butter|marinade/, 180], [/cheese|cheddar|mozzarella|parmesan/, 30], [/ground (beef|turkey|pork|chicken)|mince/, 2],
  [/chicken|turkey/, 2], [/steak|roast|beef|lamb/, 4], [/pork|sausage|brat/, 4], [/bacon/, 7], [/salmon|fish|cod\b|tilapia|shrimp|scallop/, 2],
  [/deli|lunch meat|\bham\b|salami|turkey slices/, 5], [/hot dog/, 14], [/\beggs?\b/, 28], [/yogurt|yoghurt/, 14], [/butter/, 60],
  [/milk|half and half|creamer/, 7], [/spinach|lettuce|salad|arugula|kale/, 5], [/berries|berry|strawberr|raspberr|blueberr/, 5],
  [/banana/, 5], [/apple/, 28], [/orange|lemon|\blime/, 21], [/grape/, 10], [/avocado/, 4], [/tomato/, 6],
  [/broccoli|cauliflower|bell pepper|cucumber|zucchini|celery|mushroom/, 6], [/carrot/, 21], [/potato|onion|garlic/, 30],
  [/bread|bagel|\bbuns?\b|rolls?\b/, 5], [/tortilla/, 14], [/juice/, 7], [/hummus|salsa|\bdip\b/, 7], [/leftover/, 4],
  [/pasta|rice|flour|sugar|oats|noodle|cereal|beans|lentil/, 365]
];
function shelfLife(name, loc) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return null;
  if (loc === 'Freezer') return 120;
  for (const [re, d] of SHELF) if (re.test(n)) return d;
  return null;
}
const CATS = ['Vegetables', 'Fruit', 'Protein', 'Dairy & Eggs', 'Condiments', 'Grains & Bread', 'Drinks', 'Snacks & Sweets', 'Leftovers', 'Other'];
const CAT_RE = [
  ['Leftovers', /leftover|meal prep|cooked /],
  ['Snacks & Sweets', /ice cream|chips\b|cookie|candy|chocolate|popcorn|cracker|granola|pretzel|\bnuts?\b|peanuts|almonds|cashew|brownie|cake|pie\b|pudding|jerky|fruit snack/],
  ['Condiments', /ketchup|mustard|mayo|dressing|\bsauce\b|salsa|hummus|\bjam\b|jelly|syrup|relish|vinegar|marinade|pickle|olives?\b|peanut butter|almond butter|hot sauce|bbq|guacamole|\bdip\b|honey|spread|seasoning|\bpesto\b/],
  ['Drinks', /juice|soda|\bwater\b|beer|\bwine\b|coffee|\btea\b|kombucha|lemonade|gatorade|energy drink|sparkling|seltzer|cola\b/],
  ['Dairy & Eggs', /milk|cheese|yogurt|yoghurt|butter|cream|\beggs?\b|half and half|creamer|kefir|ricotta|mozzarella|parmesan|cheddar/],
  ['Protein', /chicken|beef|steak|pork|bacon|sausage|brat|\bham\b|turkey|lamb|salmon|\bfish\b|cod\b|tilapia|shrimp|scallop|tuna|tofu|tempeh|beans?\b|lentil|chickpea|hot dog|deli|salami|lunch meat|ground |meatball|patty|patties|brisket|ribs?\b|nugget/],
  ['Vegetables', /spinach|lettuce|salad|arugula|kale|broccoli|cauliflower|carrot|onion|pepper|tomato|potato|cucumber|celery|mushroom|zucchini|squash|\bcorn\b|\bpeas?\b|garlic|cabbage|asparagus|green beans|brussels|beet|radish|\bveg|ginger|cilantro|parsley|basil|herbs?\b/],
  ['Fruit', /apple|banana|orange|berry|berries|grape|lemon|\blime|melon|peach|pear\b|mango|pineapple|avocado|cherry|cherries|plum|kiwi|pomegranate|fruit/],
  ['Grains & Bread', /bread|bagel|tortilla|pasta|\brice\b|flour|cereal|oats?\b|oatmeal|noodle|\bbuns?\b|\brolls?\b|pizza|waffle|pancake|muffin|biscuit|quinoa|couscous|spaghetti|macaroni/]
];
function guessCat(name) {
  const n = String(name || '').toLowerCase();
  if (!n.trim()) return 'Other';
  for (const [c, re] of CAT_RE) if (re.test(n)) return c;
  return 'Other';
}
const catOf = i => (i && CATS.includes(i.cat)) ? i.cat : guessCat(i && i.name);
const buyList = r => (Array.isArray(r && r.ingredients) ? r.ingredients : []).filter(x => x && x.buy && x.name).map(x => String(x.name)).slice(0, 8);

/* ---------- server calls ---------- */
const CODE_KEY = 'chill-code';
let code = lsGet(CODE_KEY) || '';
let pending = 0;

async function call(path, opts) {
  opts = opts || {};
  const r = await fetch('/api/' + path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', 'x-household-code': code },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'request failed'); e.code = data.code || (r.status === 401 ? 'unauthorized' : 'error'); e.status = r.status; throw e; }
  return data;
}
async function send(op, payload) {
  pending++;
  try { await call('data', { method: 'POST', body: Object.assign({ op }, payload) }); }
  finally { pending--; }
}

const api = {
  addItem: async o => { const it = Object.assign({ id: uid(), ts: Date.now() }, o); S.items = S.items.concat(it); render(); await send('addItem', { item: it }); },
  removeItem: async id => { S.items = S.items.filter(i => i.id !== id); render(); await send('removeItem', { id }); },
  setQty: async (id, qty) => { S.items = S.items.map(i => i.id === id ? Object.assign({}, i, { qty }) : i); render(); await send('updateItem', { id, fields: { qty } }); },
  updateItem: async (id, o) => { S.items = S.items.map(i => i.id === id ? Object.assign({}, i, o) : i); render(); await send('updateItem', { id, fields: o }); },
  addShop: async (text, sug) => { const s = { id: uid(), text, done: false, ts: Date.now() }; if (sug) s.sug = true; S.shop = S.shop.concat(s); render(); await send('addShop', { shop: s }); },
  toggleShop: async (id, done) => { S.shop = S.shop.map(s => s.id === id ? Object.assign({}, s, { done }) : s); render(); await send('updateShop', { id, fields: { done } }); },
  removeShop: async id => { S.shop = S.shop.filter(s => s.id !== id); render(); await send('removeShop', { id }); },
  addPlan: async o => { const e = Object.assign({ id: uid(), ts: Date.now() }, o); S.plan = S.plan.concat(e); render(); await send('addPlan', { entry: e }); },
  removePlan: async id => { S.plan = S.plan.filter(x => x.id !== id); render(); await send('removePlan', { id }); },
  setPlanRecipe: async (id, recipe) => { S.plan = S.plan.map(x => x.id === id ? Object.assign({}, x, { recipe }) : x); render(); await send('setPlanRecipe', { id, recipe }); },
  addFav: async o => { const f = Object.assign({ id: uid(), ts: Date.now() }, o); S.favs = S.favs.concat(f); render(); await send('addFav', { fav: f }); },
  renameFav: async (id, title) => { S.favs = S.favs.map(x => x.id === id ? Object.assign({}, x, { title }) : x); render(); await send('renameFav', { id, title }); },
  removeFav: async id => { S.favs = S.favs.filter(x => x.id !== id); render(); await send('removeFav', { id }); },
  setSettings: async o => { Object.assign(S, o); render(); await send('setSettings', o); },
  setHouse: async h => { await send('setHouse', { adults: h.adults, kids: h.kids }); }
};

let lastSig = '';
function applyServer(d) {
  const sig = JSON.stringify(d);
  if (sig === lastSig && S.ready) return;
  lastSig = sig;
  S.items = Array.isArray(d.items) ? d.items : [];
  S.shop = Array.isArray(d.shop) ? d.shop : [];
  S.plan = Array.isArray(d.plan) ? d.plan : [];
  S.favs = Array.isArray(d.favs) ? d.favs : [];
  S.autoRestock = !!(d.settings && d.settings.autoRestock);
  if (d.house && !pc.house) S.house = { adults: Math.max(1, Math.min(12, Math.round(Number(d.house.adults) || 2))), kids: Math.max(0, Math.min(12, Math.round(Number(d.house.kids) || 0))) };
  const first = !S.ready;
  S.ready = true; S.err = '';
  if (first) { S.enter = true; clearEnter(); }
  render();
}
async function refresh() {
  try {
    const d = await call('data');
    S.online = true;
    if (pending === 0) applyServer(d); else renderSync();
  } catch (e) {
    if (e.code === 'unauthorized') { showGate('That code does not work anymore. Enter it again.'); return; }
    S.online = false;
    if (!S.ready) { S.err = e.code === 'not_configured' ? 'config' : 'offline'; S.ready = true; }
    render();
  }
}
let pollTimer = 0;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { if (!document.hidden && pending === 0 && !$('#gate').hidden === false) refresh(); }, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pending === 0 && $('#gate').hidden) refresh(); });
}

function showGate(msg) { $('#gate').hidden = false; $('#gateMsg').textContent = msg || ''; setTimeout(() => $('#gateCode').focus(), 50); }
$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault();
  const c = $('#gateCode').value.trim(); if (!c) return;
  const prev = code; code = c;
  try {
    const d = await call('data');
    lsSet(CODE_KEY, c); $('#gate').hidden = true; $('#gateCode').value = '';
    S.online = true; applyServer(d); startPolling();
  } catch (err) {
    code = prev;
    $('#gateMsg').textContent = err.code === 'unauthorized' ? 'That code is not right.'
      : err.code === 'not_configured' ? 'The server has no household code yet. Add HOUSEHOLD_CODE in Netlify, redeploy, then try again.'
      : 'Could not reach the server. Check your connection.';
  }
});

/* ---------- small UI helpers ---------- */
let enterTimer = 0;
function clearEnter() { clearTimeout(enterTimer); enterTimer = setTimeout(() => { S.enter = false; S.mealEnter = false; document.querySelectorAll('.enter').forEach(e => e.classList.remove('enter')); }, 1400); }

let toastTimer = 0;
function toast(msg, ...acts) {
  const t = $('#toast'); t.textContent = '';
  const s = document.createElement('span'); s.textContent = msg; t.append(s);
  for (let i = 0; i + 1 < acts.length; i += 2) {
    const b = document.createElement('button'), fn = acts[i + 1];
    b.type = 'button'; b.textContent = acts[i]; b.onclick = () => { t.hidden = true; fn(); }; t.append(b);
  }
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, acts.length ? 6500 : 3200);
}
async function act(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) {
    if (e && e.code === 'unauthorized') showGate('Enter your household code to keep going.');
    else { toast('That did not save. Try again.'); refresh(); }
    return false;
  }
}

const chain = {}, want = {}, pc = {};
function queue(id, fn) { pc[id] = (pc[id] || 0) + 1; chain[id] = (chain[id] || Promise.resolve()).then(fn, fn).then(r => { if (--pc[id] === 0) { delete want[id]; delete chain[id]; delete pc[id]; } return r; }); return chain[id]; }
function bump(id, delta) {
  const it = S.items.find(x => x.id === id); if (!it || want[id] === 0) return;
  const cur = want[id] != null ? want[id] : qtyOf(it), next = cur + delta;
  if (next < 1) {
    want[id] = 0;
    queue(id, () => act(() => api.removeItem(id))).then(ok => {
      if (ok) toast('Used the last ' + it.name,
        'Undo', () => act(() => api.addItem({ name: it.name, loc: it.loc || 'Fridge', exp: it.exp, qty: 1, cat: catOf(it) })),
        'Add to list', () => act(() => api.addShop(it.name), it.name + ' is on your list'));
    });
    return;
  }
  want[id] = Math.min(next, 99);
  const v = want[id];
  queue(id, () => act(() => api.setQty(id, v)));
}

function fmtDate(s) { return new Date(s + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: daysLeft(s) > 300 ? 'numeric' : undefined }); }
function byExp(a, b) { return a.exp < b.exp ? -1 : a.exp > b.exp ? 1 : String(a.name).localeCompare(String(b.name)); }

/* ---------- rendering ---------- */
function rowHtml(i, idx) {
  const d = daysLeft(i.exp), q = qtyOf(i);
  const cls = d <= 3 ? 'hot' : d <= 7 ? 'soon' : 'fresh';
  const p = d < 0 ? 100 : Math.max(7, Math.min(100, Math.round(d / 14 * 100)));
  const num = d < 0 ? '−' + Math.abs(d) : d > 99 ? (d > 365 ? Math.round(d / 365) : Math.round(d / 30)) : String(d);
  const unit = d < 0 ? 'past' : d === 0 ? 'today' : d > 365 ? 'yrs' : d > 99 ? 'mos' : d === 1 ? 'day' : 'days';
  const id = esc(i.id);
  const acts = '<div class="acts"><div class="step" role="group" aria-label="Quantity of ' + esc(i.name) + '"><button data-act="dec" data-id="' + id + '" aria-label="' + (q === 1 ? 'Use the last one' : 'Use one') + '">&minus;</button><output>' + q + '</output><button data-act="inc" data-id="' + id + '" aria-label="Add one">+</button></div><button class="mini" data-act="edit" data-id="' + id + '">Edit</button><button class="mini" data-act="restock" data-id="' + id + '">Restock</button></div>';
  const low = (i.loc === 'Pantry' && q === 1) ? '<span class="tag low">Last one</span>' : '';
  return '<div class="item ' + cls + '" style="--i:' + idx + '"><div class="days" style="--p:' + p + '%"><div class="in"><b>' + num + '</b><small>' + unit + '</small></div></div><div class="info"><strong>' + esc(i.name) +
    (q > 1 ? '<span class="qb">×' + q + '</span>' : '') + low + '</strong><span class="meta">' + esc(i.loc || 'Fridge') + ' · ' + (d < 0 ? 'expired ' : 'expires ') + fmtDate(i.exp) + '</span>' + acts + '</div></div>';
}

function renderFridge() {
  const all = S.items.filter(i => i.exp).slice().sort(byExp);
  const uf = all.filter(i => daysLeft(i.exp) <= 3).length;
  const wk = all.filter(i => { const d = daysLeft(i.exp); return d > 3 && d <= 7; }).length;
  const lt = all.length - uf - wk;
  const sum = $('#summary');
  if (!S.ready) { sum.innerHTML = '<div class="summary">Loading your fridge</div>'; }
  else if (S.err === 'config') { sum.innerHTML = '<div class="summary warn">The server is not set up yet. Add HOUSEHOLD_CODE in Netlify and redeploy.</div>'; }
  else if (S.err) { sum.innerHTML = '<div class="summary warn">Could not reach your fridge. Check your connection. Trying again.</div>'; }
  else if (!all.length) { sum.innerHTML = ''; }
  else {
    const seg = (n, c) => n ? '<i class="' + c + '" style="flex:' + n + '"></i>' : '';
    sum.innerHTML = '<div class="meter' + (uf ? ' warn' : '') + '" style="--i:0"><div class="mh"><div class="mhl">' +
      (uf ? '<span class="big">' + uf + '</span><span class="lbl">' + (uf === 1 ? 'item to use first' : 'items to use first') + '<small>expiring within 3 days</small></span>'
          : '<span class="big ok">All clear</span><span class="lbl"><small>Nothing expires in the next 3 days</small></span>') +
      '</div><div class="mhr"><b>' + all.length + '</b><small>' + (all.length === 1 ? 'item' : 'items') + '</small></div></div>' +
      '<div class="bar" role="img" aria-label="' + uf + ' use first, ' + wk + ' this week, ' + lt + ' later">' + seg(uf, 'h') + seg(wk, 's') + seg(lt, 'f') + '</div>' +
      '<div class="legend"><span class="h">' + uf + ' use first</span><span class="s">' + wk + ' this week</span><span class="f">' + lt + ' later</span></div></div>';
  }
  $('#summary').classList.toggle('enter', S.enter);
  $('#notice').innerHTML = '';

  $('#filters').innerHTML = ['All'].concat(LOCS).map(l => '<button class="chip" data-filter="' + l + '" aria-pressed="' + (S.filter === l) + '">' + l + '</button>').join('');

  const counts = {}; all.forEach(i => { const c = catOf(i); counts[c] = (counts[c] || 0) + 1; });
  if (S.cat !== 'All' && !counts[S.cat]) S.cat = 'All';
  $('#catFilters').hidden = !all.length;
  $('#catFilters').innerHTML = ['All'].concat(CATS.filter(c => counts[c])).map(c => '<button class="chip" data-cat="' + esc(c) + '" aria-pressed="' + (S.cat === c) + '">' + esc(c) + (c === 'All' ? '' : '<small>' + counts[c] + '</small>') + '</button>').join('');
  const qq = S.q.trim().toLowerCase();

  const shown = all.filter(i => (S.filter === 'All' || (i.loc || 'Fridge') === S.filter) && (S.cat === 'All' || catOf(i) === S.cat) &&
    (!qq || String(i.name).toLowerCase().includes(qq) || catOf(i).toLowerCase().includes(qq)));
  const bands = [['Use first', x => daysLeft(x.exp) <= 3], ['This week', x => { const d = daysLeft(x.exp); return d > 3 && d <= 7; }], ['Later', x => daysLeft(x.exp) > 7]];
  let html = '', idx = 1;
  bands.forEach(([title, fn]) => {
    const rows = shown.filter(fn);
    if (rows.length) html += '<div class="band"><h2>' + title + '<em>' + rows.length + '</em></h2>' + rows.map(r => rowHtml(r, idx++)).join('') + '</div>';
  });
  if (!html && S.ready && !S.err) {
    html = '<div class="empty"><span>' + (all.length ? (qq ? 'No matches for "' + esc(S.q.trim()) + '".' : S.cat !== 'All' || S.filter !== 'All' ? 'Nothing here with those filters.' : 'Nothing here.') : 'Your fridge is empty. Scan a barcode or add the first item to start tracking.') + '</span>' +
      '<button class="btn" data-tab="add" style="padding:12px 22px">Add an item</button></div>';
  }
  const list = $('#list'); list.innerHTML = html; list.classList.toggle('enter', S.enter);
}

function renderShop() {
  const rows = S.shop.slice().sort((a, b) => (a.done - b.done) || ((a.ts || 0) - (b.ts || 0)));
  $('#shopList').innerHTML = rows.length ? rows.map(s =>
    '<div class="shop' + (s.done ? ' done' : '') + '"><input type="checkbox" data-shopid="' + esc(s.id) + '"' + (s.done ? ' checked' : '') + ' aria-label="Got ' + esc(s.text) + '"><span>' + esc(s.text) + (s.sug ? '<em class="tag sug">Suggested</em>' : '') + (s.auto ? '<em class="tag auto">Auto</em>' : '') + '</span>' +
    '<button class="x" data-act="rmshop" data-id="' + esc(s.id) + '" aria-label="Remove ' + esc(s.text) + '">&times;</button></div>').join('')
    : '<div class="empty">Nothing on the list. Items you restock from the fridge land here.</div>';
}

function renderMeals() {
  const btn = $('#mealBtn'), msg = $('#mealMsg');
  $('#hA').textContent = S.house.adults; $('#hK').textContent = S.house.kids;
  $('#cuisines').innerHTML = CUISINES.map(c => '<button type="button" class="chip" data-cuisine="' + c + '" aria-pressed="' + (S.cuisine === c) + '">' + c + '</button>').join('');
  $('#diets').innerHTML = DIETS.map(c => '<button type="button" class="chip" data-diet="' + c + '" aria-pressed="' + S.diets.includes(c) + '">' + c + '</button>').join('');
  const mh = S.mealHouse;
  $('#houseNote').textContent = S.meals && mh && (mh.adults !== S.house.adults || mh.kids !== S.house.kids || S.mealPrefs !== JSON.stringify([S.cuisine, S.diets]))
    ? 'Settings changed. Tap for new ideas to apply them.' : 'Kids count as about half a portion.';
  btn.disabled = S.busy;
  btn.textContent = S.busy ? 'Thinking…' : S.meals ? 'Give me different ideas' : 'What can I make?';
  msg.textContent = S.mealNote || '';
  const box = $('#meals');
  const hh = S.mealHouse || S.house;
  const who = hh.adults + (hh.adults === 1 ? ' adult' : ' adults') + (hh.kids ? ' + ' + hh.kids + (hh.kids === 1 ? ' kid' : ' kids') : '');
  box.innerHTML = (S.meals || []).map((r, n) => {
    const ing = Array.isArray(r.ingredients) ? r.ingredients.filter(x => x && x.name) : [];
    return '<div class="card recipe" style="--i:' + n + '"><h3>' + esc(r.title) + '</h3><div class="meta">' + (r.cuisine ? esc(r.cuisine) + ' · ' : '') + esc(r.minutes) + ' min · for ' + esc(who) + haveTag(r) + '</div>' +
      '<h4>Ingredients</h4><ul class="ing">' + ing.map(x => '<li><b>' + esc(x.amount) + '</b><span>' + esc(x.name) + '</span>' + (x.buy ? '<em>Buy</em>' : '') + '</li>').join('') + '</ul>' +
      '<h4>Steps</h4><ol>' + (r.steps || []).map(st => '<li>' + esc(st) + '</li>').join('') + '</ol>' +
      (buyList(r).length ? '<button class="btn ghost" data-act="needs" data-n="' + n + '">Add what I\'m missing to the list</button>' : '') +
      '<button class="btn ghost" data-act="planpick" data-n="' + n + '">Add to meal plan</button>' +
      '<button class="btn ghost" data-act="favidea" data-n="' + n + '">' + (isFav(r.title) ? '\u2665 Saved to favorites' : '\u2661 Save to favorites') + '</button>' +
      (S.planPick === n ? '<div class="planpick"><span class="hint" style="min-height:0">Which night?</span><div class="chips wrap">' + [0,1,2,3,4,5,6].map(k => { const d = today0(); d.setDate(d.getDate() + k); return '<button type="button" class="chip" data-act="planit" data-n="' + n + '" data-date="' + iso(d) + '">' + (k === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })) + '</button>'; }).join('') + '</div></div>' : '') + '</div>';
  }).join('');
  box.classList.toggle('enter', S.mealEnter);
}

/* ---------- quick add ---------- */
const QUICK = [
  ['Produce', 'Fridge', ['Apples', 'Avocados', 'Berries', 'Broccoli', 'Carrots', 'Celery', 'Cucumbers', 'Grapes', 'Lemons', 'Lettuce', 'Bell peppers', 'Spinach', 'Tomatoes', ['Bananas', 'Pantry'], ['Garlic', 'Pantry'], ['Onions', 'Pantry'], ['Potatoes', 'Pantry']]],
  ['Protein', 'Fridge', ['Chicken breasts', 'Ground beef', 'Bacon', 'Sausage', 'Steak', 'Salmon', 'Shrimp', 'Deli meat', 'Hot dogs']],
  ['Dairy & eggs', 'Fridge', ['Eggs', 'Milk', 'Butter', 'Cheese', 'Shredded cheese', 'Yogurt', 'Sour cream', 'Cream cheese']],
  ['Bread & grains', 'Pantry', ['Bread', 'Tortillas', 'Bagels', 'Pasta', 'Rice', 'Cereal', 'Oats']],
  ['Pantry & sauces', 'Pantry', ['Ketchup', 'Mustard', 'Mayo', 'Peanut butter', 'Jelly', 'Soy sauce', 'Hot sauce', 'BBQ sauce', 'Salsa', 'Canned beans', 'Canned tomatoes', 'Chicken broth', 'Olive oil', 'Flour', 'Sugar']],
  ['Drinks & snacks', 'Pantry', ['Juice', 'Soda', 'Chips', 'Crackers']],
  ['Freezer', 'Freezer', ['Ice cream', 'Frozen pizza', 'Frozen vegetables', 'Chicken nuggets', 'Frozen fruit']]
];
const quickItems = () => QUICK.flatMap(([g, loc, names]) => names.map(n => Array.isArray(n) ? { name: n[0], loc: n[1] } : { name: n, loc }));
function renderQuick() {
  const have = stockWords(), n = S.quick.size;
  $('#quickBody').innerHTML = '<p class="hint" style="min-height:0">Tap everything you have, then add them all at once. Dates are estimates, so you can fix any later.</p>' +
    QUICK.map(([g, loc, names]) => '<h5>' + esc(g) + '</h5><div class="chips wrap">' + names.map(x => {
      const nm = Array.isArray(x) ? x[0] : x;
      return '<button type="button" class="chip' + (owned({ name: nm }, have) ? ' have' : '') + '" data-q="' + esc(nm) + '" aria-pressed="' + S.quick.has(nm) + '">' + esc(nm) + '</button>';
    }).join('') + '</div>').join('') +
    '<button type="button" class="btn" data-act="quickadd"' + (n ? '' : ' disabled') + '>' + (n ? 'Add ' + n + (n === 1 ? ' item' : ' items') : 'Pick some items') + '</button>';
}

function renderAdd() {
  $('#locSeg').innerHTML = LOCS.map(l => '<button type="button" class="chip" data-loc="' + l + '" aria-pressed="' + (S.addLoc === l) + '">' + l + '</button>').join('');
  $('#catSeg').innerHTML = CATS.map(c => '<button type="button" class="chip" data-addcat="' + esc(c) + '" aria-pressed="' + (S.addCat === c) + '">' + esc(c) + '</button>').join('');
  $('#qv').textContent = S.qty;
  $('#addTitle').textContent = S.editId ? 'Edit item' : 'Add an item';
  $('#addBtn').textContent = S.editId ? 'Save changes' : 'Add to Chill';
  $('#cancelEdit').hidden = !S.editId;
  $('#scanBtn').hidden = !!S.editId;
  $('#photoBtn').hidden = !S.canPhoto || !!S.editId;
  $('#photoBtn').disabled = S.reading;
  renderReceipt(); renderQuick();
}

function renderSync() {
  const el = $('#sync');
  el.className = 'sync' + (S.online ? '' : ' local');
  el.lastElementChild.textContent = !S.ready ? 'Loading' : S.online ? 'Shared and live' : 'Offline';
}

function render() { renderSmart(); renderSync(); renderFridge(); renderAdd(); renderMeals(); renderPlan(); renderFavs(); renderShop(); }

function setTab(t) {
  if (!['fridge', 'meals', 'add', 'recipes', 'shop'].includes(t)) t = 'fridge';
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + t));
  document.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (location.hash !== '#' + t) location.hash = t;
  window.scrollTo(0, 0);
  if (t === 'shop') maybeAutoSuggest();
  if (t === 'fridge' && S.ready) { S.enter = true; renderFridge(); clearEnter(); }
}
window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));

/* ---------- add form ---------- */
function suggestExp() {
  if (!S.expAuto || S.editId) return;
  const d = shelfLife($('#name').value, S.addLoc), hint = $('#dateHint');
  if (d) { $('#exp').value = plus(d); hint.textContent = 'Estimated from typical shelf life. Check the package.'; }
  else { $('#exp').value = ''; hint.textContent = ''; }
}
function syncCat() { if (S.catAuto && !S.editId) S.addCat = guessCat($('#name').value); }
$('#name').addEventListener('input', () => { suggestExp(); syncCat(); renderAdd(); });
$('#exp').addEventListener('input', () => { S.expAuto = false; $('#dateHint').textContent = ''; });

function endEdit() {
  S.editId = null; S.qty = 1; S.expAuto = true; S.scanCode = null; S.catAuto = true; S.addCat = 'Other';
  $('#name').value = ''; $('#exp').value = ''; $('#dateHint').textContent = ''; $('#addMsg').textContent = '';
  renderAdd();
}
function stockFromShop(text) {
  endEdit(); $('#name').value = text; S.addLoc = 'Fridge'; suggestExp(); syncCat(); renderAdd(); setTab('add');
}

$('#addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#name').value.trim(), exp = $('#exp').value, msg = $('#addMsg');
  if (!name) { msg.textContent = 'Type what it is.'; $('#name').scrollIntoView({ block: 'center' }); $('#name').focus(); return; }
  if (!exp) { msg.textContent = 'Pick an expiration date, or tap a quick date.'; $('#exp').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('#exp').focus(); return; }
  const q = S.qty;
  if (S.editId) {
    const eid = S.editId;
    const okE = await act(() => api.updateItem(eid, { name, loc: S.addLoc, exp, qty: q, cat: S.addCat }), 'Saved');
    if (okE) { endEdit(); setTab('fridge'); }
    return;
  }
  const code0 = S.scanCode;
  const ok = await act(() => api.addItem({ name, loc: S.addLoc, exp, qty: q, cat: S.catAuto ? guessCat(name) : S.addCat }), (q > 1 ? q + ' × ' : '') + name + ' added');
  if (ok) {
    if (code0) { barcodes[code0] = name; saveBarcodes(); }
    $('#name').value = ''; $('#exp').value = ''; S.qty = 1; S.expAuto = true; S.scanCode = null; S.catAuto = true; S.addCat = 'Other'; $('#dateHint').textContent = ''; msg.textContent = ''; setTab('fridge');
  }
});

$('#shopForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = $('#shopIn').value.trim(); if (!v) return;
  $('#shopIn').value = '';
  await act(() => api.addShop(v));
});

/* ---------- barcode scanner ---------- */
let scanStream = null, scanRun = false, zxReader = null;
function loadZx() {
  return new Promise((res, rej) => {
    if (window.ZXing) return res();
    const s = document.createElement('script'); s.src = '/vendor/zxing.min.js'; s.onload = res; s.onerror = rej; document.head.append(s);
  });
}
async function startScan() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('This browser cannot use the camera. Type the item in.'); return; }
  $('#scan').hidden = false; $('#scanMsg').textContent = 'Point at a barcode';
  try {
    let native = false;
    if ('BarcodeDetector' in window) {
      try { native = (await BarcodeDetector.getSupportedFormats()).includes('ean_13'); } catch (e) { native = false; }
    }
    if (native) {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const v = $('#scanVideo'); v.srcObject = scanStream; await v.play();
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      scanRun = true;
      const loop = async () => {
        if (!scanRun) return;
        try { const r = await det.detect(v); if (r.length) { onCode(r[0].rawValue); return; } } catch (e) {}
        setTimeout(loop, 120);
      };
      loop();
    } else {
      await loadZx();
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
      zxReader = new ZXing.BrowserMultiFormatReader(hints, 250);
      scanRun = true;
      await zxReader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, 'scanVideo', res => { if (res && scanRun) onCode(res.getText()); });
    }
  } catch (e) {
    stopScan(); toast('Could not open the camera. Allow camera access and try again.');
  }
}
function stopScan() {
  scanRun = false;
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  if (zxReader) { try { zxReader.reset(); } catch (e) {} zxReader = null; }
  const v = $('#scanVideo'); try { v.srcObject = null; } catch (e) {}
  $('#scan').hidden = true;
}
function onCode(c) { if (!scanRun) return; stopScan(); if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } lookup(String(c)); }
function fillName(n) {
  endEdit(); $('#name').value = n.slice(0, 80); suggestExp(); syncCat();
  if (!$('#exp').value) {
    // Unknown food: guess a date so Add works right away. The person can change it.
    $('#exp').value = plus(S.addLoc === 'Pantry' ? 180 : 7); S.expAuto = false;
    $('#dateHint').textContent = 'Guessed a date. Check the package and change it if needed.';
  }
  renderAdd(); setTab('add');
}
async function lookup(c) {
  const msg = $('#addMsg');
  const known = barcodes[c];
  if (known) { fillName(known); S.scanCode = c; msg.textContent = 'Found in your saved products. Check the date, then tap Add.'; return; }
  msg.textContent = 'Looking up ' + c + '…';
  try {
    const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(c) + '.json?fields=product_name,generic_name,brands');
    const j = await r.json();
    const p = j && j.status === 1 && j.product;
    const name = p && (p.product_name || p.generic_name);
    if (name) { fillName(name); S.scanCode = c; msg.textContent = 'Found it. Check the name and date, then tap Add.'; return; }
  } catch (e) {}
  endEdit(); S.scanCode = c; setTab('add');
  $('#addMsg').textContent = 'Not in the product database. Type the name once and I will remember it for next time.';
  $('#name').focus();
}
$('#scanBtn').addEventListener('click', startScan);
$('#scanCancel').addEventListener('click', stopScan);

/* ---------- Claude (through /api/ai) ---------- */
function toJpeg(file, max) {
  max = max || 1400;
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej({ code: 'image' }); };
    img.src = url;
  });
}
function parseJson(t) {
  t = String(t || '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (f) { try { return JSON.parse(f[1]); } catch (e) {} }
  const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return undefined;
}
async function aiJson(prompt, files, max, px) {
  const images = [];
  for (const f of files || []) images.push(await toJpeg(f, px));
  const r = await call('ai', { method: 'POST', body: { prompt, images, max_tokens: max || 1200 } });
  const v = parseJson(r.text);
  if (v === undefined) throw { code: 'invalid_json' };
  return v;
}
function aiError(err) {
  const c = err && err.code;
  if (c === 'no_key') return 'Claude is not set up yet. Add ANTHROPIC_API_KEY in Netlify and redeploy.';
  if (c === 'rate_limited') return 'Too many requests. Wait a minute and try again.';
  if (c === 'timeout') return 'That took too long. Try again.';
  if (c === 'unauthorized') { showGate('Enter your household code to keep going.'); return 'Enter your household code first.'; }
  if (c === 'image') return 'Could not open that photo. Try another.';
  return 'Could not get an answer from Claude right now. Try again.';
}

$('#photoBtn').addEventListener('click', () => $('#photo').click());
$('#photo').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  const msg = $('#addMsg'); S.reading = true; renderAdd(); msg.textContent = 'Reading the label…';
  try {
    const r = await aiJson('This photo shows a food package or its label. Reply with only a JSON object: {"name": a short plain product name such as "Whole milk" or "Cheddar cheese", "date": the printed use-by, best-by or expiration date as YYYY-MM-DD, or null if no date is readable}. Today is ' + iso(new Date()) + '; use it to fill in a missing year.', [f], 300);
    if (r && r.name) $('#name').value = String(r.name).slice(0, 80);
    if (r && /^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) { $('#exp').value = r.date; S.expAuto = false; $('#dateHint').textContent = ''; msg.textContent = 'Check the name and date, then tap Add.'; }
    else { suggestExp(); msg.textContent = $('#exp').value ? 'No printed date found, so I estimated one. Check it, then tap Add.' : 'Could not read a date. Pick one below, then tap Add.'; }
  } catch (err) { msg.textContent = aiError(err); }
  finally { S.reading = false; renderAdd(); }
});

function renderReceipt() {
  $('#receiptBtn').disabled = !!S.receiptBusy;
  const on = S.receipt.filter(x => x.on).length;
  $('#receiptList').innerHTML = S.receipt.length
    ? '<div class="rlist">' + S.receipt.map((x, i) => '<label class="rrow"><input type="checkbox" data-r="' + i + '"' + (x.on ? ' checked' : '') + '><span class="rn">' + esc(x.name) + '</span><span class="rm">' +
        (x.qty > 1 ? '×' + x.qty + ' · ' : '') + esc(x.loc) + ' · ' + fmtDate(x.exp) + '</span></label>').join('') + '</div>' +
      '<button type="button" class="btn" data-act="receiptadd"' + (on ? '' : ' disabled') + '>Add ' + on + (on === 1 ? ' item' : ' items') + '</button>'
    : '';
}
$('#receiptBtn').addEventListener('click', () => $('#receipt').click());
$('#receipt').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []).slice(0, 3); e.target.value = '';
  if (!files.length) return;
  const msg = $('#receiptMsg'); S.receiptBusy = true; S.receipt = []; renderReceipt(); msg.textContent = 'Reading the receipt…';
  try {
    const r = await aiJson('These photos show a grocery receipt. List only the food and drink items that were bought, skipping bags, tax, coupons and non-food items. Expand store shorthand into plain names (for example "ORG BNLS CHKN BRST" becomes "Chicken breasts"). Reply with only a JSON array of objects: {"name": string, "qty": number of units bought (1 if unclear), "loc": "Fridge", "Freezer" or "Pantry" for where it normally lives at home, "days": whole number of days it typically stays good once home}.', files, 2500);
    S.receipt = (Array.isArray(r) ? r : []).filter(x => x && x.name).slice(0, 60).map(x => {
      const loc = LOCS.includes(x.loc) ? x.loc : 'Fridge';
      const d = shelfLife(x.name, loc) || Math.max(1, Math.min(1095, Math.round(Number(x.days) || 7)));
      return { name: String(x.name).slice(0, 80), qty: Math.max(1, Math.min(99, Math.round(Number(x.qty) || 1))), loc, exp: plus(d), on: true };
    });
    msg.textContent = S.receipt.length ? 'Uncheck anything you do not want. Dates are estimates, so check the packages.' : 'No food items found. Try a clearer photo.';
  } catch (err) { msg.textContent = aiError(err); }
  finally { S.receiptBusy = false; renderReceipt(); }
});

$('#mealBtn').addEventListener('click', async () => {
  const usable = S.items.filter(i => i.exp && daysLeft(i.exp) >= 0).sort(byExp);
  if (!usable.length) { S.mealNote = 'Add a few items first.'; return renderMeals(); }
  S.busy = true; S.mealNote = ''; renderMeals();
  const hh = { adults: S.house.adults, kids: S.house.kids };
  S.mealHouse = hh; S.mealPrefs = JSON.stringify([S.cuisine, S.diets]);
  const list = usable.slice(0, 40).map(i => { const d = daysLeft(i.exp), q = qtyOf(i); return '- ' + i.name + (q > 1 ? ' x' + q : '') + ' (' + (i.loc || 'Fridge') + ', ' + (d === 0 ? 'expires today' : d + (d === 1 ? ' day left' : ' days left')) + ')'; }).join('\n');
  const soon = usable.filter(i => daysLeft(i.exp) <= 14), heroes = (soon.length ? soon : usable).map(i => i.name);
  const portions = hh.adults + hh.kids * 0.5;
  const diet = S.diets.length ? 'The dinner must be ' + S.diets.join(', ').toLowerCase() + (S.diets.includes('Kid-friendly') ? ' (mild flavors, easy for kids to eat)' : '') + '. If an item in the list does not fit, leave it out. ' : '';
  const styles = ['a comforting weeknight style', 'an Italian or Mediterranean style', 'a Mexican or Asian style'];
  const base = 'A family wants one dinner idea from what is in their kitchen. Items on hand, soonest to expire first (x4 means four of them):\n' + list +
    '\n\nThey are cooking for ' + hh.adults + (hh.adults === 1 ? ' adult' : ' adults') + ' and ' + hh.kids + (hh.kids === 1 ? ' kid' : ' kids') + '. Count each adult as one full portion and each kid as half a portion, so size every amount for ' + portions + ' adult portions. ' + diet +
    'Use US measurements (cups, tbsp, tsp, oz, lb) and give every ingredient an exact amount, using counts for things like eggs, cans or chicken breasts. Never call for more of an item than the quantity listed. Assume salt, pepper, cooking oil and common spices are on hand, but still list them with amounts. ' +
    'Reply with only one JSON object: {"title": string, "cuisine": a one or two word style label such as "Italian" or "Vegan Mexican", "minutes": number, "ingredients": [{"name": string, "amount": string such as "1.5 lb" or "2 tbsp", "buy": true only if it is not in the list above and not a basic pantry staple}], "steps": [3 to 6 short strings that include key amounts, temperatures and times]}. Use item names from the list for ingredients that come from it.';
  const jobs = [0, 1, 2].map(n => aiJson(base + '\n\nThis is idea ' + (n + 1) + ' of 3, and the other two are different dinners. Build this one around ' + heroes[n % heroes.length] + ' as the main ingredient. ' +
    (S.cuisine !== 'Any' ? 'Make it ' + S.cuisine + ' style.' : 'Lean toward ' + styles[n] + ' if it fits the ingredients.'), null, 1100));
  const res = await Promise.allSettled(jobs);
  const ok = res.filter(r => r.status === 'fulfilled' && r.value && r.value.title).map(r => r.value);
  S.meals = ok.length ? ok : null;
  if (!ok.length) { const bad = res.find(r => r.status === 'rejected'); S.mealNote = bad ? aiError(bad.reason) : 'No ideas came back. Try again.'; }
  else { S.mealNote = ok.length < 3 ? 'Only ' + ok.length + (ok.length === 1 ? ' idea' : ' ideas') + ' came back. Tap again for more.' : ''; S.mealEnter = true; clearEnter(); }
  S.busy = false; renderMeals();
});

/* ---------- recipe from a photo ---------- */
const STAPLE = /^(salt|pepper|black pepper|kosher salt|sea salt|water|oil|olive oil|vegetable oil|canola oil|cooking spray|sugar|flour|ice|paprika|smoked paprika|cumin|oregano|thyme|chili powder|garlic powder|onion powder|cayenne|cinnamon|italian seasoning|cajun seasoning|creole seasoning|red pepper flakes|bay leaf|bay leaves)\b/i;
const words = n => String(n).toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4).map(w => w.replace(/(ies|es|s)$/, ''));
const stockWords = () => S.items.filter(i => i.exp && daysLeft(i.exp) >= 0).map(i => words(i.name));
const isStaple = x => STAPLE.test(String(x.name).trim());
const sameWord = (a, b) => a === b || a.includes(b) || b.includes(a);
// An ingredient is on hand when every word of the fridge item is in it, or every word of it is in the fridge item.
const owned = (x, have) => { const w = words(x.name); return !!w.length && have.some(h => h.length && (h.every(a => w.some(b => sameWord(a, b))) || w.every(b => h.some(a => sameWord(a, b))))); };
function markBuy(rc) {
  const have = stockWords();
  return Object.assign({}, rc, { ingredients: rc.ingredients.map(x => Object.assign({}, x, { buy: !(isStaple(x) || owned(x, have)) })) });
}
// How many of a recipe's real ingredients are already in the fridge (salt, oil and common spices are ignored).
function haveCount(rc) {
  const have = stockWords(); let got = 0, tot = 0;
  for (const x of (rc && Array.isArray(rc.ingredients) ? rc.ingredients : [])) { if (!x || !x.name || isStaple(x)) continue; tot++; if (owned(x, have)) got++; }
  return { got, tot };
}
function haveTag(rc) {
  const { got, tot } = haveCount(rc); if (!tot) return '';
  return '<span class="tag have' + (got === tot ? ' all' : '') + '">' + (got === tot ? 'You have everything' : 'You have ' + got + ' of ' + tot) + '</span>';
}
$('#favPhotoBtn').addEventListener('click', () => $('#favPhoto').click());
$('#favPhoto').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []).slice(0, 3); e.target.value = '';
  if (!files.length) return;
  const msg = $('#favMsg'), btn = $('#favPhotoBtn'); btn.disabled = true; msg.textContent = 'Reading the recipe\u2026';
  try {
    const r = await aiJson('These photos show one recipe (a cookbook page, recipe card, screenshot or handwriting; several photos are pages of the same recipe). Copy it faithfully. Keep the original amounts exactly as written and do not scale, convert or invent anything. Reply with only one JSON object: {"title": the dish name, "minutes": total time as a number or "", "cuisine": a one or two word style label, "serving": the yield as written such as "4 servings" or "", "ingredients": [{"name": the ingredient only, "amount": the measurement as written such as "1 1/2 cups" or "2 cloves"}], "steps": [each step in order as a short string, keeping temperatures and times]}. If the photos are not a recipe, reply {"error": "not a recipe"}.', files, 2000, 1800);
    if (!r || r.error || !r.title || !Array.isArray(r.ingredients) || !r.ingredients.length) { msg.textContent = 'I could not find a recipe in that photo. Try a clearer, closer shot.'; return; }
    const typed = $('#favName').value.trim();
    const title = (typed || String(r.title)).slice(0, 80);
    if (isFav(title)) { msg.textContent = '"' + title + '" is already in your favorites.'; return; }
    const rc = { minutes: r.minutes === '' || r.minutes == null ? '' : r.minutes, cuisine: r.cuisine || '', serving: String(r.serving || '').slice(0, 40),
      ingredients: r.ingredients.filter(x => x && x.name).slice(0, 40).map(x => ({ name: String(x.name), amount: String(x.amount || ''), buy: false })),
      steps: (Array.isArray(r.steps) ? r.steps : []).slice(0, 20).map(String) };
    if (await act(() => api.addFav({ title, recipe: rc }))) { msg.textContent = 'Saved "' + title + '". Check the amounts against your photo. Tap Rename if the name is off.'; $('#favName').value = ''; }
  } catch (err) { msg.textContent = aiError(err); }
  finally { btn.disabled = false; }
});

/* ---------- meal plan ---------- */
const SLOTS = ['Breakfast', 'Lunch', 'Dinner'];
function weekStart(off) { const d = today0(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d; }
function dayLabel(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
const isFav = t => S.favs.some(f => String(f.title).toLowerCase() === String(t).toLowerCase());
function recipeFrom(r, hh) {
  return { minutes: r.minutes, cuisine: r.cuisine, adults: hh.adults, kids: hh.kids,
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).filter(x => x && x.name).slice(0, 25).map(x => ({ name: String(x.name), amount: String(x.amount || ''), buy: !!x.buy })),
    steps: (Array.isArray(r.steps) ? r.steps : []).slice(0, 10).map(String) };
}
function forWho(rc) { return rc && !rc.adults && rc.serving ? 'makes ' + rc.serving : rc && rc.adults ? 'for ' + rc.adults + (rc.adults === 1 ? ' adult' : ' adults') + (rc.kids ? ' + ' + rc.kids + (rc.kids === 1 ? ' kid' : ' kids') : '') : ''; }
function recipeBody(rc) {
  return '<div class="rb"><h5>Ingredients</h5><ul>' + rc.ingredients.map(x => '<li><b>' + esc(x.amount) + '</b> ' + esc(x.name) + (x.buy ? ' <em class="tag low">Buy</em>' : '') + '</li>').join('') + '</ul><h5>Steps</h5><ol>' + (rc.steps || []).map(t => '<li>' + esc(t) + '</li>').join('') + '</ol></div>';
}
function recipeSummary(rc) { return 'Recipe' + (rc.minutes ? ' \u00b7 ' + esc(rc.minutes) + ' min' : '') + (forWho(rc) ? ' \u00b7 ' + forWho(rc) : '') + haveTag(rc); }
function planEntryHtml(e) {
  const rc = e.recipe, has = rc && Array.isArray(rc.ingredients) && rc.ingredients.length, fav = isFav(e.title);
  const head = '<div class="pe"><span class="pt">' + esc(e.title) + '</span>' + (e.sug ? '<em class="tag sug">Suggested</em>' : '') +
    '<button class="x fv" data-act="favplan" data-id="' + esc(e.id) + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from favorites' : 'Save to favorites') + '">' + (fav ? '\u2665' : '\u2661') + '</button>' +
    '<button class="x" data-act="rmplan" data-id="' + esc(e.id) + '" aria-label="Remove ' + esc(e.title) + '">&times;</button></div>';
  if (has) return head + '<details class="pr" data-id="' + esc(e.id) + '"' + (S.opened.has(e.id) ? ' open' : '') + '><summary>' + recipeSummary(rc) + '</summary>' + recipeBody(rc) +
    (buyList(rc).length ? '<button type="button" class="btn ghost" data-act="planneeds" data-id="' + esc(e.id) + '">Add what I\'m missing to the list</button>' : '') + '</details>';
  if (S.genning.has(e.id)) return head + '<div class="pr gen" role="status">Writing the recipe\u2026</div>';
  return head + '<button type="button" class="btn ghost" data-act="getrecipe" data-id="' + esc(e.id) + '">Get the recipe</button>';
}
async function genRecipe(id) {
  const e = S.plan.find(x => x.id === id); if (!e || e.recipe || S.genning.has(id)) return;
  S.genning.add(id); renderPlan();
  try {
    const hh = { adults: S.house.adults, kids: S.house.kids }, portions = hh.adults + hh.kids * 0.5;
    const stock = S.items.filter(i => i.exp && daysLeft(i.exp) >= 0).slice(0, 40).map(i => i.name + ' x' + qtyOf(i)).join(', ') || 'nothing listed';
    const diet = S.diets.length ? ' It must be ' + S.diets.join(', ').toLowerCase() + '.' : '';
    const r = await aiJson('Write a recipe for "' + e.title + '" (a ' + e.slot.toLowerCase() + '). They are cooking for ' + hh.adults + (hh.adults === 1 ? ' adult' : ' adults') + ' and ' + hh.kids + (hh.kids === 1 ? ' kid' : ' kids') +
      '. Count each adult as one full portion and each kid as half, so size every amount for ' + portions + ' adult portions.' + diet + ' Use US measurements (cups, tbsp, tsp, oz, lb) and give every ingredient an exact amount, using counts for things like eggs or cans. Assume salt, pepper, cooking oil and common spices are on hand but still list them with amounts. What they have: ' + stock +
      '. Reply with only one JSON object: {"minutes": number, "cuisine": a one or two word style label, "ingredients": [{"name": string, "amount": string such as "1.5 lb" or "2 tbsp", "buy": true only if it is not in what they have and not a basic pantry staple}], "steps": [3 to 6 short strings with key amounts, temperatures and times]}.', null, 1000);
    if (!r || !Array.isArray(r.ingredients) || !r.ingredients.length) throw { code: 'invalid_json' };
    await api.setPlanRecipe(id, recipeFrom(r, hh));
  } catch (err) { toast(aiError(err)); }
  finally { S.genning.delete(id); renderPlan(); }
}
async function genMany(ids) {
  const q = ids.slice();
  const worker = async () => { while (q.length) await genRecipe(q.shift()); };
  await Promise.all([worker(), worker(), worker()]);
}
document.addEventListener('toggle', e => {
  const d = e.target; if (!d || !d.matches || !d.matches('details.pr')) return;
  if (d.open) S.opened.add(d.dataset.id); else S.opened.delete(d.dataset.id);
}, true);

function renderFavs() {
  const on = S.mealView === 'favs'; $('#mealFavs').hidden = !on; if (!on) return;
  const week = [0,1,2,3,4,5,6].map(k => { const d = today0(); d.setDate(d.getDate() + k); return d; });
  const all = S.favs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const ready = f => { const c = haveCount(f.recipe); return c.tot > 0 && c.got === c.tot; };
  const fs = S.favReady ? all.filter(ready) : all;
  const bar = all.some(f => f.recipe && Array.isArray(f.recipe.ingredients) && f.recipe.ingredients.length)
    ? '<div class="chips"><button type="button" class="chip" data-act="favready" aria-pressed="' + S.favReady + '">Can make now</button></div>' : '';
  $('#favList').innerHTML = bar + (fs.length ? fs.map(f => {
    const rc = f.recipe, has = rc && Array.isArray(rc.ingredients) && rc.ingredients.length;
    return '<div class="card recipe"><h3>' + esc(f.title) + '</h3><div class="meta">' + (rc && rc.cuisine ? esc(rc.cuisine) + ' \u00b7 ' : '') + (rc && rc.minutes ? esc(rc.minutes) + ' min \u00b7 ' : '') + (has ? forWho(rc) + haveTag(rc) : 'Recipe is written when you plan it') + '</div>' +
      (has ? '<details class="pr" style="margin-top:0"><summary>Recipe</summary>' + recipeBody(rc) + '</details>' : '') +
      '<div class="favact"><button type="button" class="btn" data-act="favpick" data-id="' + esc(f.id) + '">Add to plan</button><button type="button" class="btn ghost" data-act="renamefav" data-id="' + esc(f.id) + '">Rename</button><button type="button" class="btn ghost" data-act="rmfav" data-id="' + esc(f.id) + '">Remove</button></div>' +
      (S.favEdit === f.id ? '<form class="favren" data-id="' + esc(f.id) + '"><input type="text" name="t" maxlength="80" value="' + esc(f.title) + '" aria-label="Recipe name" autocomplete="off"><button type="submit">Save</button><button type="button" data-act="cancelren">Cancel</button></form>' : '') +
      (S.favPick === f.id ? '<div class="planpick"><span class="hint" style="min-height:0">Which meal?</span><div class="chips wrap">' + SLOTS.map(sl => '<button type="button" class="chip" data-act="favslot" data-slot="' + sl + '" aria-pressed="' + (S.favSlot === sl) + '">' + sl + '</button>').join('') + '</div><span class="hint" style="min-height:0">Which day?</span><div class="chips wrap">' +
        week.map((d, k) => '<button type="button" class="chip" data-act="favdate" data-id="' + esc(f.id) + '" data-date="' + iso(d) + '">' + (k === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })) + '</button>').join('') + '</div></div>' : '') + '</div>';
  }).join('') : '<div class="empty"><span>' + (S.favReady ? 'Nothing you can make with what is in the fridge right now.' : 'No favorites yet. Tap the heart on a planned meal, or Save to favorites on any suggestion.') + '</span></div>');
}
function renderPlan() {
  const on = S.mealView === 'plan';
  $('#mealPlan').hidden = !on; $('#mealFavs').hidden = S.mealView !== 'favs';
  document.querySelectorAll('#mealTabs .chip').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.mview === S.mealView)); b.setAttribute('aria-selected', String(b.dataset.mview === S.mealView)); });
  if (!on) return;
  const keep = document.querySelector('form.padd input'), kept = keep ? keep.value : '';
  const w0 = weekStart(S.weekOff), w6 = new Date(w0); w6.setDate(w6.getDate() + 6);
  $('#weekLabel').textContent = dayLabel(w0) + ' \u2013 ' + dayLabel(w6);
  $('#weekSub').textContent = S.weekOff === 0 ? 'This week' : S.weekOff === 1 ? 'Next week' : S.weekOff === -1 ? 'Last week' : '';
  $('#planAi').disabled = S.planBusy; $('#planAi').textContent = S.planBusy ? 'Thinking\u2026' : 'Suggest dinners for my empty days';
  const t = iso(today0());
  let html = '';
  for (let k = 0; k < 7; k++) {
    const d = new Date(w0); d.setDate(d.getDate() + k); const ds = iso(d);
    html += '<div class="day' + (ds === t ? ' today' : '') + (ds < t ? ' past' : '') + '"><h3>' + d.toLocaleDateString(undefined, { weekday: 'long' }) + '<em>' + dayLabel(d) + '</em>' + (ds === t ? '<span class="tag">Today</span>' : '') + '</h3>';
    for (const sl of SLOTS) {
      const es = S.plan.filter(e => e.date === ds && e.slot === sl).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const adding = S.addSlot && S.addSlot.date === ds && S.addSlot.slot === sl;
      html += '<div class="slot"><span class="sl">' + sl + '</span><div class="sent">' + es.map(planEntryHtml).join('') +
        (adding ? '<form class="padd" data-date="' + ds + '" data-slot="' + sl + '"><input type="text" name="t" maxlength="80" placeholder="What are you making?" aria-label="' + sl + ' on ' + dayLabel(d) + '" autocomplete="off"><button type="submit">Add</button><button type="button" data-act="cancelslot">Cancel</button></form>'
          : es.length ? '' : '<button type="button" class="addslot" data-act="addslot" data-date="' + ds + '" data-slot="' + sl + '">+ Add ' + sl.toLowerCase() + '</button>') + '</div></div>';
    }
    html += '</div>';
  }
  $('#weekDays').innerHTML = html;
  const inp = document.querySelector('form.padd input');
  if (inp) { if (kept) inp.value = kept; if (!keep) inp.focus(); else inp.focus(); }
}
function dinnersAi() {
  const t = iso(today0()), w0 = weekStart(S.weekOff), days = [];
  for (let k = 0; k < 7; k++) { const d = new Date(w0); d.setDate(d.getDate() + k); const ds = iso(d); if (ds >= t && !S.plan.some(e => e.date === ds && e.slot === 'Dinner')) days.push(d); }
  const msg = $('#planMsg');
  if (!days.length) { msg.textContent = 'Every dinner in this week is planned (or the week is over).'; return; }
  const usable = S.items.filter(i => i.exp && daysLeft(i.exp) >= 0).sort(byExp);
  if (!usable.length) { msg.textContent = 'Add a few items to the fridge first.'; return; }
  S.planBusy = true; msg.textContent = ''; renderPlan();
  const stock = usable.slice(0, 40).map(i => '- ' + i.name + ' x' + qtyOf(i) + ' (' + daysLeft(i.exp) + ' days left)').join('\n');
  const planned = S.plan.filter(e => e.slot === 'Dinner').map(e => e.title).slice(-14).join(', ') || 'nothing yet';
  const names = days.map(d => d.toLocaleDateString(undefined, { weekday: 'long' }));
  const diet = S.diets.length ? ' Dietary needs: ' + S.diets.join(', ') + '.' : '';
  const style = S.cuisine !== 'Any' ? ' Lean ' + S.cuisine + '.' : '';
  aiJson('A household wants dinner ideas for these days: ' + names.join(', ') + '.\nWhat they have (soonest to expire first):\n' + stock + '\nAlready planned dinners: ' + planned + '.\nFor each day in order, suggest one realistic dinner that uses the items expiring soonest first, with no repeats and no dish already planned. Household: ' + S.house.adults + ' adults, ' + S.house.kids + ' kids.' + diet + style + ' Reply with only a JSON array with exactly ' + days.length + ' objects, in the same order as the days: {"title": short dish name under 6 words}.', null, 500)
    .then(async r => {
      const list = (Array.isArray(r) ? r : []).filter(x => x && x.title);
      let n = 0; const ids = [];
      for (let k = 0; k < Math.min(list.length, days.length); k++) { const pid = uid(); if (!(await act(() => api.addPlan({ id: pid, date: iso(days[k]), slot: 'Dinner', title: String(list[k].title).slice(0, 80), sug: true })))) break; ids.push(pid); n++; }
      genMany(ids);
      msg.textContent = n ? 'Added ' + n + (n === 1 ? ' dinner' : ' dinners') + ' and writing the recipes. Remove any you do not want.' : 'No ideas came back. Try again.';
    })
    .catch(err => { msg.textContent = aiError(err); })
    .finally(() => { S.planBusy = false; renderPlan(); });
}
$('#planAi').addEventListener('click', dinnersAi);
document.addEventListener('submit', async e => {
  const fr = e.target.closest && e.target.closest('form.favren');
  if (fr) {
    e.preventDefault();
    const t = fr.elements.t.value.trim().slice(0, 80), id = fr.dataset.id; if (!t) return;
    if (S.favs.some(x => x.id !== id && String(x.title).toLowerCase() === t.toLowerCase())) { toast('You already have a favorite with that name.'); return; }
    S.favEdit = null;
    await act(() => api.renameFav(id, t), 'Renamed');
    return;
  }
  const f = e.target.closest && e.target.closest('form.padd'); if (!f) return;
  e.preventDefault();
  const title = f.elements.t.value.trim(); if (!title) return;
  const date = f.dataset.date, slot = f.dataset.slot; S.addSlot = null;
  const pid = uid();
  if (await act(() => api.addPlan({ id: pid, date, slot, title: title.slice(0, 80) }))) genRecipe(pid);
});

/* ---------- smart shopping suggestions ---------- */
let smartOn = lsGet('chill-smart') === '1', smartBusy = false;
function renderSmart() {
  $('#autoToggle').checked = !!S.autoRestock;
  $('#smartToggle').checked = smartOn;
  $('#smartBtn').hidden = !smartOn; $('#smartBtn').disabled = smartBusy;
  $('#smartBtn').textContent = smartBusy ? 'Thinking\u2026' : 'Suggest again';
}
async function smartSuggest(manual) {
  if (smartBusy || !S.ready) return;
  const have = S.items.filter(i => i.exp && daysLeft(i.exp) >= 0);
  const msg = $('#smartMsg');
  if (!have.length) { msg.textContent = 'Add a few items to the fridge first, then I can suggest what goes with them.'; return; }
  smartBusy = true; msg.textContent = 'Looking at what you have\u2026'; renderSmart();
  try {
    const stock = have.sort(byExp).slice(0, 40).map(i => '- ' + i.name + ' x' + qtyOf(i) + ' (' + daysLeft(i.exp) + ' days left)').join('\n');
    const list = S.shop.filter(x => !x.done).map(x => x.text).join(', ') || 'nothing';
    const diet = S.diets.length ? ' Dietary needs: ' + S.diets.join(', ') + '.' : '';
    const r = await aiJson('A household has these items (with days until they expire):\n' + stock + '\n\nAlready on their shopping list: ' + list + '.\nSuggest 3 to 5 grocery items to buy that would turn what they have into complete dinners, especially meals that use the items expiring soonest. Also include any pantry staple that is down to its last one and clearly needed. Do not suggest anything they already have or that is on the list. Household: ' + S.house.adults + ' adults, ' + S.house.kids + ' kids.' + diet + ' Reply with only a JSON array of objects: {"item": short grocery name, "why": under 8 words}.', null, 500);
    const known = S.shop.map(x => x.text.toLowerCase()).concat(have.map(i => i.name.toLowerCase()));
    const picks = (Array.isArray(r) ? r : []).filter(x => x && x.item).slice(0, 5).filter(x => { const n = String(x.item).toLowerCase(); return !known.some(k => k === n || k.includes(n) || n.includes(k)); });
    for (const x of picks) if (!(await act(() => api.addShop(String(x.item).slice(0, 80), true)))) break;
    msg.textContent = picks.length ? 'Added ' + picks.length + (picks.length === 1 ? ' suggestion' : ' suggestions') + ': ' + picks.map(x => x.item + (x.why ? ' (' + x.why + ')' : '')).join(', ') + '.' : (manual ? 'Nothing new to suggest right now.' : '');
    lsSet('chill-smart-ts', String(Date.now()));
  } catch (err) { msg.textContent = aiError(err); }
  finally { smartBusy = false; renderSmart(); }
}
function maybeAutoSuggest() {
  if (!smartOn || !S.ready) return;
  if (Date.now() - Number(lsGet('chill-smart-ts') || 0) > 6 * 36e5) smartSuggest(false);
}
$('#smartToggle').addEventListener('change', e => {
  smartOn = e.target.checked; lsSet('chill-smart', smartOn ? '1' : '0'); renderSmart();
  if (smartOn) smartSuggest(true); else $('#smartMsg').textContent = '';
});
$('#smartBtn').addEventListener('click', () => smartSuggest(true));
$('#autoToggle').addEventListener('change', async e => {
  const on = e.target.checked;
  if (await act(() => api.setSettings({ autoRestock: on }), on ? 'Auto-add is on' : 'Auto-add is off')) { if (on) refresh(); } else renderSmart();
});
$('#copyList').addEventListener('click', async () => {
  const lines = S.shop.filter(x => !x.done).map(x => x.text);
  if (!lines.length) { toast('Your list is empty.'); return; }
  try { await navigator.clipboard.writeText(lines.join('\n')); toast('Copied ' + lines.length + (lines.length === 1 ? ' item' : ' items') + '. Paste into the store app.'); }
  catch (e) { toast('Could not copy. Try again.'); }
});

/* ---------- clicks ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('button'); if (!el) return;
  if (el.dataset.tab) return setTab(el.dataset.tab);
  if (el.dataset.filter) { S.filter = el.dataset.filter; return renderFridge(); }
  if (el.dataset.mview) { S.mealView = el.dataset.mview; return render(); }
  if (el.dataset.cat) { S.cat = el.dataset.cat; return renderFridge(); }
  if (el.dataset.q) { S.quick.has(el.dataset.q) ? S.quick.delete(el.dataset.q) : S.quick.add(el.dataset.q); return renderQuick(); }
  if (el.dataset.addcat) { S.addCat = el.dataset.addcat; S.catAuto = false; return renderAdd(); }
  if (el.dataset.loc) { S.addLoc = el.dataset.loc; suggestExp(); return renderAdd(); }
  if (el.dataset.cuisine) { S.cuisine = el.dataset.cuisine; savePrefs(); return renderMeals(); }
  if (el.dataset.diet) {
    const d = el.dataset.diet;
    S.diets = S.diets.includes(d) ? S.diets.filter(x => x !== d)
      : S.diets.filter(x => !(d === 'Vegan' && x === 'Vegetarian') && !(d === 'Vegetarian' && x === 'Vegan')).concat(d);
    savePrefs(); return renderMeals();
  }
  if (el.dataset.days) { $('#exp').value = plus(Number(el.dataset.days)); S.expAuto = false; $('#dateHint').textContent = ''; return; }
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'edit': {
      const it = S.items.find(i => i.id === id); if (!it) break;
      S.editId = id; S.addLoc = LOCS.includes(it.loc) ? it.loc : 'Fridge'; S.qty = qtyOf(it); S.expAuto = false; S.addCat = catOf(it); S.catAuto = false;
      $('#name').value = it.name; $('#exp').value = it.exp; $('#dateHint').textContent = ''; $('#addMsg').textContent = '';
      renderAdd(); setTab('add'); break;
    }
    case 'weekprev': S.weekOff--; S.addSlot = null; renderPlan(); break;
    case 'weeknext': S.weekOff++; S.addSlot = null; renderPlan(); break;
    case 'addslot': S.addSlot = { date: el.dataset.date, slot: el.dataset.slot }; renderPlan(); break;
    case 'cancelslot': S.addSlot = null; renderPlan(); break;
    case 'rmplan': await act(() => api.removePlan(id)); break;
    case 'getrecipe': genRecipe(id); break;
    case 'favplan': {
      const e2 = S.plan.find(x => x.id === id); if (!e2) break;
      const ex = S.favs.find(f => String(f.title).toLowerCase() === String(e2.title).toLowerCase());
      if (ex) { await act(() => api.removeFav(ex.id), 'Removed from favorites'); break; }
      await act(() => api.addFav({ title: e2.title, ...(e2.recipe ? { recipe: e2.recipe } : {}) }), 'Saved to favorites'); break;
    }
    case 'favidea': {
      const r = (S.meals || [])[Number(el.dataset.n)]; if (!r) break;
      const ex = S.favs.find(f => String(f.title).toLowerCase() === String(r.title).toLowerCase());
      if (ex) { await act(() => api.removeFav(ex.id), 'Removed from favorites'); break; }
      await act(() => api.addFav({ title: String(r.title).slice(0, 80), recipe: recipeFrom(r, S.mealHouse || S.house) }), 'Saved to favorites'); renderMeals(); break;
    }
    case 'favready': S.favReady = !S.favReady; renderFavs(); break;
    case 'renamefav': S.favEdit = S.favEdit === id ? null : id; renderFavs(); { const i = document.querySelector('form.favren input'); if (i) { i.focus(); i.select(); } } break;
    case 'cancelren': S.favEdit = null; renderFavs(); break;
    case 'rmfav': await act(() => api.removeFav(id)); break;
    case 'favpick': S.favPick = S.favPick === id ? null : id; renderFavs(); break;
    case 'favslot': S.favSlot = el.dataset.slot; renderFavs(); break;
    case 'favdate': {
      const f = S.favs.find(x => x.id === id); if (!f) break;
      const pid = uid(), date = el.dataset.date, slot = S.favSlot; S.favPick = null;
      const ok = await act(() => api.addPlan({ id: pid, date, slot, title: f.title, ...(f.recipe ? { recipe: f.recipe.serving && !f.recipe.adults ? markBuy(f.recipe) : f.recipe } : {}) }));
      if (ok) { const dt = new Date(date + 'T00:00:00'); toast(slot + ' planned for ' + dt.toLocaleDateString(undefined, { weekday: 'long' }), 'View plan', () => { S.mealView = 'plan'; setTab('meals'); const ws = new Date(dt); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7)); S.weekOff = Math.round((ws - weekStart(0)) / (7 * 864e5)); render(); }); if (!f.recipe) genRecipe(pid); }
      renderFavs(); break;
    }
    case 'planneeds': {
      const e2 = S.plan.find(x => x.id === id); if (!e2 || !e2.recipe) break;
      const have = S.shop.map(s => s.text.toLowerCase());
      for (const x of buyList(e2.recipe)) if (!have.includes(x.toLowerCase())) await act(() => api.addShop(x.slice(0, 80)));
      toast('Added to your list'); break;
    }
    case 'planpick': S.planPick = S.planPick === Number(el.dataset.n) ? null : Number(el.dataset.n); renderMeals(); break;
    case 'planit': {
      const r = (S.meals || [])[Number(el.dataset.n)]; if (!r) break;
      const rc = recipeFrom(r, S.mealHouse || S.house);
      S.planPick = null; renderMeals();
      const dt = new Date(el.dataset.date + 'T00:00:00');
      if (await act(() => api.addPlan({ date: el.dataset.date, slot: 'Dinner', title: String(r.title).slice(0, 80), recipe: rc }))) toast('Planned for ' + dt.toLocaleDateString(undefined, { weekday: 'long' }), 'View plan', () => { S.mealView = 'plan'; setTab('meals'); const ws = new Date(dt); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7)); S.weekOff = Math.round((ws - weekStart(0)) / (7 * 864e5)); render(); });
      break;
    }
    case 'canceledit': endEdit(); setTab('fridge'); break;
    case 'quickadd': {
      const picks = quickItems().filter(x => S.quick.has(x.name)); let done = 0;
      for (const x of picks) {
        const days = shelfLife(x.name, x.loc) || (x.loc === 'Pantry' ? 180 : 7);
        if (await act(() => api.addItem({ name: x.name, loc: x.loc, exp: plus(days), qty: 1, cat: guessCat(x.name) }))) { done++; S.quick.delete(x.name); } else break;
      }
      renderQuick();
      if (done && done === picks.length) { toast(done + (done === 1 ? ' item' : ' items') + ' added'); document.querySelector('#quickCard').open = false; setTab('fridge'); }
      break;
    }
    case 'receiptadd': {
      const picks = S.receipt.filter(x => x.on), added = [];
      for (const x of picks) { if (await act(() => api.addItem({ name: x.name, loc: x.loc, exp: x.exp, qty: x.qty, cat: guessCat(x.name) }))) added.push(x); else break; }
      S.receipt = S.receipt.filter(x => !added.includes(x)); renderReceipt();
      if (added.length === picks.length && picks.length) { toast(added.length + (added.length === 1 ? ' item' : ' items') + ' added'); setTab('fridge'); }
      break;
    }
    case 'hminus': case 'hplus': {
      const k = el.dataset.who, step = el.dataset.act === 'hplus' ? 1 : -1;
      const h = { adults: S.house.adults, kids: S.house.kids };
      h[k] = Math.max(k === 'adults' ? 1 : 0, Math.min(12, h[k] + step));
      if (h[k] === S.house[k]) break;
      S.house = h; renderMeals();
      queue('house', () => act(() => api.setHouse(h)));
      break;
    }
    case 'qminus': S.qty = Math.max(1, S.qty - 1); renderAdd(); break;
    case 'qplus': S.qty = Math.min(99, S.qty + 1); renderAdd(); break;
    case 'dec': bump(id, -1); break;
    case 'inc': bump(id, 1); break;
    case 'restock': {
      const it = S.items.find(i => i.id === id); if (!it) break;
      const have = S.shop.some(s => !s.done && s.text.toLowerCase() === it.name.toLowerCase());
      want[id] = 0;
      const ok = await queue(id, () => act(() => api.removeItem(id)));
      if (ok && !have) await act(() => api.addShop(it.name), it.name + ' is on your list');
      break;
    }
    case 'rmshop': await act(() => api.removeShop(id)); break;
    case 'needs': {
      const r = (S.meals || [])[Number(el.dataset.n)]; if (!r) break;
      const have = S.shop.map(s => s.text.toLowerCase());
      for (const x of buyList(r)) if (!have.includes(x.toLowerCase())) await act(() => api.addShop(x.slice(0, 80)));
      toast('Added to your list'); break;
    }
  }
});

document.addEventListener('change', e => {
  const t = e.target, id = t.dataset && t.dataset.shopid;
  if (id) {
    act(() => api.toggleShop(id, t.checked));
    const row = S.shop.find(s => s.id === id);
    if (t.checked && row) toast('Got ' + row.text, 'Add to fridge', () => stockFromShop(row.text));
  }
  if (t.dataset && t.dataset.r != null) { const x = S.receipt[Number(t.dataset.r)]; if (x) { x.on = t.checked; renderReceipt(); } }
});

$('#q').addEventListener('input', e => { S.q = e.target.value; renderFridge(); });

/* ---------- start ---------- */
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); }); }
setTab('meals'); // the app always opens on the meal plan
render();
if (!code) showGate(); else refresh().then(startPolling);
