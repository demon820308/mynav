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
      case 'GET': {
        const { results } = await env.DB.prepare(
          `SELECT l.*, c.name as category_name
           FROM links l
           LEFT JOIN categories c ON l.category_id = c.id
           ORDER BY l.sort_order ASC`
        ).all();
        return jsonResponse(results);
      }

      case 'POST': {
        const body = await request.json();
        const { title, url, description, category_id, favicon_url, sort_order } = body;

        if (!title || !url || !category_id) {
          return jsonResponse({ error: 'title, url, category_id required' }, 400);
        }

        const autoFavicon = favicon_url || `https://www.faviconextractor.com/favicon/${new URL(url).hostname}?larger=true`;

        const result = await env.DB.prepare(
          `INSERT INTO links (title, url, description, category_id, favicon_url, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(title, url, description || '', category_id, autoFavicon, sort_order || 0).run();

        return jsonResponse({ id: result.meta.last_row_id }, 201);
      }

      case 'PUT': {
        const body = await request.json();
        const { id, title, url, description, category_id, favicon_url, sort_order } = body;

        if (!id) {
          return jsonResponse({ error: 'id required' }, 400);
        }

        const autoFavicon = favicon_url || (url ? `https://www.faviconextractor.com/favicon/${new URL(url).hostname}?larger=true` : '');

        await env.DB.prepare(
          `UPDATE links SET
            title = COALESCE(?, title),
            url = COALESCE(?, url),
            description = COALESCE(?, description),
            category_id = COALESCE(?, category_id),
            favicon_url = COALESCE(?, favicon_url),
            sort_order = COALESCE(?, sort_order),
            updated_at = datetime('now')
           WHERE id = ?`
        ).bind(title, url, description, category_id, autoFavicon, sort_order, id).run();

        return jsonResponse({ success: true });
      }

      case 'PATCH': {
        const body = await request.json();
        if (body.action === 'sort' && Array.isArray(body.items)) {
          // Use db.batch() to send all updates atomically in one round-trip,
          // matching the pattern: db.batch([stmt1, stmt2, ...]).then(() => true).catch(() => false)
          const success = await env.DB.batch(
            body.items.map(item =>
              env.DB.prepare(
                'UPDATE links SET sort_order = ?, category_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
              ).bind(item.sort_order, item.category_id, item.id)
            )
          ).then(() => true).catch(() => false);

          return jsonResponse({ success });
        }
        return jsonResponse({ error: 'Invalid PATCH body' }, 400);
      }

      case 'DELETE': {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
          return jsonResponse({ error: 'id required' }, 400);
        }

        await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
