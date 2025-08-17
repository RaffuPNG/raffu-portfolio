// netlify/functions/slots.mjs
import { getStore } from '@netlify/blobs';

const store = getStore({ name: 'commission-slots' });
const KEY = 'status';
const DEFAULT = { slots: [true, true, true, true] }; // true = FREE

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

async function readStrong() {
  const data = await store.get(KEY, { type: 'json', consistency: 'strong' });
  return data || DEFAULT;
}
async function writeJSON(data) { await store.setJSON(KEY, data); return data; }

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          ...baseHeaders,
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: '',
      };
    }

    if (event.httpMethod === 'GET') {
      const data = await readStrong();
      const slots = Array.isArray(data.slots) ? data.slots.slice(0, 4) : DEFAULT.slots;
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ slots }) };
    }

    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch {}
      const idx = Number.isInteger(body?.slot) ? body.slot : -1;
      const reserve = !!body?.reserve;

      // public API can only TAKE a slot (reserve:true). Freeing is admin-only.
      if (!reserve) {
        return { statusCode: 403, headers: baseHeaders, body: JSON.stringify({ error: 'Freeing is not allowed here.' }) };
      }
      if (idx < 0 || idx > 3) {
        return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: 'Invalid slot index' }) };
      }

      const current = await readStrong();
      const slots = Array.isArray(current.slots) ? current.slots.slice(0, 4) : DEFAULT.slots;

      if (!slots[idx]) {
        // already taken -> idempotent
        return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ slots }) };
      }

      slots[idx] = false; // mark TAKEN
      await writeJSON({ slots });
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ slots }) };
    }

    return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('slots.mjs error:', err);
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: 'Internal error in slots' }) };
  }
};
