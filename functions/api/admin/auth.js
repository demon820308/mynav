import { generateSessionToken } from '../_shared.js';

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { password } = await request.json();
    const adminToken = env.ADMIN_TOKEN;

    if (!adminToken) {
      return jsonResponse({ error: 'Admin not configured' }, 500);
    }

    if (password === adminToken) {
      // Derive a session token from the secret using HMAC-SHA-256.
      // The password itself is never returned to the client.
      const token = await generateSessionToken(adminToken);
      return jsonResponse({ success: true, token });
    }

    return jsonResponse({ error: 'Invalid password' }, 401);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
