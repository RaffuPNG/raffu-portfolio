import { getStore } from '@netlify/blobs';

/* ---------- helpers ---------- */
const KEY = 'orders';

const base = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: base });

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

  const site =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    new URL(request.url).origin;

  const r = await fetch(`${site}/.netlify/identity/user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json(); // { email, app_metadata, ... }
}

function requireAdminEmail(user) {
  const admin = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  if (!admin) return !!user;
  return user && user.email && user.email.toLowerCase() === admin;
}
/* -------------------------------- */

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: base });

  try {
    const store = getStore({ name: 'commission-orders' });

    // read & write helpers
    const read = async () => (await store.get(KEY, { type: 'json', consistency: 'strong' })) || [];
    const write = async (v) => { await store.setJSON(KEY, v); };

    // public: create (called from the website after authorization)
    if (request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const orders = await read();
      const id = 'ord_' + Math.random().toString(36).slice(2, 9);

      orders.unshift({
        id,
        createdAt: Date.now(),
        status: body.status || 'authorized', // pending authorization
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

    // protected: list & update
    const user = await verifyUser(request);
    if (!requireAdminEmail(user)) return json(401, { error: 'auth required' });

    if (request.method === 'GET') {
      const orders = await read();
      return json(200, { orders });
    }

    if (request.method === 'PUT') {
      let body = {};
      try { body = await request.json(); } catch {}
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
