// netlify/functions/ping.mjs
export const handler = async (event) => {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
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

  return {
    statusCode: 200,
    headers: baseHeaders,
    body: JSON.stringify({
      ok: true,
      node: process.version,
      adminEmailSet: !!process.env.ADMIN_EMAIL,
    }),
  };
};
