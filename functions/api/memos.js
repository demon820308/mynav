import { checkAuth } from './_shared.js';

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const isAdmin = await checkAuth(request, env);
    let results;

    const queryMemos = async () => {
      if (isAdmin) {
        return await env.DB.prepare(
          'SELECT * FROM memos ORDER BY sort_order ASC, id DESC'
        ).all();
      } else {
        return await env.DB.prepare(
          'SELECT * FROM memos WHERE is_private = 0 ORDER BY sort_order ASC, id DESC'
        ).all();
      }
    };

    try {
      const res = await queryMemos();
      results = res.results;
    } catch (dbError) {
      // Self-healing: if the table doesn't exist, create it.
      if (dbError.message && dbError.message.includes('no such table')) {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS memos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT DEFAULT '',
            content TEXT NOT NULL,
            is_private INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `).run();
        const res = await queryMemos();
        results = res.results;
      } else if (dbError.message && dbError.message.includes('no such column')) {
        // Self-healing: add sort_order column to existing table
        await env.DB.prepare(
          'ALTER TABLE memos ADD COLUMN sort_order INTEGER DEFAULT 0'
        ).run();
        const res = await queryMemos();
        results = res.results;
      } else {
        throw dbError;
      }
    }

    return jsonResponse(results);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
