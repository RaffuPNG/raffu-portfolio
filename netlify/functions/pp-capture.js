import { getStore } from '@netlify/blobs';

const KEY = 'orders';

const ENV = (process.env.PAYPAL_ENV || 'live').toLowerCase();
const BASE = ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

const base = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};
const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: base });

/* auth helpers (same pattern as orders.js) */
function tokenFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)nf_jwt=([^;]+)/);
  return m ? m[1] : null;
}
async function verifyUser(request) {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const site = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(request.url).origin;
  const r = await fetch(`${site}/.netlify/identity/user`, { headers: { Authorization: `Bearer ${token}` }});
  if (!r.ok) return null;
  return r.json();
}
function requireAdminEmail(user) {
  const admin = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  if (!admin) return !!user;
  return user && user.email && user.email.toLowerCase() === admin;
}
/* ----------------------------------------- */

async function token() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const sec = process.env.PAYPAL_SECRET;
  const auth = Buffer.from(`${id}:${sec}`).toString('base64');
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || 'token error');
  return j.access_token;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: base });

  try {
    const user = await verifyUser(request);
    if (!requireAdminEmail(user)) return json(401, { error: 'auth required' });

    const store = getStore({ name: 'commission-orders' });
    let body = {}; try { body = await request.json(); } catch {}
    const { id } = body;

    const orders = (await store.get(KEY, { type: 'json', consistency: 'strong' })) || [];
    const o = orders.find(x => x.id === id);
    if (!o) return json(404, { error: 'order not found' });

    const tk = await token();
    const r = await fetch(`${BASE}/v2/payments/authorizations/${o.paypalAuthId}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || 'capture failed');

    o.status = 'captured';
    await store.setJSON(KEY, orders);

    return json(200, { ok: true, capture: j });
  } catch (e) {
    console.error('pp-capture error:', e);
    return json(500, { error: e?.message || String(e) });
  }
};
