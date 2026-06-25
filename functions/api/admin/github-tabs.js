import { checkAuth } from '../_shared.js';

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (!(await checkAuth(request, env))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    switch (request.method) {
      case 'GET': {
        const { results } = await env.DB.prepare(
          'SELECT * FROM github_tabs ORDER BY sort_order ASC'
        ).all();
        return jsonResponse(results);
      }

      case 'POST': {
        const body = await request.json();
        const { name, search_query, tab_type, sort_order } = body;
        if (!name) {
          return jsonResponse({ error: 'name required' }, 400);
        }
        let key = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        let suffix = 0;
        while (true) {
          const check = await env.DB.prepare('SELECT id FROM github_tabs WHERE tab_key = ?').bind(key).first();
          if (!check) break;
          suffix++;
          key = `${key}-${suffix}`;
        }
        const result = await env.DB.prepare(
          'INSERT INTO github_tabs (name, tab_key, search_query, tab_type, sort_order) VALUES (?, ?, ?, ?, ?)'
        ).bind(name, key, search_query || '', tab_type || 'skill', sort_order || 0).run();
        return jsonResponse({ id: result.meta.last_row_id }, 201);
      }

      case 'PUT': {
        const body = await request.json();
        const { id, name, tab_key, search_query, tab_type, sort_order, enabled } = body;
        if (!id) return jsonResponse({ error: 'id required' }, 400);
        const fields = [];
        const values = [];
        if (name !== undefined) { fields.push('name = ?'); values.push(name); }
        if (tab_key !== undefined) { fields.push('tab_key = ?'); values.push(tab_key); }
        if (search_query !== undefined) { fields.push('search_query = ?'); values.push(search_query); }
        if (tab_type !== undefined) { fields.push('tab_type = ?'); values.push(tab_type); }
        if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
        if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled); }
        if (!fields.length) return jsonResponse({ error: 'no fields to update' }, 400);
        values.push(id);
        await env.DB.prepare(`UPDATE github_tabs SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
        // Clear the cache for this tab so changes take effect immediately
        await env.DB.prepare('DELETE FROM github_cache WHERE cache_key = ?').bind(`tab_${id}`).run();
        return jsonResponse({ success: true });
      }

      case 'DELETE': {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return jsonResponse({ error: 'id required' }, 400);
        await env.DB.prepare('DELETE FROM github_tabs WHERE id = ?').bind(id).run();
        // Clear the cache for this tab
        await env.DB.prepare('DELETE FROM github_cache WHERE cache_key = ?').bind(`tab_${id}`).run();
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
