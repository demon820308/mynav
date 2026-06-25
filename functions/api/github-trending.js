export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM github_trending ORDER BY weekly_stars DESC LIMIT 10'
    ).all();

    const shouldRefresh = results.length === 0 ||
      isStale(results[0]?.fetched_at);

    if (shouldRefresh) {
      const fresh = await fetchGitHubTrending(env);
      if (fresh.length > 0) {
        return jsonResponse({ repos: fresh, fetched_at: new Date().toISOString() });
      }
    }

    return jsonResponse({ repos: results, fetched_at: results[0]?.fetched_at || null });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function isStale(fetchedAt) {
  if (!fetchedAt) return true;
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age > 7 * 24 * 60 * 60 * 1000; // 7 days
}

async function fetchGitHubTrending(env) {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const url = `https://api.github.com/search/repositories?q=created:>${oneWeekAgo}&sort=stars&order=desc&per_page=10`;

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Nav-App',
    };

    if (env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
    }

    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      console.error('GitHub API error:', resp.status);
      return [];
    }

    const data = await resp.json();
    const now = new Date().toISOString();

    const repos = (data.items || []).map(repo => ({
      repo_name: repo.full_name,
      repo_url: repo.html_url,
      description: repo.description || '',
      language: repo.language || '',
      stars: repo.stargazers_count,
      weekly_stars: repo.stargazers_count,
    }));

    // Clear old data and insert fresh
    await env.DB.prepare('DELETE FROM github_trending').run();

    if (repos.length > 0) {
      const stmt = env.DB.prepare(
        `INSERT INTO github_trending (repo_name, repo_url, description, language, stars, weekly_stars, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const repo of repos) {
        await stmt.bind(
          repo.repo_name, repo.repo_url, repo.description,
          repo.language, repo.stars, repo.weekly_stars, now
        ).run();
      }
    }

    return repos;
  } catch (e) {
    console.error('fetchGitHubTrending error:', e);
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
