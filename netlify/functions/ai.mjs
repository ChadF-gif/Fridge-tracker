const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  let r = 0; for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

export default async (req) => {
  const secret = process.env.HOUSEHOLD_CODE, key = process.env.ANTHROPIC_API_KEY;
  if (!secret) return json({ error: 'Server has no household code', code: 'not_configured' }, 503);
  if (!same(req.headers.get('x-household-code') || '', secret)) return json({ error: 'Wrong code', code: 'unauthorized' }, 401);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!key) return json({ error: 'No API key', code: 'no_key' }, 503);

  let b; try { b = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const prompt = String(b.prompt || '').slice(0, 8000);
  const images = (Array.isArray(b.images) ? b.images : []).slice(0, 3).filter(s => typeof s === 'string' && s.length < 4e6);
  if (!prompt) return json({ error: 'Missing prompt' }, 400);
  const max = Math.max(100, Math.min(3000, Math.round(Number(b.max_tokens) || 1200)));

  const content = images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
  content.push({ type: 'text', text: prompt });

  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 24000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5', max_tokens: max, messages: [{ role: 'user', content }] })
    });
    if (r.status === 429) return json({ error: 'Rate limited', code: 'rate_limited' }, 429);
    if (!r.ok) return json({ error: 'Upstream error', code: 'upstream' }, 502);
    const d = await r.json();
    const text = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return json({ text });
  } catch (e) {
    return e && e.name === 'AbortError' ? json({ error: 'Timed out', code: 'timeout' }, 504) : json({ error: 'Upstream error', code: 'upstream' }, 502);
  } finally { clearTimeout(t); }
};

export const config = { path: '/api/ai' };
