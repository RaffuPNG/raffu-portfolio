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

export default async (request, context) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: base });
  if (!context?.clientContext?.user) return json(401, { error: 'auth required' });

  try {
    const store = getStore({ name: 'commission-orders' });
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
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
