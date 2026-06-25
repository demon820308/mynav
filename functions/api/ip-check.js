export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    let ip = request.headers.get('cf-connecting-ip');
    let country = request.headers.get('cf-ipcountry') || 'Unknown';
    const threatScore = parseInt(request.headers.get('cf-threat-score') || '0', 10);
    const asnOrg = request.headers.get('cf-asn-organization') || '';

    // 本地开发模拟：当检测到是本地或没有 cf-connecting-ip 时，尝试向 ipify 获取真实外网 IP 方便调试
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const ipifyRes = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (ipifyRes.ok) {
          const data = await ipifyRes.json();
          ip = data.ip;
        }
      } catch (err) {
        console.warn('Failed to fetch public IP for local debug:', err.message);
      }
    }

    if (!ip) {
      ip = '127.0.0.1';
    }

    let level = 'clean';
    if (threatScore > 49) {
      level = 'danger';
    } else if (threatScore > 10) {
      level = 'suspicious';
    }

    let isp = asnOrg || 'Local Network / Private';
    let region = '';
    let city = '';
    let isProxyOrVpn = false;

    // 如果拿到公网 IP，查询 ip-api.com 获取详细 ISP/位置/代理信息
    if (ip !== '127.0.0.1' && ip !== '::1') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,countryCode,regionName,city,isp,proxy`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success') {
            isp = data.isp || isp;
            region = data.regionName || '';
            city = data.city || '';
            country = data.countryCode || country;
            if (data.proxy === true) {
              isProxyOrVpn = true;
              if (level === 'clean') {
                level = 'suspicious';
              }
            }
          }
        }
      } catch (err) {
        console.error('ip-api query error:', err.message);
      }
    }

    return jsonResponse({
      ip,
      country,
      isp,
      region,
      city,
      threat_score: threatScore,
      is_proxy: isProxyOrVpn,
      level
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
