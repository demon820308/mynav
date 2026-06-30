const STORAGE_KEY = 'theme-style';
const STYLES = ['light', 'dark', 'glass-dark', 'aurora', 'sunset', 'obsidian'];
const EMOJIS = {
  'light': '☀️',
  'dark': '🌙',
  'glass-dark': '🌌',
  'aurora': '🌊',
  'sunset': '🌇',
  'obsidian': '🌑'
};

function getPreferredStyle() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && STYLES.includes(saved)) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyStyle(style) {
  const theme = style === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  
  if (style === 'light' || style === 'dark') {
    document.documentElement.removeAttribute('data-bg-style');
  } else {
    document.documentElement.setAttribute('data-bg-style', style);
  }
  
  localStorage.setItem(STORAGE_KEY, style);
  
  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    btn.textContent = EMOJIS[style] || '☀️';
    btn.title = `切换风格 (当前: ${style})`;
  }
}

export function initTheme() {
  applyStyle(getPreferredStyle());

  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = localStorage.getItem(STORAGE_KEY) || 'light';
      const currentIndex = STYLES.indexOf(current);
      const nextIndex = (currentIndex + 1) % STYLES.length;
      applyStyle(STYLES[nextIndex]);
    });
  }
}
