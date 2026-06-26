export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const url = new URL(request.url);
    const city = url.searchParams.get('city');
    if (!city) {
      return jsonResponse({ error: 'Missing city param' }, 400);
    }

    const result = await searchCity(city);
    if (!result) {
      return jsonResponse({ error: 'City not found' }, 404);
    }

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

const ADMIN_FEATURE_CODES = new Set(['PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLG', 'PPL']);

async function searchCity(query) {
  let name = query.trim();

  if (!name.endsWith('市') && !name.endsWith('县') && !name.endsWith('区')) {
    const withSuffix = await fetchGeo(name + '市', 10);
    const adminResult = pickBestAdmin(withSuffix, name);
    if (adminResult) return adminResult;

    const withoutSuffix = await fetchGeo(name, 10);
    const fallback = pickBestAdmin(withoutSuffix, name);
    if (fallback) return fallback;

    return pickBest(withoutSuffix);
  }

  const results = await fetchGeo(name, 10);
  return pickBestAdmin(results, name) || pickBest(results);
}

async function fetchGeo(name, count) {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${count}&language=zh`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const res = await fetch(geoUrl, { signal: controller.signal });
  clearTimeout(timeoutId);

  if (!res.ok) return [];

  const data = await res.json();
  return data.results || [];
}

function pickBestAdmin(results, originalQuery) {
  const cnResults = results.filter(r => r.country_code === 'CN');
  if (!cnResults.length) return null;

  const admins = cnResults.filter(r => ADMIN_FEATURE_CODES.has(r.feature_code));
  if (!admins.length) return null;

  admins.sort((a, b) => (b.population || 0) - (a.population || 0));
  const best = admins[0];

  return formatResult(best);
}

function pickBest(results) {
  if (!results.length) return null;
  const sorted = [...results].sort((a, b) => (b.population || 0) - (a.population || 0));
  return formatResult(sorted[0]);
}

function formatResult(r) {
  return {
    name: r.name,
    country: r.country || '',
    admin1: r.admin1 || '',
    admin2: r.admin2 || '',
    lat: r.latitude,
    lon: r.longitude,
    population: r.population || 0,
  };
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
