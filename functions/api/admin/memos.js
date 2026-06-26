import { checkAuth } from '../_shared.js';

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (!await checkAuth(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    switch (request.method) {
      case 'POST': {
        const body = await request.json();
        const { title, content, is_private } = body;

        if (content === undefined || content === null || content.trim() === '') {
          return jsonResponse({ error: 'content is required' }, 400);
        }

        const isPrivateVal = (is_private === 0 || is_private === false) ? 0 : 1;

        const result = await env.DB.prepare(
          `INSERT INTO memos (title, content, is_private)
           VALUES (?, ?, ?)`
        ).bind(title || '', content, isPrivateVal).run();

        return jsonResponse({ id: result.meta.last_row_id }, 201);
      }

      case 'PUT': {
        const body = await request.json();
        const { id, title, content, is_private } = body;

        if (!id) {
          return jsonResponse({ error: 'id required' }, 400);
        }

        if (content === undefined || content === null || content.trim() === '') {
          return jsonResponse({ error: 'content is required' }, 400);
        }

        const isPrivateVal = (is_private === 0 || is_private === false) ? 0 : 1;

        await env.DB.prepare(
          `UPDATE memos SET
             title = ?,
             content = ?,
             is_private = ?,
             updated_at = datetime('now')
           WHERE id = ?`
        ).bind(title || '', content, isPrivateVal, id).run();

        return jsonResponse({ success: true });
      }

      case 'DELETE': {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
          return jsonResponse({ error: 'id required' }, 400);
        }

        await env.DB.prepare('DELETE FROM memos WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
