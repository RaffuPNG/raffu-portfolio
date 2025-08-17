// netlify/functions/slots.mjs
import { getStore } from '@netlify/blobs';

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

// Create a store using credentials from env vars (safe for any region)
function makeStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token  = process.env.BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error('Missing BLOBS_SITE_ID or BLOBS_TOKEN env vars');
  }
  return getStore({ name: 'commission-slots', siteID, token });
}

const KEY = 'status';
const DEFAULT = { slots: [true, true, true, true] }; // true = FREE

async function readStrong() {
  const store = makeStore();
  const data = await store.get(KEY, { type: 'json', consistency: 'strong' });
  return data || DEFAULT;
}
async function writeJSON(data) {
  const store = makeStore();
  await store.setJSON(KEY, data);
  return data;
}

export const handler = async (event) => {
  try {
    // CORS preflight
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

    // GET -> read slots
    if (event.httpMethod === 'GET') {
      const data = await readStrong();
      const slots = Array.isArray(data.slots) ? data.slots.slice(0, 4) : DEFAULT.slots;
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ slots }) };
    }

    // POST -> reserve a free slot (public API cannot free)
    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch {}
      const idx = Number.isInteger(body?.slot) ? body.slot : -1;
      const reserve = !!body?.reserve; // must be true

      if (!reserve) {
        return { statusCode: 403, headers: baseHeaders, body: JSON.stringify({ error: 'Freeing is not allowed here.' }) };
      }
      if (idx < 0 || idx > 3) {
        return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: 'Invalid slot index' }) };
      }

      const current = await readStrong();
      const slots = Array.isArray(current.slots) ? current.slots.slice(0, 4) : DEFAULT.slots;

      // If already taken, return current state (idempotent)
      if (!slots[idx]) {
        return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ slots }) };
      }

      // Mark TAKEN
      slots[idx] = false;
      await writeJSON({ slots });

      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ slots }) };
    }

    return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('slots.mjs error:', err);
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: 'Internal error in slots' }) };
  }
};
