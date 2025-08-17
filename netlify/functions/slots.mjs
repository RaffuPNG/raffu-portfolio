// v2 runtime — return Web Response objects
import { getStore } from '@netlify/blobs';

const KEY = 'status';
const DEFAULT = [true, true, true, true];

const base = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: base });

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: base });

  try {
    const store = getStore({ name: 'commission-slots' });

    if (request.method === 'GET') {
      let slots = await store.get(KEY, { type: 'json', consistency: 'strong' });
      if (!Array.isArray(slots)) slots = DEFAULT.slice();
      return json(200, { slots });
    }

    if (request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const { slot, reserve } = body;

      let slots = await store.get(KEY, { type: 'json', consistency: 'strong' }) || DEFAULT.slice();
      if (typeof slot !== 'number' || slot < 0 || slot >= slots.length) {
        return json(400, { error: 'invalid slot' });
      }
      // reserve=true -> mark as taken (false means taken in your UI)
      slots[slot] = reserve ? false : true;

      await store.setJSON(KEY, slots);
      return json(200, { ok: true, slots });
    }

    return json(405, { error: 'method not allowed' });
  } catch (e) {
    console.error('slots error:', e);
    return json(500, { error: e?.message || String(e) });
  }
};
