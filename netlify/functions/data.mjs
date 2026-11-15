import { getStore } from '@netlify/blobs';
import { codes, match, storeKey } from '../lib/auth.mjs';
import { restock } from '../lib/restock.mjs';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const clean = (s, n = 80) => String(s == null ? '' : s).slice(0, n);
const num = (v, lo, hi, d) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };

const CATS = ['Vegetables', 'Fruit', 'Protein', 'Dairy & Eggs', 'Spices', 'Condiments', 'Grains & Bread', 'Drinks', 'Snacks & Sweets', 'Leftovers', 'Other'];
function cleanRecipe(r) {
  if (!r || !Array.isArray(r.ingredients) || !r.ingredients.length) return null;
  return {
    minutes: clean(r.minutes, 10), cuisine: clean(r.cuisine, 30), serving: clean(r.serving, 40), adults: num(r.adults, 0, 12, 0), kids: num(r.kids, 0, 12, 0),
    ingredients: r.ingredients.slice(0, 40).map(x => ({ name: clean(x && x.name, 80), amount: clean(x && x.amount, 40), buy: !!(x && x.buy) })),
    steps: (Array.isArray(r.steps) ? r.steps : []).slice(0, 20).map(t => clean(t, 400))
  };
}
const okItem = i => i && typeof i.id === 'string' && i.id.length <= 64 && /^\d{4}-\d{2}-\d{2}$/.test(i.exp || '');

export default async (req) => {
  if (!codes().length) return json({ error: 'Server has no household code', code: 'not_configured' }, 503);
  const who = match(req.headers.get('x-household-code') || '');
  if (!who) return json({ error: 'Wrong code', code: 'unauthorized' }, 401);
  const KEY = storeKey(who);

  const store = getStore({ name: 'chill', consistency: 'strong' });
  const state = (await store.get(KEY, { type: 'json' })) || { items: [], shop: [], house: { adults: 2, kids: 0 } };
  state.items = state.items || []; state.plan = state.plan || []; state.favs = state.favs || []; state.settings = state.settings || { autoRestock: false }; state.shop = state.shop || []; state.house = state.house || { adults: 2, kids: 0 };

  if (req.method === 'GET') {
    if (state.settings.autoRestock && restock(state)) await store.setJSON(KEY, state);
    return json(state);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let b; try { b = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  switch (b.op) {
    case 'addItem': {
      const i = b.item; if (!okItem(i)) return json({ error: 'Bad item' }, 400);
      if (state.items.length >= 500) return json({ error: 'Too many items' }, 400);
      if (!state.items.some(x => x.id === i.id)) state.items.push({ id: i.id, name: clean(i.name), loc: ['Fridge', 'Freezer', 'Pantry'].includes(i.loc) ? i.loc : 'Fridge', exp: i.exp, qty: num(i.qty, 1, 99, 1), ...(CATS.includes(i.cat) ? { cat: i.cat } : {}), ts: num(i.ts, 0, 9e15, Date.now()) });
      break;
    }
    case 'removeItem': state.items = state.items.filter(x => x.id !== b.id); break;
    case 'updateItem': {
      const f = b.fields || {};
      state.items = state.items.map(x => {
        if (x.id !== b.id) return x;
        const n = { ...x };
        if ('qty' in f) n.qty = num(f.qty, 1, 99, x.qty);
        if ('name' in f) n.name = clean(f.name) || x.name;
        if ('loc' in f && ['Fridge', 'Freezer', 'Pantry'].includes(f.loc)) n.loc = f.loc;
        if ('cat' in f && CATS.includes(f.cat)) n.cat = f.cat;
        if ('exp' in f && /^\d{4}-\d{2}-\d{2}$/.test(f.exp)) n.exp = f.exp;
        return n;
      });
      break;
    }
    case 'addShop': {
      const s = b.shop; if (!s || typeof s.id !== 'string' || s.id.length > 64) return json({ error: 'Bad entry' }, 400);
      if (state.shop.length >= 300) return json({ error: 'List is full' }, 400);
      if (!state.shop.some(x => x.id === s.id)) state.shop.push({ id: s.id, text: clean(s.text), done: false, ...(s.sug ? { sug: true } : {}), ts: num(s.ts, 0, 9e15, Date.now()) });
      break;
    }
    case 'updateShop': state.shop = state.shop.map(x => x.id === b.id ? { ...x, done: !!(b.fields && b.fields.done) } : x); break;
    case 'removeShop': state.shop = state.shop.filter(x => x.id !== b.id); break;
    case 'addPlan': {
      const e = b.entry; if (!e || typeof e.id !== 'string' || e.id.length > 64 || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || !['Breakfast', 'Lunch', 'Dinner'].includes(e.slot) || !clean(e.title).trim()) return json({ error: 'Bad entry' }, 400);
      if (state.plan.length >= 400) return json({ error: 'Plan is full' }, 400);
      const rc = cleanRecipe(e.recipe);
      const cutoff = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
      state.plan = state.plan.filter(x => x.date >= cutoff);
      if (!state.plan.some(x => x.id === e.id)) state.plan.push({ id: e.id, date: e.date, slot: e.slot, title: clean(e.title), ...(e.sug ? { sug: true } : {}), ...(rc ? { recipe: rc } : {}), ts: num(e.ts, 0, 9e15, Date.now()) });
      break;
    }
    case 'setPlanRecipe': { const rc = cleanRecipe(b.recipe); if (!rc) return json({ error: 'Bad recipe' }, 400); state.plan = state.plan.map(x => x.id === b.id ? { ...x, recipe: rc } : x); break; }
    case 'addFav': {
      const f = b.fav; if (!f || typeof f.id !== 'string' || f.id.length > 64 || !clean(f.title).trim()) return json({ error: 'Bad favorite' }, 400);
      if (state.favs.length >= 150) return json({ error: 'Too many favorites' }, 400);
      const t = clean(f.title).toLowerCase(), rc = cleanRecipe(f.recipe);
      if (!state.favs.some(x => x.id === f.id || String(x.title).toLowerCase() === t)) state.favs.push({ id: f.id, title: clean(f.title), ...(rc ? { recipe: rc } : {}), ts: num(f.ts, 0, 9e15, Date.now()) });
      break;
    }
    case 'renameFav': {
      const t = clean(b.title).trim(); if (!t) return json({ error: 'Bad name' }, 400);
      if (state.favs.some(x => x.id !== b.id && String(x.title).toLowerCase() === t.toLowerCase())) return json({ error: 'Already a favorite' }, 409);
      state.favs = state.favs.map(x => x.id === b.id ? { ...x, title: t } : x); break;
    }
    case 'removeFav': state.favs = state.favs.filter(x => x.id !== b.id); break;
    case 'setSettings': state.settings = { ...state.settings, autoRestock: !!b.autoRestock }; if (state.settings.autoRestock) restock(state); break;
    case 'removePlan': state.plan = state.plan.filter(x => x.id !== b.id); break;
    case 'setHouse': state.house = { adults: num(b.adults, 1, 12, 2), kids: num(b.kids, 0, 12, 0) }; break;
    default: return json({ error: 'Unknown op' }, 400);
  }
  await store.setJSON(KEY, state);
  return json({ ok: true });
};

export const config = { path: '/api/data' };
