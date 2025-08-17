import { getStore } from '@netlify/blobs';

const store = getStore({ name: 'commission-slots' });
const KEY = 'status';
const DEFAULT = [true, true, true, true];

const base = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: base };

  try {
    if (event.httpMethod === 'GET') {
      const slots = await store.get(KEY, { type: 'json', consistency: 'strong' }) || DEFAULT;
      return { statusCode: 200, headers: base, body: JSON.stringify({ slots }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { slot, reserve } = body;
      let slots = await store.get(KEY, { type: 'json', consistency: 'strong' }) || DEFAULT.slice();
      if (typeof slot !== 'number' || slot < 0 || slot > 3) {
        return { statusCode: 400, headers: base, body: JSON.stringify({ error: 'bad slot' }) };
      }
      slots[slot] = !reserve ? true : false; // reserve=true -> taken=false (set to false)
      // clearer: when reserve true, mark as taken (false). when false, free (true)
      slots[slot] = reserve ? false : true;
      await store.setJSON(KEY, slots);
      return { statusCode: 200, headers: base, body: JSON.stringify({ ok: true, slots }) };
    }

    return { statusCode: 405, headers: base, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (e) {
    return { statusCode: 500, headers: base, body: JSON.stringify({ error: e.message }) };
  }
};
