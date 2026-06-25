import { checkAuth } from './_shared.js';

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  // GET - public
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        'SELECT * FROM github_topics ORDER BY sort_order ASC'
      ).all();
      return jsonResponse(results);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // Admin operations
  if (!(await checkAuth(request, env))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    switch (request.method) {
      case 'POST': {
        const { topic, sort_order } = await request.json();
        if (!topic) return jsonResponse({ error: 'topic required' }, 400);
        const slug = topic.trim().toLowerCase().replace(/\s+/g, '-');
        const result = await env.DB.prepare(
          'INSERT OR IGNORE INTO github_topics (topic, sort_order) VALUES (?, ?)'
        ).bind(slug, sort_order || 0).run();
        return jsonResponse({ id: result.meta.last_row_id }, 201);
      }

      case 'PUT': {
        const { id, topic, sort_order } = await request.json();
        if (!id) return jsonResponse({ error: 'id required' }, 400);
        const slug = topic ? topic.trim().toLowerCase().replace(/\s+/g, '-') : undefined;
        await env.DB.prepare(
          'UPDATE github_topics SET topic = COALESCE(?, topic), sort_order = COALESCE(?, sort_order) WHERE id = ?'
        ).bind(slug, sort_order, id).run();
        return jsonResponse({ success: true });
      }

      case 'DELETE': {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return jsonResponse({ error: 'id required' }, 400);
        await env.DB.prepare('DELETE FROM github_topics WHERE id = ?').bind(id).run();
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
