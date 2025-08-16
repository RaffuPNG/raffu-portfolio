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

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return json(null, {
      headers: {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method === 'GET') {
    const data = await readStrong();
    const slots = Array.isArray(data.slots) ? data.slots.slice(0,4) : DEFAULT.slots;
    return json({ slots });
  }

  if (req.method === 'POST') {
    // SECURITY: public API can only reserve (take) a slot, not free it
    let body = {};
    try { body = await req.json(); } catch {}
    const idx = Number.isInteger(body?.slot) ? body.slot : -1;
    const reserve = !!body?.reserve;
    if (!reserve) return json({ error: 'Freeing is not allowed here.' }, { status: 403 });
    if (idx < 0 || idx > 3) return json({ error: 'Invalid slot index' }, { status: 400 });

    const current = await readStrong();
    const slots = Array.isArray(current.slots) ? current.slots.slice(0,4) : DEFAULT.slots;

    if (!slots[idx]) return json({ slots }); // already taken

    slots[idx] = false; // mark TAKEN
    await writeJSON({ slots });
    return json({ slots });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
