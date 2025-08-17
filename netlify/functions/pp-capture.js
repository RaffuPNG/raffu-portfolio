import { getStore } from '@netlify/blobs';

const KEY = 'orders';

const ENV = (process.env.PAYPAL_ENV || 'live').toLowerCase();
const BASE = ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

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

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export default async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (!context.clientContext?.user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'auth required' }) };

  try {
    const store = getStore({ name: 'commission-orders' });
    const { id } = JSON.parse(event.body || '{}');

    const orders = (await store.get(KEY, { type: 'json', consistency: 'strong' })) || [];
    const o = orders.find(x => x.id === id);
    if (!o) return { statusCode: 404, headers, body: JSON.stringify({ error: 'order not found' }) };

    const tk = await token();
    const r = await fetch(`${BASE}/v2/payments/authorizations/${o.paypalAuthId}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({})
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || 'capture failed');

    o.status = 'captured';
    await store.setJSON(KEY, orders);

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, capture: j }) };
  } catch (e) {
    console.error('pp-capture error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e?.message || String(e) }) };
  }
};
