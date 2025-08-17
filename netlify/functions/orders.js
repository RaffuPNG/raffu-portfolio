import { getStore } from '@netlify/blobs';

const KEY = 'orders';

const base = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: base });

export default async (request, context) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: base });

  const isAuthed = !!context?.clientContext?.user;

  try {
    const store = getStore({ name: 'commission-orders' });
    const read = async () => (await store.get(KEY, { type: 'json', consistency: 'strong' })) || [];
    const write = async (v) => { await store.setJSON(KEY, v); };

    if (request.method === 'GET') {
      if (!isAuthed) return json(401, { error: 'auth required' });
      const orders = await read();
      return json(200, { orders });
    }

    if (request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }

      const orders = await read();
      const id = 'ord_' + Math.random().toString(36).slice(2, 9);

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
      return json(200, { ok: true, id });
    }

    if (request.method === 'PUT') {
      if (!isAuthed) return json(401, { error: 'auth required' });
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const { id, status } = body;

      const orders = await read();
      const i = orders.findIndex(o => o.id === id);
      if (i === -1) return json(404, { error: 'not found' });

      orders[i].status = status || orders[i].status;
      await write(orders);
      return json(200, { ok: true });
    }

    return json(405, { error: 'method not allowed' });
  } catch (e) {
    console.error('orders error:', e);
    return json(500, { error: e?.message || String(e) });
  }
};
