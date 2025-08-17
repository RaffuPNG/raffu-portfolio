// Capture an authorization (ADMIN ONLY)
import { getStore } from '@netlify/blobs';

const ORDERS = getStore({ name: 'commission-orders' });
const SLOTS  = getStore({ name: 'commission-slots' });
const KEY_ORDERS = 'orders';
const KEY_SLOTS  = 'status';

const PAYPAL_ENV = (process.env.PAYPAL_ENV || 'live').toLowerCase(); // 'live' or 'sandbox'
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
    const o = orders.find(x=>x.id===id);
    if (!o) return { statusCode: 404, headers, body: JSON.stringify({ error:'order not found' }) };

    const token = await getToken();
    const r = await fetch(`${BASE}/v2/payments/authorizations/${o.paypalAuthId}/capture`, {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json', 'Prefer':'return=representation' },
      body: JSON.stringify({})
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || 'capture failed');

    // Mark order captured
    o.status = 'captured';
    // Persist
    await ORDERS.setJSON(KEY_ORDERS, orders);
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, capture:j }) };
  }catch(e){
    return { statusCode: 500, headers, body: JSON.stringify({ error:e.message }) };
  }
}
