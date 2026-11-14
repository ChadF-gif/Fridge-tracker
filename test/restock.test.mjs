import { restock } from '../netlify/lib/restock.mjs';
const now = Date.parse('2026-11-14T12:00:00Z');
const st = { items: [
  { id: 'a', name: 'Milk', exp: '2026-11-17' },      // within 7 days -> add
  { id: 'b', name: 'Beans', exp: '2027-06-01' },     // far -> skip
  { id: 'c', name: 'Eggs', exp: '2026-11-20' },      // on list already -> mark only
  { id: 'd', name: 'Spinach', exp: '2026-11-10' },   // already expired -> add
  { id: 'e', name: 'Yogurt', exp: '2026-11-16', rs: true } // already handled -> skip
], shop: [{ id: 'x', text: 'eggs', done: false }] };
console.log('changed:', restock(st, now));
console.log(st.shop.map(s => s.text + (s.auto ? ' (auto)' : '')).join(', '));
console.log('again changed:', restock(st, now), '| shop size:', st.shop.length);
st.shop = st.shop.filter(s => s.text !== 'Milk'); restock(st, now);
console.log('removed item stays removed:', !st.shop.some(s => s.text === 'Milk'));
