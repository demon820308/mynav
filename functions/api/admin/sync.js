import { checkAuth } from '../_shared.js';

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!await checkAuth(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const { categories, links } = await request.json();

    if (!Array.isArray(categories) || !Array.isArray(links)) {
      return jsonResponse({ error: 'categories and links arrays required' }, 400);
    }

    // Step 1: Clear old data and insert new categories in a single batch
    const deleteLinks = env.DB.prepare('DELETE FROM links');
    const deleteCategories = env.DB.prepare('DELETE FROM categories');
    
    const insertCatStmts = categories.map(c => 
      env.DB.prepare('INSERT INTO categories (name, icon, slug, sort_order) VALUES (?, ?, ?, ?)')
        .bind(c.name, c.icon || '', c.slug, c.sort_order || 0)
    );

    await env.DB.batch([deleteLinks, deleteCategories, ...insertCatStmts]);

    // Step 2: Fetch the new categories to map their slugs to the newly generated IDs
    const { results: newCats } = await env.DB.prepare('SELECT id, slug FROM categories').all();
    const slugToIdMap = {};
    for (const cat of newCats) {
      slugToIdMap[cat.slug] = cat.id;
    }

    // Step 3: Insert the links with mapped category IDs in a second batch
    const insertLinkStmts = links.map(l => {
      const categoryId = slugToIdMap[l.category_slug];
      if (!categoryId) {
        throw new Error(`Category slug "${l.category_slug}" not found for link "${l.title}"`);
      }
      
      let autoFavicon = l.favicon_url;
      if (!autoFavicon && l.url) {
        try {
          autoFavicon = `https://www.faviconextractor.com/favicon/${new URL(l.url).hostname}?larger=true`;
        } catch (e) {
          autoFavicon = '';
        }
      }

      return env.DB.prepare(
        'INSERT INTO links (title, url, description, category_id, favicon_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(l.title, l.url, l.description || '', categoryId, autoFavicon || '', l.sort_order || 0);
    });

    if (insertLinkStmts.length > 0) {
      await env.DB.batch(insertLinkStmts);
    }

    return jsonResponse({
      success: true,
      categoriesCount: categories.length,
      linksCount: links.length
    });

  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
