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
        const { name, icon, slug, sort_order } = await request.json();

        if (!name || !slug) {
          return jsonResponse({ error: 'name and slug required' }, 400);
        }

        const result = await env.DB.prepare(
          'INSERT INTO categories (name, icon, slug, sort_order) VALUES (?, ?, ?, ?)'
        ).bind(name, icon || '', slug, sort_order || 0).run();

        return jsonResponse({ id: result.meta.last_row_id }, 201);
      }

      case 'PUT': {
        const { id, name, icon, slug, sort_order } = await request.json();

        if (!id) {
          return jsonResponse({ error: 'id required' }, 400);
        }

        await env.DB.prepare(
          `UPDATE categories SET
            name = COALESCE(?, name),
            icon = COALESCE(?, icon),
            slug = COALESCE(?, slug),
            sort_order = COALESCE(?, sort_order)
           WHERE id = ?`
        ).bind(name, icon, slug, sort_order, id).run();

        return jsonResponse({ success: true });
      }

      case 'DELETE': {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
          return jsonResponse({ error: 'id required' }, 400);
        }

        await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// checkAuth is now provided by ../_shared.js

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
