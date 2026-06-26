const WMO_CODES = {
  0: { label: '晴', icon: '☀️' },
  1: { label: '大部晴', icon: '🌤️' },
  2: { label: '多云', icon: '⛅' },
  3: { label: '阴', icon: '☁️' },
  45: { label: '雾', icon: '🌫️' },
  48: { label: '雾凇', icon: '🌫️' },
  51: { label: '小毛雨', icon: '🌦️' },
  53: { label: '毛雨', icon: '🌦️' },
  55: { label: '大毛雨', icon: '🌧️' },
  56: { label: '冻毛雨', icon: '🌧️' },
  57: { label: '冻雨', icon: '🌧️' },
  61: { label: '小雨', icon: '🌦️' },
  63: { label: '中雨', icon: '🌧️' },
  65: { label: '大雨', icon: '🌧️' },
  66: { label: '冻雨', icon: '🌧️' },
  67: { label: '冻雨', icon: '🌧️' },
  71: { label: '小雪', icon: '🌨️' },
  73: { label: '中雪', icon: '🌨️' },
  75: { label: '大雪', icon: '❄️' },
  77: { label: '雪粒', icon: '❄️' },
  80: { label: '阵雨', icon: '🌦️' },
  81: { label: '中阵雨', icon: '🌧️' },
  82: { label: '暴雨', icon: '⛈️' },
  85: { label: '阵雪', icon: '🌨️' },
  86: { label: '大阵雪', icon: '❄️' },
  95: { label: '雷暴', icon: '⛈️' },
  96: { label: '雷暴冰雹', icon: '⛈️' },
  99: { label: '强雷暴冰雹', icon: '⛈️' },
};

function getWmoInfo(code) {
  return WMO_CODES[code] || { label: '未知', icon: '🌡️' };
}

async function getUserLocation() {
  if (navigator.geolocation) {
    const geoLoc = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 3000, enableHighAccuracy: false }
      );
    });
    if (geoLoc) return geoLoc;
  }

  try {
    const res = await fetch('/api/ip-check');
    if (res.ok) {
      const data = await res.json();
      if (data.lat !== null && data.lon !== null) {
        return { lat: data.lat, lon: data.lon };
      }
    }
  } catch (e) {}

  return null;
}

async function fetchWeather(lat, lon) {
  const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error('Weather fetch failed');
  return res.json();
}

function renderCurrent(data) {
  const current = data.current;
  const code = current.weather_code;
  const info = getWmoInfo(code);
  return `
    <div class="weather-current">
      <span class="weather-icon">${info.icon}</span>
      <span class="weather-temp">${Math.round(current.temperature_2m)}°</span>
      <span class="weather-label">${info.label}</span>
      <span class="weather-detail">${Math.round(current.apparent_temperature)}° 体感</span>
    </div>
  `;
}

function renderDaily(data) {
  const daily = data.daily;
  if (!daily) return '';
  return `
    <div class="weather-daily">
      ${daily.time.slice(1).map((date, i) => {
        const max = Math.round(daily.temperature_2m_max[i + 1]);
        const min = Math.round(daily.temperature_2m_min[i + 1]);
        const info = getWmoInfo(daily.weather_code[i + 1]);
        const d = new Date(date + 'T00:00:00');
        const label = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
        return `
          <div class="weather-day">
            <span class="weather-day-label">${label}</span>
            <span class="weather-day-icon">${info.icon}</span>
            <span class="weather-day-temp">${max}° / ${min}°</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export async function initWeather() {
  const container = document.getElementById('weather-badge');
  if (!container) return;

  container.innerHTML = '<span class="weather-loading">天气加载中...</span>';

  try {
    const loc = await getUserLocation();
    if (!loc) {
      container.innerHTML = '<span class="weather-err">📍 无法定位</span>';
      return;
    }

    const data = await fetchWeather(loc.lat, loc.lon);
    if (!data || data.error) {
      container.innerHTML = '<span class="weather-err">⚠️ 天气获取失败</span>';
      return;
    }

    container.innerHTML = renderCurrent(data) + renderDaily(data);

    container.addEventListener('click', (e) => {
      e.stopPropagation();
      container.classList.toggle('weather-expanded');
    });
  } catch (err) {
    console.error('Weather init failed:', err);
    container.innerHTML = '<span class="weather-err">⚠️ 天气不可用</span>';
  }
}
