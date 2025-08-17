// Void an authorization (ADMIN ONLY) + free slot
import { getStore } from '@netlify/blobs';

const ORDERS = getStore({ name: 'commission-orders' });
const SLOTS  = getStore({ name: 'commission-slots' });
const KEY_ORDERS = 'orders';
const KEY_SLOTS  = 'status';

const PAYPAL_ENV = (process.env.PAYPAL_ENV || 'live').toLowerCase();
const BASE = PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

async function getToken(){
  const client = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  const auth = Buffer.from(`${client}:${secret}`).toString('base64');
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method:'POST',
    headers:{ 'Authorization': `Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body:'grant_type=client_credentials'
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || 'token error');
  return j.access_token;
}

export default async (event, context) => {
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  if (!context.clientContext?.user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error:'auth required' }) };
  }

  try{
    const { id } = JSON.parse(event.body||'{}'); // order id in our store
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error:'id required' }) };

    const orders = await ORDERS.get(KEY_ORDERS, { type:'json', consistency:'strong' }) || [];
    const idx = orders.findIndex(x=>x.id===id);
    if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error:'order not found' }) };
    const o = orders[idx];

    // Void at PayPal
    const token = await getToken();
    const r = await fetch(`${BASE}/v2/payments/authorizations/${o.paypalAuthId}/void`, {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${token}` }
    });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      throw new Error(j.message || 'void failed');
    }

    // Free the slot
    const slots = await SLOTS.get(KEY_SLOTS, { type:'json', consistency:'strong' }) || [true,true,true,true];
    if (typeof o.slotIndex === 'number') slots[o.slotIndex] = true;
    await SLOTS.setJSON(KEY_SLOTS, slots);

    // Mark order voided
    orders[idx].status = 'voided';
    await ORDERS.setJSON(KEY_ORDERS, orders);

    return { statusCode: 200, headers, body: JSON.stringify({ ok:true }) };
  }catch(e){
    return { statusCode: 500, headers, body: JSON.stringify({ error:e.message }) };
  }
}
