import { createHash, timingSafeEqual } from 'node:crypto';

// HOUSEHOLD_CODE may hold several codes separated by commas. Each code opens its own fridge.
export function codes() {
  return String(process.env.HOUSEHOLD_CODE || '').split(',').map(s => s.trim()).filter(Boolean);
}
const sha = s => createHash('sha256').update(String(s)).digest();

// Returns the matching code (or null). Compares hashes so lengths never leak.
export function match(given) {
  const g = sha(given || '');
  let found = null;
  for (const c of codes()) if (timingSafeEqual(g, sha(c))) found = c;
  return found;
}
export const storeKey = code => 'state-' + sha(code).toString('hex').slice(0, 24);
