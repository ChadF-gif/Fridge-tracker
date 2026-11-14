// Puts items that are about to expire on the shopping list, once each.
// Mutates state; returns true if anything changed.
export function restock(state, now = Date.now(), days = 7) {
  const limit = new Date(now + days * 864e5).toISOString().slice(0, 10);
  state.shop = state.shop || [];
  let changed = false;
  for (const it of state.items || []) {
    if (it.rs || !it.exp || it.exp > limit) continue;
    const text = String(it.name || '').trim(); if (!text) continue;
    const id = 'rs-' + it.id;
    const onList = state.shop.some(s => s.id === id || (!s.done && String(s.text).toLowerCase() === text.toLowerCase()));
    if (!onList && state.shop.length < 300) state.shop.push({ id, text, done: false, auto: true, ts: now });
    it.rs = true; changed = true;
  }
  return changed;
}
