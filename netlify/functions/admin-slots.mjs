import { getStore } from '@netlify/blobs';

const store = getStore({ name: 'commission-slots' });
const KEY = 'status';
const DEFAULT = { slots: [true, true, true, true] }; // true = FREE

async function readStrong() {
  const data = await store.get(KEY, { type: 'json', consistency: 'strong' });
  return data || DEFAULT;
}
async function writeJSON(data) { await store.setJSON(KEY, data); return data; }

function json(body, init = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...init.headers,
  };
  return new Response(JSON.stringify(body), { ...init, headers });
}

function forbidden(msg='Forbidden'){ return json({ error: msg }, { status: 403 }); }
function bad(msg='Bad Request'){ return json({ error: msg }, { status: 400 }); }

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return json(null, {
      headers: {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  // Only the ADMIN_EMAIL Identity user can access
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const user = context?.clientContext?.user;
  const email = (user?.email || user?.app_metadata?.email || user?.user_metadata?.email || '').toLowerCase();

  if (!email || !adminEmail || email !== adminEmail) {
    return forbidden('Only the configured admin may access this endpoint.');
  }

  if (req.method === 'GET') {
    const data = await readStrong();
    const slots = Array.isArray(data.slots) ? data.slots.slice(0,4) : DEFAULT.slots;
    return json({ slots });
  }

  if (req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch {}
    const idx = Number.isInteger(body?.slot) ? body.slot : -1;
    const free = typeof body?.free === 'boolean' ? body.free : null;
    if (idx < 0 || idx > 3 || free === null) return bad('Provide { slot: 0..3, free: true|false }');

    const current = await readStrong();
    const slots = Array.isArray(current.slots) ? current.slots.slice(0,4) : DEFAULT.slots;
    slots[idx] = !!free; // true=FREE, false=TAKEN
    await writeJSON({ slots });
    return json({ slots });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
