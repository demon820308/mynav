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

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(geoUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return jsonResponse({ error: 'Geocoding API error' }, 502);
    }

    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      return jsonResponse({ error: 'City not found' }, 404);
    }

    const result = data.results[0];
    return jsonResponse({
      name: result.name,
      country: result.country,
      admin1: result.admin1 || '',
      lat: result.latitude,
      lon: result.longitude,
    });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
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
