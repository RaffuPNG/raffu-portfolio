// Orders CRUD using Netlify Blobs
import { getStore } from '@netlify/blobs';

const STORE = getStore({ name: 'commission-orders' });
const KEY = 'orders';

const base = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: base };
  }

  const isAuthed = !!context.clientContext?.user;

  // Helpers
  async function read(){ return (await STORE.get(KEY, { type:'json', consistency:'strong' })) || []; }
  async function write(v){ await STORE.setJSON(KEY, v); }

  try{
    if (event.httpMethod === 'GET') {
      if (!isAuthed) return { statusCode: 401, headers: base, body: JSON.stringify({ error:'auth required' }) };
      const orders = await read();
      return { statusCode: 200, headers: base, body: JSON.stringify({ orders }) };
    }

    if (event.httpMethod === 'POST') {
      // Public: save a new authorized order
      const body = JSON.parse(event.body||'{}');
      const orders = await read();
      const id = 'ord_' + Math.random().toString(36).slice(2,9);
      orders.unshift({
        id,
        createdAt: Date.now(),
        status: body.status || 'authorized',
        slotIndex: body.slotIndex,
        email: body.email,
        description: body.description,
        package: body.package,
        priceLabel: body.priceLabel,
        extras: body.extras || 0,
        totalEUR: body.totalEUR,
        paypalOrderId: body.paypalOrderId || '',
        paypalAuthId: body.paypalAuthId || '',
        payerEmail: body.payerEmail || ''
      });
      await write(orders);
      return { statusCode: 200, headers: base, body: JSON.stringify({ ok:true, id }) };
    }

    if (event.httpMethod === 'PUT') {
      // Admin: update status
      if (!isAuthed) return { statusCode: 401, headers: base, body: JSON.stringify({ error:'auth required' }) };
      const body = JSON.parse(event.body||'{}');
      const { id, status } = body;
      if (!id) return { statusCode: 400, headers: base, body: JSON.stringify({ error:'id required' }) };
      const orders = await read();
      const i = orders.findIndex(o=>o.id===id);
      if (i===-1) return { statusCode: 404, headers: base, body: JSON.stringify({ error:'not found' }) };
      orders[i].status = status || orders[i].status;
      await write(orders);
      return { statusCode: 200, headers: base, body: JSON.stringify({ ok:true }) };
    }

    return { statusCode: 405, headers: base, body: JSON.stringify({ error:'method not allowed' }) };
  }catch(e){
    return { statusCode: 500, headers: base, body: JSON.stringify({ error: e.message }) };
  }
}
