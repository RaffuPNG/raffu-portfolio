import { getStore } from '@netlify/blobs';

const KEY = 'status';
const DEFAULT = [true, true, true, true];

const base = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: base };

  try {
    // Create the store inside the handler (so errors are caught)
    const store = getStore({ name: 'commission-slots' });

    if (event.httpMethod === 'GET') {
      let slots = await store.get(KEY, { type: 'json', consistency: 'strong' });
      if (!Array.isArray(slots)) slots = DEFAULT.slice();
      return { statusCode: 200, headers: base, body: JSON.stringify({ slots }) };
    }

    if (event.httpMethod === 'POST') {
      const { slot, reserve } = JSON.parse(event.body || '{}'); // reserve=true -> TAKEN, false -> FREE
      let slots = await store.get(KEY, { type: 'json', consistency: 'strong' }) || DEFAULT.slice();

      if (typeof slot !== 'number' || slot < 0 || slot >= slots.length) {
        return { statusCode: 400, headers: base, body: JSON.stringify({ error: 'invalid slot' }) };
      }
      slots[slot] = reserve ? false : true;
      await store.setJSON(KEY, slots);
      return { statusCode: 200, headers: base, body: JSON.stringify({ ok: true, slots }) };
    }

    return { statusCode: 405, headers: base, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (e) {
    console.error('slots error:', e);
    return { statusCode: 500, headers: base, body: JSON.stringify({ error: e?.message || String(e) }) };
  }
};
