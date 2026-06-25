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
    const continent = request.headers.get('cf-ipcontinent') || '';
    const cfLatVal = request.headers.get('cf-iplatitude');
    const cfLonVal = request.headers.get('cf-iplongitude');
    const timezone = request.headers.get('cf-iptimezone') || '';
    const asnOrg = request.headers.get('cf-asn-organization') || request.headers.get('cf-ipasnorg') || '';

    let lat = cfLatVal ? parseFloat(cfLatVal) : null;
    let lon = cfLonVal ? parseFloat(cfLonVal) : null;

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

    let isp = asnOrg || 'Local Network / Private';
    let org = asnOrg || '';
    let as = '';
    let region = '';
    let city = '';
    let district = '';
    let zip = '';
    let continentName = continent;
    let isProxyOrVpn = false;
    let isHosting = false;
    let isMobile = false;

    // 如果拿到公网 IP，查询 ip-api.com 获取详细 ISP/位置/代理信息
    if (ip !== '127.0.0.1' && ip !== '::1') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,continent,countryCode,regionName,city,district,zip,lat,lon,timezone,isp,org,as,proxy,hosting,mobile`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success') {
            isp = data.isp || isp;
            org = data.org || org;
            as = data.as || as;
            region = data.regionName || '';
            city = data.city || '';
            district = data.district || '';
            zip = data.zip || '';
            country = data.countryCode || country;
            continentName = data.continent || continentName;
            
            if (data.lat !== undefined) lat = data.lat;
            if (data.lon !== undefined) lon = data.lon;
            
            isProxyOrVpn = data.proxy === true;
            isHosting = data.hosting === true;
            isMobile = data.mobile === true;
          }
        }
      } catch (err) {
        console.error('ip-api query error:', err.message);
      }
    }

    // 综合评判连接类型
    let conn_type = 'residential';
    if (isHosting) {
      conn_type = 'datacenter';
    } else if (isMobile) {
      conn_type = 'mobile';
    }

    // 综合评判风险等级
    let level = 'clean';
    if (threatScore > 49) {
      level = 'danger';
    } else if (threatScore > 10 || isProxyOrVpn || isHosting) {
      level = 'suspicious';
    }

    return jsonResponse({
      ip,
      country,
      continent: continentName,
      region,
      city,
      district,
      zip,
      lat,
      lon,
      timezone: timezone || '',
      isp,
      org,
      as,
      threat_score: threatScore,
      is_proxy: isProxyOrVpn,
      is_hosting: isHosting,
      is_mobile: isMobile,
      conn_type,
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
