// netlify/functions/admin-slots.mjs
import { getStore } from '@netlify/blobs';

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

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

export const handler = async (event, context) => {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          ...baseHeaders,
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        body: '',
      };
    }

    // --- AUTH: Identity + ADMIN_EMAIL ---
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    const user = context?.clientContext?.user;
    const email = (user?.email || user?.app_metadata?.email || user?.user_metadata?.email || '').toLowerCase();
    if (!email || !adminEmail || email !== adminEmail) {
      return { statusCode: 403, headers: baseHeaders, body: JSON.stringify({ error: 'Only the configured admin may access this endpoint.' }) };
    }

    // GET -> read slots
    if (event.httpMethod === 'GET') {
      const data = await readStrong();
      const slots = Array.isArray(data.slots) ? data.slots.slice(0, 4) : DEFAULT.slots;
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ slots }) };
    }

    // POST -> set slot free/take { slot:0..3, free:true|false }
    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch {}
      const idx  = Number.isInteger(body?.slot) ? body.slot : -1;
      const free = (typeof body?.free === 'boolean') ? body.free : null;

      if (idx < 0 || idx > 3 || free === null) {
        return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: 'Provide { slot: 0..3, free: true|false }' }) };
      }

      const current = await readStrong();
      const slots = Array.isArray(current.slots) ? current.slots.slice(0, 4) : DEFAULT.slots;
      slots[idx] = !!free; // true=FREE, false=TAKEN
      await writeJSON({ slots });

      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ slots }) };
    }

    return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-slots.mjs error:', err);
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: 'Internal error in admin-slots' }) };
  }
};
