export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM github_skills ORDER BY stars DESC LIMIT 12'
    ).all();

    const shouldRefresh = results.length === 0 || isStale(results[0]?.fetched_at);

    if (shouldRefresh) {
      const fresh = await fetchSkills(env);
      if (fresh.length > 0) {
        return jsonResponse({ skills: fresh, fetched_at: new Date().toISOString() });
      }
    }

    return jsonResponse({ skills: results, fetched_at: results[0]?.fetched_at || null });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function isStale(fetchedAt) {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > 7 * 24 * 60 * 60 * 1000;
}

async function fetchSkills(env) {
  try {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Nav-App',
    };
    if (env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
    }

    const { results: topics } = await env.DB.prepare(
      'SELECT topic FROM github_topics ORDER BY sort_order ASC'
    ).all();

    if (!topics.length) return [];

    const results = [];

    for (const row of topics) {
      const topic = row.topic;
      const url = `https://api.github.com/search/repositories?q=topic:${topic}&sort=stars&order=desc&per_page=1`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) continue;

      const data = await resp.json();
      if (data.items && data.items.length > 0) {
        const repo = data.items[0];
        results.push({
          topic,
          topic_url: `https://github.com/topics/${topic}`,
          top_repo: repo.full_name,
          repo_url: repo.html_url,
          description: repo.description || '',
          language: repo.language || '',
          stars: repo.stargazers_count,
        });
      }

      if (results.length >= 12) break;
    }

    await env.DB.prepare('DELETE FROM github_skills').run();

    if (results.length > 0) {
      const stmt = env.DB.prepare(
        `INSERT INTO github_skills (topic, topic_url, top_repo, repo_url, description, language, stars, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const now = new Date().toISOString();
      for (const s of results) {
        await stmt.bind(s.topic, s.topic_url, s.top_repo, s.repo_url, s.description, s.language, s.stars, now).run();
      }
    }

    return results;
  } catch (e) {
    console.error('fetchSkills error:', e);
    return [];
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
