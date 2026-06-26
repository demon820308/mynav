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

function getWeatherMode() {
  return localStorage.getItem('weather_mode') || 'auto';
}

function setWeatherMode(mode) {
  localStorage.setItem('weather_mode', mode);
}

function getWeatherCity() {
  return localStorage.getItem('weather_city') || '';
}

function setWeatherCity(city) {
  localStorage.setItem('weather_city', city);
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
        return { lat: data.lat, lon: data.lon, city: data.city || '' };
      }
    }
  } catch (e) {}

  return null;
}

async function geocodeCity(city) {
  const res = await fetch(`/api/weather-geocode?city=${encodeURIComponent(city)}`);
  if (!res.ok) throw new Error('City not found');
  return res.json();
}

async function fetchWeather(lat, lon) {
  const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error('Weather fetch failed');
  return res.json();
}

function renderBadge(data) {
  const current = data.current;
  const info = getWmoInfo(current.weather_code);
  return `
    <div class="weather-current">
      <span class="weather-icon">${info.icon}</span>
      <span class="weather-temp">${Math.round(current.temperature_2m)}°</span>
      <span class="weather-label">${info.label}</span>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderPopupContent(data, cityName) {
  const current = data.current;
  const daily = data.daily;
  const info = getWmoInfo(current.weather_code);
  const mode = getWeatherMode();

  const todayMax = daily ? Math.round(daily.temperature_2m_max[0]) : '--';
  const todayMin = daily ? Math.round(daily.temperature_2m_min[0]) : '--';

  const dailyRows = daily ? daily.time.slice(1).map((date, i) => {
    const idx = i + 1;
    const max = Math.round(daily.temperature_2m_max[idx]);
    const min = Math.round(daily.temperature_2m_min[idx]);
    const dayInfo = getWmoInfo(daily.weather_code[idx]);
    const d = new Date(date + 'T00:00:00');
    const label = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    return `
      <div class="weather-day">
        <span class="weather-day-label">${label}</span>
        <span class="weather-day-icon">${dayInfo.icon}</span>
        <span class="weather-day-text">${dayInfo.label}</span>
        <span class="weather-day-temp">${max}° / ${min}°</span>
      </div>
    `;
  }).join('') : '';

  return `
    <div class="weather-popup-header">
      <span class="weather-popup-title">🌤️ 天气</span>
      <div class="weather-popup-actions">
        <button id="weather-refresh-btn" class="weather-btn-icon" title="刷新">🔄</button>
        <button id="weather-close-btn" class="weather-btn-icon" title="关闭">✕</button>
      </div>
    </div>
    <div class="weather-popup-location">
      📍 ${escapeHtml(cityName || '未知位置')}
    </div>
    <div class="weather-popup-switch">
      <label class="weather-switch">
        <input type="checkbox" id="weather-mode-toggle" ${mode === 'manual' ? 'checked' : ''}>
        <span class="weather-switch-slider"></span>
      </label>
      <span class="weather-switch-label">${mode === 'manual' ? '手动选择城市' : '自动定位'}</span>
    </div>
    <div id="weather-city-input" class="weather-city-input" style="display:${mode === 'manual' ? 'block' : 'none'}">
      <input type="text" id="weather-city-field" placeholder="输入城市名称..." value="${escapeHtml(getWeatherCity())}">
      <button id="weather-city-btn" class="btn btn-primary btn-sm">查询</button>
    </div>
    <div class="weather-popup-today">
      <div class="weather-today-main">
        <span class="weather-today-icon">${info.icon}</span>
        <span class="weather-today-temp">${Math.round(current.temperature_2m)}°</span>
      </div>
      <div class="weather-today-label">${info.label} · ${todayMax}° / ${todayMin}°</div>
      <div class="weather-today-details">
        <div class="weather-detail-item">
          <span class="weather-detail-icon">🌡️</span>
          <span class="weather-detail-label">体感</span>
          <span class="weather-detail-val">${Math.round(current.apparent_temperature)}°</span>
        </div>
        <div class="weather-detail-item">
          <span class="weather-detail-icon">💧</span>
          <span class="weather-detail-label">湿度</span>
          <span class="weather-detail-val">${current.relative_humidity_2m}%</span>
        </div>
        <div class="weather-detail-item">
          <span class="weather-detail-icon">🌬️</span>
          <span class="weather-detail-label">风速</span>
          <span class="weather-detail-val">${Math.round(current.wind_speed_10m)}km/h</span>
        </div>
      </div>
    </div>
    <div class="weather-popup-week">
      <div class="weather-week-title">未来 7 天</div>
      ${dailyRows}
    </div>
  `;
}

async function loadWeatherForPopup(popup, badge) {
  const cityInput = document.getElementById('weather-city-input');
  const cityField = document.getElementById('weather-city-field');
  const cityBtn = document.getElementById('weather-city-btn');
  const modeToggle = document.getElementById('weather-mode-toggle');
  const switchLabel = popup.querySelector('.weather-switch-label');

  async function loadByCoords(lat, lon, cityName) {
    try {
      const data = await fetchWeather(lat, lon);
      if (!data || data.error) {
        popup.innerHTML = '<div class="weather-err">⚠️ 天气获取失败</div>';
        return;
      }
      popup.innerHTML = renderPopupContent(data, cityName);
      badge.innerHTML = renderBadge(data).trim().startsWith('<div') ? renderBadge(data) : badge.innerHTML;
      loadWeatherForPopup(popup, badge);
    } catch (err) {
      console.error('Weather load error:', err);
      popup.innerHTML = '<div class="weather-err">⚠️ 天气不可用</div>';
    }
  }

  if (modeToggle) {
    modeToggle.addEventListener('change', () => {
      const mode = modeToggle.checked ? 'manual' : 'auto';
      setWeatherMode(mode);
      switchLabel.textContent = mode === 'manual' ? '手动选择城市' : '自动定位';
      cityInput.style.display = mode === 'manual' ? 'block' : 'none';

      if (mode === 'auto') {
        (async () => {
          const loc = await getUserLocation();
          if (loc) {
            setWeatherCity('');
            await loadByCoords(loc.lat, loc.lon, loc.city || '');
          }
        })();
      }
    });
  }

  if (cityBtn && cityField) {
    const doSearch = async () => {
      const city = cityField.value.trim();
      if (!city) return;
      setWeatherCity(city);
      try {
        const geo = await geocodeCity(city);
        await loadByCoords(geo.lat, geo.lon, `${geo.name}, ${geo.admin1 ? geo.admin1 + ', ' : ''}${geo.country}`);
      } catch (err) {
        popup.querySelector('.weather-popup-week').innerHTML =
          `<div class="weather-err">找不到城市「${escapeHtml(city)}」</div>`;
      }
    };
    cityBtn.addEventListener('click', doSearch);
    cityField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  }

  const closeBtn = document.getElementById('weather-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      popup.style.display = 'none';
    });
  }

  const refreshBtn = document.getElementById('weather-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const mode = getWeatherMode();
      if (mode === 'manual') {
        const city = getWeatherCity();
        if (city) {
          try {
            const geo = await geocodeCity(city);
            await loadByCoords(geo.lat, geo.lon, `${geo.name}, ${geo.admin1 ? geo.admin1 + ', ' : ''}${geo.country}`);
          } catch (err) {}
        }
      } else {
        const loc = await getUserLocation();
        if (loc) await loadByCoords(loc.lat, loc.lon, loc.city || '');
      }
    });
  }
}

export async function initWeather() {
  const badge = document.getElementById('weather-badge');
  const popup = document.getElementById('weather-popup');
  if (!badge || !popup) return;

  badge.innerHTML = '<span class="weather-loading">天气加载中...</span>';

  try {
    const mode = getWeatherMode();
    let loc = null;
    let cityName = '';

    if (mode === 'manual') {
      const city = getWeatherCity();
      if (city) {
        try {
          const geo = await geocodeCity(city);
          loc = { lat: geo.lat, lon: geo.lon };
          cityName = `${geo.name}, ${geo.admin1 ? geo.admin1 + ', ' : ''}${geo.country}`;
        } catch (e) {}
      }
    }

    if (!loc) {
      loc = await getUserLocation();
      if (loc && loc.city) cityName = loc.city;
    }

    if (!loc) {
      badge.innerHTML = '<span class="weather-err">📍 无法定位</span>';
      return;
    }

    const data = await fetchWeather(loc.lat, loc.lon);
    if (!data || data.error) {
      badge.innerHTML = '<span class="weather-err">⚠️ 天气获取失败</span>';
      return;
    }

    badge.innerHTML = renderBadge(data);
    popup.innerHTML = renderPopupContent(data, cityName);
    loadWeatherForPopup(popup, badge);

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popup.style.display === 'flex') {
        popup.style.display = 'none';
      } else {
        popup.style.display = 'flex';
      }
    });

    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && !badge.contains(e.target)) {
        popup.style.display = 'none';
      }
    });

    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  } catch (err) {
    console.error('Weather init failed:', err);
    badge.innerHTML = '<span class="weather-err">⚠️ 天气不可用</span>';
  }
}
