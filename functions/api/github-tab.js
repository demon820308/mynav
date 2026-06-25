export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const url = new URL(request.url);
    const tabKey = url.searchParams.get('tab');
    if (!tabKey) return jsonResponse({ error: 'tab param required' }, 400);

    const tab = await env.DB.prepare(
      'SELECT * FROM github_tabs WHERE tab_key = ? AND enabled = 1'
    ).bind(tabKey).first();

    if (!tab) return jsonResponse({ error: 'Tab not found or disabled' }, 404);

    const cacheKey = `tab_${tab.id}`;
    const cached = await env.DB.prepare(
      'SELECT * FROM github_cache WHERE cache_key = ?'
    ).bind(cacheKey).first();

    const ttlMs = (tab.tab_type === 'week_new' || tab.tab_type === 'month_new')
      ? 6 * 60 * 60 * 1000  // 6 hours
      : 7 * 24 * 60 * 60 * 1000; // 7 days
    const isStale = !cached || (Date.now() - new Date(cached.fetched_at).getTime() > ttlMs);

    if (isStale) {
      const data = await fetchTabData(env, tab);
      if (data) {
        await env.DB.prepare('DELETE FROM github_cache WHERE cache_key = ?').bind(cacheKey).run();
        await env.DB.prepare(
          'INSERT INTO github_cache (cache_key, data, fetched_at) VALUES (?, ?, ?)'
        ).bind(cacheKey, JSON.stringify(data), new Date().toISOString()).run();
        return jsonResponse({ tab: tab.tab_key, type: tab.tab_type, items: data });
      }
    }

    if (cached) {
      return jsonResponse({ tab: tab.tab_key, type: tab.tab_type, items: JSON.parse(cached.data) });
    }

    return jsonResponse({ tab: tab.tab_key, type: tab.tab_type, items: [] });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function fetchTabData(env, tab) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Nav-App',
  };
  if (env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
  }

  const q = (tab.search_query || '').trim();

  switch (tab.tab_type) {
    case 'skill':
      return await fetchSkill(headers, q);
    case 'week_new':
      return await scrapeTrending('weekly', q);
    case 'month_new':
      return await scrapeTrending('monthly', q);
    default: {
      const kw = q ? q.split(/\s+/).map(k => `${k} in:name`).join(' ') : '';
      switch (tab.tab_type) {
        case 'all':
          return await searchRepos(headers, kw ? `${kw} -is:fork` : 'stars:>50000 -is:fork', 'stars');
        case 'week_active':
          return await searchRepos(headers, buildTimeQuery(kw, 7, 'pushed'), 'stars');
        case 'month_active':
          return await searchRepos(headers, buildTimeQuery(kw, 30, 'pushed'), 'stars');
        case 'week_born':
          return await searchRepos(headers, buildTimeQuery(kw, 7, 'created'), 'stars');
        case 'month_born':
          return await searchRepos(headers, buildTimeQuery(kw, 30, 'created'), 'stars');
        default:
          return await searchRepos(headers, kw || 'stars:>50000 -is:fork', 'stars');
      }
    }
  }
}

async function fetchTrending(headers, since, keywords) {
  const days = since === 'weekly' ? 7 : 30;
  const kw = keywords ? keywords.split(/\s+/).map(k => `${k} in:name`).join(' ') : '';
  const date = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const q = kw ? `${kw} pushed:>=${date} -is:fork` : `stars:>500 pushed:>=${date} -is:fork`;
  return await searchRepos(headers, q, 'stars');
}

function buildTimeQuery(kw, days, timeField) {
  const date = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  if (kw) return `${kw} ${timeField}:>=${date} -is:fork`;
  if (timeField === 'created') return `stars:>100 ${timeField}:>=${date} -is:fork`;
  return `stars:>500 ${timeField}:>=${date} -is:fork`;
}

async function searchRepos(headers, q, sort) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=20`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.items || []).map(r => ({
    name: r.full_name,
    url: r.html_url,
    description: r.description || '',
    language: r.language || '',
    stars: r.stargazers_count,
    forks: r.forks_count,
  }));
}

async function fetchSkill(headers, topic) {
  const url = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=1`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return [];
  const data = await resp.json();
  if (!data.items || !data.items.length) return [];
  const r = data.items[0];
  return [{
    topic,
    topic_url: `https://github.com/topics/${topic}`,
    repo: r.full_name,
    repo_url: r.html_url,
    description: r.description || '',
    language: r.language || '',
    stars: r.stargazers_count,
  }];
}

async function scrapeTrending(since, language) {
  const baseUrl = 'https://github.com/trending';
  let url = baseUrl;
  if (language) {
    url += `/${encodeURIComponent(language.toLowerCase())}`;
  }
  url += `?since=${since === 'monthly' ? 'monthly' : 'weekly'}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub trending: ${response.status} ${response.statusText}`);
  }

  const repos = [];
  let currentRepo = null;

  const parser = new HTMLRewriter()
    .on('article.Box-row', {
      element() {
        if (currentRepo) {
          repos.push(currentRepo);
        }
        currentRepo = {
          name: '',
          url: '',
          description: '',
          language: '',
          _starsText: '',
          _forksText: ''
        };
      }
    })
    .on('article.Box-row h2 a', {
      element(el) {
        const href = el.getAttribute('href');
        if (currentRepo && href) {
          currentRepo.url = `https://github.com${href}`;
        }
      },
      text(t) {
        if (currentRepo) currentRepo.name += t.text;
      }
    })
    .on('article.Box-row p', {
      text(t) {
        if (currentRepo) currentRepo.description += t.text;
      }
    })
    .on('article.Box-row [itemprop="programmingLanguage"]', {
      text(t) {
        if (currentRepo) currentRepo.language += t.text;
      }
    })
    .on('article.Box-row a[href$="/stargazers"]', {
      text(t) {
        if (currentRepo) currentRepo._starsText += t.text;
      }
    })
    .on('article.Box-row a[href$="/network/members"], article.Box-row a[href$="/forks"]', {
      text(t) {
        if (currentRepo) currentRepo._forksText += t.text;
      }
    });

  await parser.transform(response).arrayBuffer();

  if (currentRepo) {
    repos.push(currentRepo);
  }

  return repos.map(r => {
    const cleanName = r.name.replace(/\s+/g, '');
    const totalStars = parseInt(r._starsText.replace(/,/g, '').trim(), 10) || 0;
    const forks = parseInt(r._forksText.replace(/,/g, '').trim(), 10) || 0;

    return {
      name: cleanName,
      url: r.url,
      description: r.description.trim(),
      language: r.language.trim(),
      stars: totalStars,
      forks: forks
    };
  });
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
