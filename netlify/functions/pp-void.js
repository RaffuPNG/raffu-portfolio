import { getStore } from '@netlify/blobs';

const KEY_ORDERS = 'orders';
const KEY_SLOTS  = 'status';

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
    const ordersStore = getStore({ name: 'commission-orders' });
    const slotsStore  = getStore({ name: 'commission-slots' });

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const { id } = body;

    const orders = (await ordersStore.get(KEY_ORDERS, { type: 'json', consistency: 'strong' })) || [];
    const i = orders.findIndex(x => x.id === id);
    if (i === -1) return json(404, { error: 'order not found' });

    const o = orders[i];

    const tk = await token();
    const r = await fetch(`${BASE}/v2/payments/authorizations/${o.paypalAuthId}/void`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tk}` }
    });

    if (!r.ok) {
      let j = {}; try { j = await r.json(); } catch {}
      throw new Error(j?.message || 'void failed');
    }

    // free slot back
    const slots = (await slotsStore.get(KEY_SLOTS, { type: 'json', consistency: 'strong' })) || [true, true, true, true];
    if (typeof o.slotIndex === 'number') slots[o.slotIndex] = true;
    await slotsStore.setJSON(KEY_SLOTS, slots);

    orders[i].status = 'voided';
    await ordersStore.setJSON(KEY_ORDERS, orders);

    return json(200, { ok: true });
  } catch (e) {
    console.error('pp-void error:', e);
    return json(500, { error: e?.message || String(e) });
  }
};
