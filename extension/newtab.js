let allLinks = [];
let allCategories = [];
let editMode = false;

let currentIpInfo = null;
let ipMap = null;
let leafletPromise = null;

// ── Storage Helpers ──
async function getStorage(key, defaultValue) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}

async function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

async function removeStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], () => {
      resolve();
    });
  });
}

// ── API Helpers ──
const api = {
  async getBase() {
    return await getStorage('api_base', 'https://nav.ipanic.bond');
  },
  
  async getHeaders() {
    const token = await getStorage('admin_token', null);
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  async request(path, options = {}) {
    const apiBase = await this.getBase();
    const headers = await this.getHeaders();
    const { headers: extra, ...rest } = options;
    const res = await fetch(`${apiBase}/api${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...extra
      }
    });
    if (res.status === 401) {
      await removeStorage('admin_token');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },

  getIpInfo(ip) {
    return this.request(`/ip-check${ip ? `?ip=${ip}` : ''}`);
  }
};

// ── Clock ──
function initClock() {
  const clockTime = document.getElementById('clock-time');
  const clockDate = document.getElementById('clock-date');
  if (!clockTime || !clockDate) return;

  function update() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    clockTime.textContent = `${hours}:${minutes}`;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    clockDate.textContent = now.toLocaleDateString('zh-CN', options);
  }

  update();
  setInterval(update, 1000);
}

// ── Search ──
async function updateSearchPlaceholder() {
  const input = document.getElementById('search-input');
  if (!input) return;
  const engine = await getStorage('search_engine', 'baidu');
  const engineNames = {
    baidu: '百度',
    google: 'Google',
    bing: '必应',
    yahoo: 'Yahoo',
    'ask.com': 'Ask.com',
    aol: 'AOL',
    duckduckgo: 'DuckDuckGo',
    ecosia: 'Ecosia',
    yandex: 'Yandex',
    sogou: '搜狗',
    so360: '360搜索',
    github: 'GitHub',
    stackoverflow: 'Stack Overflow',
    bilibili: '哔哩哔哩'
  };
  const name = engineNames[engine] || '百度';
  input.placeholder = `使用 ${name} 搜索...`;
}

function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (!q) return;

      const engine = await getStorage('search_engine', 'baidu');
      let searchUrl = '';
      switch (engine) {
        case 'google':
          searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
          break;
        case 'bing':
          searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
          break;
        case 'yahoo':
          searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`;
          break;
        case 'ask.com':
          searchUrl = `https://www.ask.com/web?q=${encodeURIComponent(q)}`;
          break;
        case 'aol':
          searchUrl = `https://search.aol.com/aol/search?q=${encodeURIComponent(q)}`;
          break;
        case 'duckduckgo':
          searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
          break;
        case 'ecosia':
          searchUrl = `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`;
          break;
        case 'yandex':
          searchUrl = `https://yandex.com/search/?text=${encodeURIComponent(q)}`;
          break;
        case 'sogou':
          searchUrl = `https://www.sogou.com/web?query=${encodeURIComponent(q)}`;
          break;
        case 'so360':
          searchUrl = `https://www.so.com/s?q=${encodeURIComponent(q)}`;
          break;
        case 'github':
          searchUrl = `https://github.com/search?q=${encodeURIComponent(q)}`;
          break;
        case 'stackoverflow':
          searchUrl = `https://stackoverflow.com/search?q=${encodeURIComponent(q)}`;
          break;
        case 'bilibili':
          searchUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`;
          break;
        case 'baidu':
        default:
          searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`;
          break;
      }
      window.open(searchUrl, '_blank');
    }
  });
}

// ── Edit Mode ──
function initEditMode() {
  const btn = document.getElementById('edit-toggle');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const favorites = await loadFavorites();
    if (editMode) {
      editMode = false;
      btn.textContent = '✏️ 编辑';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-ghost');
      renderCategories(allCategories, allLinks, favorites);
      return;
    }

    editMode = true;
    btn.textContent = '✅ 完成';
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-primary');
    renderCategories(allCategories, allLinks, favorites);
  });
}

// ── Modal UI ──
function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const closeBtn = document.getElementById('modal-close-btn');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideModal();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', hideModal);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
  });
}

function showModal(title, content) {
  const overlay = document.getElementById('modal-overlay');
  const panel = document.getElementById('modal-panel');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = content;
  overlay.style.display = 'flex';
  panel.classList.add('fade-in');
}

function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Favorites Storage ──
async function loadFavorites() {
  return await getStorage('favorites', []);
}

async function saveFavorites(favs) {
  await setStorage('favorites', favs);
}

async function toggleFavorite(id) {
  const favs = await loadFavorites();
  const idx = favs.indexOf(id);
  let added = false;
  if (idx === -1) {
    favs.push(id);
    added = true;
  } else {
    favs.splice(idx, 1);
  }
  await saveFavorites(favs);
  return added;
}

// ── Data Loading & Rendering ──
async function loadData() {
  try {
    const [categories, links, favorites] = await Promise.all([
      getStorage('local_categories', null),
      getStorage('local_links', null),
      loadFavorites()
    ]);

    if (!categories || !links) {
      // Show onboarding screen
      document.getElementById('content').innerHTML = `
        <div class="setup-container">
          <h3 class="setup-title">欢迎使用 dEmOn Speed Dial</h3>
          <p class="setup-desc">您尚未从云端同步数据。请先进入设置页面进行一次同步。</p>
          <button id="guide-settings-btn" class="btn btn-primary">⚙️ 前往设置页面同步</button>
        </div>
      `;
      document.getElementById('guide-settings-btn')?.addEventListener('click', () => {
        showSettingsModal();
      });
      return;
    }

    allCategories = categories;
    allLinks = links;
    renderCategories(categories, links, favorites);
  } catch (e) {
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <p class="error-text">加载本地数据失败: ${escapeHtml(e.message)}</p>
      </div>
    `;
  }
}

function renderCategories(categories, links, favorites) {
  const container = document.getElementById('content');

  if (!links.length && !editMode) {
    container.innerHTML = '<div class="empty-state">暂无导航链接</div>';
    return;
  }

  const sortedLinks = [...links].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const grouped = {};
  for (const cat of categories) {
    grouped[cat.id] = { ...cat, links: [] };
  }
  for (const link of sortedLinks) {
    if (grouped[link.category_id]) {
      grouped[link.category_id].links.push(link);
    }
  }

  const groups = Object.values(grouped).filter(g => g.links.length > 0 || editMode);

  const html = groups.map(group => `
    <section class="category fade-in" data-category-id="${group.id}">
      <div class="category-header">
        <span class="category-icon">${escapeHtml(group.icon) || '📁'}</span>
        <h2 class="category-title">${escapeHtml(group.name)}</h2>
        ${editMode ? `
          <div class="category-actions">
            <button class="btn btn-ghost btn-sm" data-action="edit-cat" data-id="${group.id}" title="编辑分类">⚙️</button>
            <button class="btn btn-ghost btn-sm" data-action="delete-cat" data-id="${group.id}" data-name="${escapeHtml(group.name)}" title="删除分类">🗑️</button>
          </div>
        ` : ''}
      </div>
      <div class="links-grid" data-category-id="${group.id}">
        ${group.links.map(link => renderLinkCard(link, favorites)).join('')}
        ${editMode ? `
          <button class="link-card link-card-add" data-action="add-link" data-category-id="${group.id}">
            <div class="link-favicon-fallback" style="background: var(--color-border); font-size: 20px;">+</div>
            <div class="link-info">
              <div class="link-title">添加链接</div>
            </div>
          </button>
        ` : ''}
      </div>
    </section>
  `).join('');

  container.innerHTML = html;

  if (editMode && categories.length > 0) {
    const addCatBtn = `
      <div style="text-align:center; margin: 24px 0;">
        <button class="btn btn-ghost" data-action="add-cat">+ 添加分类</button>
      </div>`;
    container.innerHTML += addCatBtn;
  }

  bindEvents(favorites);
}

function renderLinkCard(link, favorites) {
  const fav = favorites.includes(link.id);
  const fallbackLetter = escapeHtml(link.title.charAt(0).toUpperCase());
  const faviconHtml = link.favicon_url
    ? `<img class="link-favicon" src="${escapeHtml(link.favicon_url)}" alt="">`
    : '';

  return `
    <div class="link-card ${editMode ? 'link-card-editable' : ''}"
         data-link-id="${link.id}" data-category-id="${link.category_id}">
      ${faviconHtml}
      <div class="link-favicon-fallback" style="${link.favicon_url ? 'display:none;' : ''}">${fallbackLetter}</div>
      <div class="link-info">
        <div class="link-title">${escapeHtml(link.title)}</div>
        <div class="link-desc">${escapeHtml(link.description || '')}</div>
      </div>
      ${editMode ? `
        <div class="card-edit-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit-link" data-id="${link.id}" title="编辑">✏️</button>
          <button class="btn btn-danger btn-sm" data-action="delete-link" data-id="${link.id}" data-title="${escapeHtml(link.title)}" title="删除">🗑️</button>
        </div>
      ` : `
        <button class="link-fav ${fav ? 'active' : ''}" data-id="${link.id}" title="收藏">${fav ? '★' : '☆'}</button>
      `}
    </div>
  `;
}

// ── Events Binding ──
function bindEvents(favorites) {
  // Favicon error handling (CSP safe)
  document.querySelectorAll('img.link-favicon').forEach(img => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fallback = img.nextElementSibling;
      if (fallback && fallback.classList.contains('link-favicon-fallback')) {
        fallback.style.display = 'flex';
      }
    });
  });

  // Favorites toggle click
  document.querySelectorAll('.link-fav').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const added = await toggleFavorite(id);
      btn.textContent = added ? '★' : '☆';
      btn.classList.toggle('active', added);
      
      const idx = favorites.indexOf(id);
      if (added && idx === -1) favorites.push(id);
      else if (!added && idx !== -1) favorites.splice(idx, 1);
    });
  });

  // Edit Mode actions click
  if (editMode) {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', handleAction);
    });
  }

  // Always enable drag and drop
  initDragAndDrop();
}

// ── CRUD Action Handler ──
function handleAction(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;

  switch (action) {
    case 'add-link':
      showLinkModal({ category_id: Number(el.dataset.categoryId) });
      break;
    case 'edit-link': {
      const link = allLinks.find(l => l.id === Number(el.dataset.id));
      if (link) showLinkModal(link);
      break;
    }
    case 'delete-link':
      deleteLink(Number(el.dataset.id), el.dataset.title);
      break;
    case 'add-cat':
      showCategoryModal();
      break;
    case 'edit-cat': {
      const cat = allCategories.find(c => c.id === Number(el.dataset.id));
      if (cat) showCategoryModal(cat);
      break;
    }
    case 'delete-cat':
      deleteCategory(Number(el.dataset.id), el.dataset.name);
      break;
  }
}

// ── Modals implementation ──
function showLinkModal(link = {}) {
  const isEdit = !!link.id;
  const catOptions = allCategories.map(c =>
    `<option value="${c.id}" ${c.id === (link.category_id || allCategories[0]?.id) ? 'selected' : ''}>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`
  ).join('');

  showModal(isEdit ? '编辑链接' : '添加链接', `
    <form id="modal-link-form" style="display:flex;flex-direction:column;gap:16px;">
      <input type="hidden" id="mlink-id" value="${link.id || ''}">
      <div class="form-group">
        <label class="form-label">标题 *</label>
        <input type="text" id="mlink-title" value="${escapeHtml(link.title || '')}" placeholder="网站名称" required autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">URL *</label>
        <input type="url" id="mlink-url" value="${escapeHtml(link.url || '')}" placeholder="https://example.com" required autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">描述</label>
        <input type="text" id="mlink-desc" value="${escapeHtml(link.description || '')}" placeholder="简短描述" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">分类 *</label>
        <select id="mlink-category">${catOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">图标 URL（留空自动获取）</label>
        <input type="url" id="mlink-favicon" value="${escapeHtml(link.favicon_url || '')}" placeholder="自动获取" autocomplete="off">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-ghost" id="mlink-cancel">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  `);

  document.getElementById('mlink-cancel').addEventListener('click', hideModal);

  document.getElementById('modal-link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('mlink-id').value;
    const categoryId = Number(document.getElementById('mlink-category').value);
    
    const category = allCategories.find(c => c.id === categoryId);
    const categorySlug = category ? category.slug : '';

    const data = {
      title: document.getElementById('mlink-title').value,
      url: document.getElementById('mlink-url').value,
      description: document.getElementById('mlink-desc').value,
      category_id: categoryId,
      category_slug: categorySlug,
      favicon_url: document.getElementById('mlink-favicon').value || undefined,
      sort_order: 0,
    };

    try {
      if (id) {
        const numericId = Number(id);
        allLinks = allLinks.map(l => l.id === numericId ? { ...l, ...data, id: numericId } : l);
      } else {
        const newId = Date.now();
        data.id = newId;
        allLinks.push(data);
      }
      await setStorage('local_links', allLinks);
      hideModal();
      await loadData();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  });
}

function showCategoryModal(cat = {}) {
  const isEdit = !!cat.id;
  showModal(isEdit ? '编辑分类' : '添加分类', `
    <form id="modal-cat-form" style="display:flex;flex-direction:column;gap:16px;">
      <input type="hidden" id="mcat-id" value="${cat.id || ''}">
      <div class="form-group">
        <label class="form-label">名称 *</label>
        <input type="text" id="mcat-name" value="${escapeHtml(cat.name || '')}" placeholder="分类名称" required autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">图标（emoji）</label>
        <input type="text" id="mcat-icon" value="${escapeHtml(cat.icon || '')}" placeholder="🌐" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Slug *</label>
        <input type="text" id="mcat-slug" value="${escapeHtml(cat.slug || '')}" placeholder="category-slug" required autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">排序</label>
        <input type="number" id="mcat-sort" value="${cat.sort_order ?? 0}" placeholder="0" autocomplete="off">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-ghost" id="mcat-cancel">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  `);

  document.getElementById('mcat-cancel').addEventListener('click', hideModal);

  document.getElementById('modal-cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('mcat-id').value;
    const data = {
      name: document.getElementById('mcat-name').value,
      icon: document.getElementById('mcat-icon').value,
      slug: document.getElementById('mcat-slug').value,
      sort_order: Number(document.getElementById('mcat-sort').value) || 0,
    };

    try {
      if (id) {
        const numericId = Number(id);
        allCategories = allCategories.map(c => c.id === numericId ? { ...c, ...data, id: numericId } : c);
      } else {
        const newId = Date.now();
        data.id = newId;
        allCategories.push(data);
      }
      await setStorage('local_categories', allCategories);
      hideModal();
      await loadData();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  });
}

async function deleteLink(id, title) {
  if (!confirm(`确定删除「${title}」？`)) return;
  try {
    allLinks = allLinks.filter(l => l.id !== id);
    await setStorage('local_links', allLinks);
    await loadData();
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`确定删除分类「${name}」？该分类下的链接也会被删除。`)) return;
  try {
    allCategories = allCategories.filter(c => c.id !== id);
    allLinks = allLinks.filter(l => l.category_id !== id);
    await setStorage('local_categories', allCategories);
    await setStorage('local_links', allLinks);
    await loadData();
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

// ── Drag & Drop ──
let dragState = null;

function initDragAndDrop() {
  document.querySelectorAll('.link-card[data-link-id]').forEach(card => {
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // left click only
      if (e.target.closest('.link-fav') || e.target.closest('[data-action]')) return;
      
      e.preventDefault(); // Prevent native image drag and text selection
      
      const startX = e.clientX;
      const startY = e.clientY;
      let dragStarted = false;
      
      function onMouseMove(moveEvent) {
        if (!dragStarted) {
          const dist = Math.sqrt(Math.pow(moveEvent.clientX - startX, 2) + Math.pow(moveEvent.clientY - startY, 2));
          if (dist > 5) {
            dragStarted = true;
            startDrag(moveEvent, card);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          }
        }
      }
      
      function onMouseUp(upEvent) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (!dragStarted) {
          const linkId = Number(card.dataset.linkId);
          const link = allLinks.find(l => l.id === linkId);
          if (link) {
            window.open(link.url, '_blank');
          }
        }
      }
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

let rAF = null;

function startDrag(e, card) {
  if (!card) return;

  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.className = 'link-card drag-ghost';
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left = '0px';
  ghost.style.top = '0px';
  
  const gripX = e.clientX - rect.left;
  const gripY = e.clientY - rect.top;
  
  const offsetX = e.clientX - gripX;
  const offsetY = e.clientY - gripY;
  ghost.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(1.05)`;
  
  document.body.appendChild(ghost);

  card.style.opacity = '0.3';

  const sourceGrid = card.closest('.links-grid');
  let siblingRects = [];
  if (sourceGrid) {
    const siblings = [...sourceGrid.querySelectorAll('.link-card[data-link-id]')]
      .filter(c => c !== card);
    siblingRects = siblings.map(c => ({
      element: c,
      rect: c.getBoundingClientRect()
    }));
  }

  dragState = { 
    card, 
    ghost, 
    moved: false, 
    swapTarget: null, 
    siblingRects,
    gripX,
    gripY
  };

  document.addEventListener('mousemove', onDragMove, { passive: false });
  document.addEventListener('mouseup',   onDragEnd);
}

function onDragMove(e) {
  if (!dragState) return;
  e.preventDefault();
  dragState.moved = true;

  if (rAF) cancelAnimationFrame(rAF);

  rAF = requestAnimationFrame(() => {
    if (!dragState) return;
    
    const { ghost, siblingRects, gripX, gripY } = dragState;
    const offsetX = e.clientX - gripX;
    const offsetY = e.clientY - gripY;
    
    ghost.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(1.05)`;

    let newTarget = null;
    for (const item of siblingRects) {
      const r = item.rect;
      if (e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top  && e.clientY <= r.bottom) {
        newTarget = item.element;
        break;
      }
    }

    if (dragState.swapTarget !== newTarget) {
      if (dragState.swapTarget) dragState.swapTarget.classList.remove('drop-target');
      if (newTarget)            newTarget.classList.add('drop-target');
      dragState.swapTarget = newTarget;
    }
  });
}

async function onDragEnd() {
  if (rAF) cancelAnimationFrame(rAF);
  if (!dragState) return;

  const { card, ghost, swapTarget } = dragState;

  ghost.remove();
  card.style.opacity = '';
  if (swapTarget) swapTarget.classList.remove('drop-target');

  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup',   onDragEnd);

  if (dragState.moved && swapTarget) {
    const grid = card.closest('.links-grid');
    if (grid && grid === swapTarget.closest('.links-grid')) {
      const placeholder = document.createElement('div');
      grid.insertBefore(placeholder, card);
      grid.insertBefore(card, swapTarget);
      grid.insertBefore(swapTarget, placeholder);
      placeholder.remove();

      await saveOrder(grid);
    }
  }

  dragState = null;
}

async function saveOrder(grid) {
  const newCategoryId = Number(grid.dataset.categoryId);
  const cards = grid.querySelectorAll('.link-card[data-link-id]');
  
  const category = allCategories.find(c => c.id === newCategoryId);
  const categorySlug = category ? category.slug : '';

  cards.forEach((c, index) => {
    const linkId = Number(c.dataset.linkId);
    allLinks = allLinks.map(l => {
      if (l.id === linkId) {
        return { ...l, category_id: newCategoryId, category_slug: categorySlug, sort_order: index + 1 };
      }
      return l;
    });
    c.dataset.categoryId = String(newCategoryId);
  });

  try {
    await setStorage('local_links', allLinks);
    allLinks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  } catch (err) {
    console.error('Sort update failed:', err);
    alert('排序保存失败: ' + err.message);
  }
}

// ── Back to Top ──
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ── Settings Button click ──
function initSettingsBtn() {
  const settingsBtn = document.getElementById('settings-btn');
  if (!settingsBtn) return;

  settingsBtn.addEventListener('click', () => {
    showSettingsModal();
  });
}

async function showSettingsModal() {
  const apiBase = await api.getBase();
  const token = await getStorage('admin_token', null);
  const localCats = await getStorage('local_categories', []);
  const localLnks = await getStorage('local_links', []);

  const loginStatusText = token ? '<span style="color:#10b981;">已登录为管理员</span>' : '<span style="color:var(--color-muted);">未登录</span>';
  const logoutBtnHtml = token ? '<button id="mset-logout-btn" class="btn btn-danger btn-sm" style="padding:4px 8px;font-size:11px;">🔒 退出登录</button>' : '';

  showModal('⚙️ 扩展设置与同步', `
    <div style="display:flex;flex-direction:column;gap:16px;max-height:70vh;overflow-y:auto;text-align:left;padding-right:6px;">
      <!-- Base Config -->
      <div style="display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--color-border);padding-bottom:14px;">
        <div class="form-group">
          <label class="form-label">后端 API 基准地址 (API Base URL)</label>
          <input type="url" id="mset-api-base" value="${escapeHtml(apiBase)}" placeholder="https://nav.ipanic.bond" required autocomplete="off">
          <div id="mset-conn-status" class="status-msg"></div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="mset-test-btn" class="btn btn-ghost btn-sm" style="flex: 1;">🔍 测试连接</button>
          <button id="mset-save-btn" class="btn btn-primary btn-sm" style="flex: 1;">💾 保存设置</button>
        </div>
      </div>

      <!-- Search Engine Config -->
      <div style="display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--color-border);padding-bottom:14px;">
        <h4 style="font-size:14px;color:var(--color-ink);font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:2px;">🔍 默认网页搜索</h4>
        <div class="form-group">
          <label class="form-label">选择搜索引擎（输入内容后回车直接搜索）</label>
          <select id="mset-search-engine" style="width:100%;padding:6px;border-radius:var(--radius-sm);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-ink);font-size:13px;outline:none;">
            <optgroup label="通用搜索">
              <option value="baidu">百度 (Baidu)</option>
              <option value="google">Google (谷歌)</option>
              <option value="bing">必应 (Bing)</option>
              <option value="yahoo">Yahoo (雅虎)</option>
              <option value="ask.com">Ask.com (问答)</option>
              <option value="aol">AOL (美国在线)</option>
              <option value="duckduckgo">DuckDuckGo (隐私)</option>
              <option value="ecosia">Ecosia (植树环保)</option>
              <option value="yandex">Yandex (俄罗斯)</option>
              <option value="sogou">搜狗 (Sogou)</option>
              <option value="so360">360 搜索</option>
            </optgroup>
            <optgroup label="开发技术">
              <option value="github">GitHub</option>
              <option value="stackoverflow">Stack Overflow</option>
            </optgroup>
            <optgroup label="社区媒体">
              <option value="bilibili">哔哩哔哩 (Bilibili)</option>
            </optgroup>
          </select>
        </div>
      </div>

      <!-- Sync Config -->
      <div style="display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--color-border);padding-bottom:14px;">
        <h4 style="font-size:14px;color:var(--color-ink);font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:2px;">🔄 数据双向同步</h4>
        <div class="form-group">
          <label class="form-label">管理员密码 (同步鉴权使用)</label>
          <input type="password" id="mset-password" placeholder="输入管理密码" autocomplete="off">
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="mset-pull-btn" class="btn btn-ghost btn-sm" style="flex: 1;">☁️ 从云端拉取</button>
          <button id="mset-push-btn" class="btn btn-primary btn-sm" style="flex: 1;">📱 同步到云端</button>
        </div>
        <div id="mset-sync-status" class="status-msg"></div>
      </div>

      <!-- Actions & Reset -->
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: var(--color-muted);">管理员状态</span>
          <div style="display:flex;align-items:center;gap:8px;">
            ${loginStatusText}
            ${logoutBtnHtml}
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: var(--color-muted);">本地数据量</span>
          <span style="font-size: 13px; color: var(--color-ink); font-weight:500;">${localCats.length} 分类 / ${localLnks.length} 链接</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span style="font-size: 13px; color: var(--color-muted);">重置本地数据</span>
          <button id="mset-reset-btn" class="btn btn-danger btn-sm" style="padding:4px 8px;font-size:11px;">⚠️ 清除并重置</button>
        </div>
      </div>
    </div>
  `);

  const msetApiBase = document.getElementById('mset-api-base');
  const msetConnStatus = document.getElementById('mset-conn-status');
  const msetTestBtn = document.getElementById('mset-test-btn');
  const msetSaveBtn = document.getElementById('mset-save-btn');

  const msetSearchEngine = document.getElementById('mset-search-engine');
  const msetPassword = document.getElementById('mset-password');
  const msetPullBtn = document.getElementById('mset-pull-btn');
  const msetPushBtn = document.getElementById('mset-push-btn');
  const msetSyncStatus = document.getElementById('mset-sync-status');

  const msetLogoutBtn = document.getElementById('mset-logout-btn');
  const msetResetBtn = document.getElementById('mset-reset-btn');

  if (msetSearchEngine) {
    const savedEngine = await getStorage('search_engine', 'baidu');
    msetSearchEngine.value = savedEngine;
    msetSearchEngine.addEventListener('change', async () => {
      await setStorage('search_engine', msetSearchEngine.value);
      await updateSearchPlaceholder();
    });
  }

  async function getModalAuthToken() {
    const pw = msetPassword.value.trim();
    const apiBase = msetApiBase.value.trim().replace(/\/$/, '');
    if (pw) {
      try {
        const res = await fetch(`${apiBase}/api/admin/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw })
        });
        if (!res.ok) throw new Error('密码错误或身份认证失败。');
        const { token } = await res.json();
        await setStorage('admin_token', token);
        msetPassword.value = '';
        return token;
      } catch (err) {
        throw new Error(err.message);
      }
    }
    const saved = await getStorage('admin_token', null);
    if (!saved) throw new Error('请输入管理员密码。');
    return saved;
  }

  msetTestBtn.addEventListener('click', async () => {
    const rawUrl = msetApiBase.value.trim();
    if (!rawUrl) {
      showStatus(msetConnStatus, '请输入基准地址', false);
      return;
    }
    const cleanUrl = rawUrl.replace(/\/$/, '');
    showStatus(msetConnStatus, '正在测试连接...', null);
    msetTestBtn.disabled = true;
    try {
      const res = await fetch(`${cleanUrl}/api/categories`);
      if (res.ok) {
        showStatus(msetConnStatus, '连接成功！后端响应正常。', true);
      } else {
        showStatus(msetConnStatus, `连接失败 (HTTP ${res.status}): ${res.statusText}`, false);
      }
    } catch (err) {
      showStatus(msetConnStatus, `连接失败: ${err.message}`, false);
    } finally {
      msetTestBtn.disabled = false;
    }
  });

  msetSaveBtn.addEventListener('click', async () => {
    const rawUrl = msetApiBase.value.trim();
    if (!rawUrl) {
      showStatus(msetConnStatus, '请输入基准地址', false);
      return;
    }
    const cleanUrl = rawUrl.replace(/\/$/, '');
    await setStorage('api_base', cleanUrl);
    showStatus(msetConnStatus, '设置已保存！', true);
    setTimeout(() => { msetConnStatus.textContent = ''; }, 3000);
  });

  if (msetLogoutBtn) {
    msetLogoutBtn.addEventListener('click', async () => {
      if (confirm('确定退出管理员登录状态吗？')) {
        await removeStorage('admin_token');
        hideModal();
        showSettingsModal();
      }
    });
  }

  msetResetBtn.addEventListener('click', async () => {
    if (confirm('警告：此操作将清除所有本地设置、分类、链接及收藏数据！确定继续吗？')) {
      await removeStorage('admin_token');
      await removeStorage('local_categories');
      await removeStorage('local_links');
      await removeStorage('favorites');
      await setStorage('api_base', 'https://nav.ipanic.bond');
      hideModal();
      await loadData();
      showSettingsModal();
    }
  });

  msetPullBtn.addEventListener('click', async () => {
    const apiBase = msetApiBase.value.trim().replace(/\/$/, '');
    showStatus(msetSyncStatus, '正在从云端拉取数据...', null);
    msetPullBtn.disabled = true;
    try {
      const token = await getModalAuthToken();
      const catRes = await fetch(`${apiBase}/api/categories`);
      if (!catRes.ok) throw new Error('拉取分类失败');
      const categories = await catRes.json();

      const linkRes = await fetch(`${apiBase}/api/links`);
      if (!linkRes.ok) throw new Error('拉取链接失败');
      const links = await linkRes.json();

      const slugMap = {};
      categories.forEach(c => { slugMap[c.id] = c.slug; });
      const mappedLinks = links.map(l => ({ ...l, category_slug: slugMap[l.category_id] || '' }));

      await setStorage('local_categories', categories);
      await setStorage('local_links', mappedLinks);
      showStatus(msetSyncStatus, `拉取成功！已同步 ${categories.length} 个分类，${mappedLinks.length} 个链接。`, true);
      
      await loadData();
      setTimeout(() => {
        hideModal();
        showSettingsModal();
      }, 1000);
    } catch (err) {
      showStatus(msetSyncStatus, '拉取失败: ' + err.message, false);
    } finally {
      msetPullBtn.disabled = false;
    }
  });

  msetPushBtn.addEventListener('click', async () => {
    const apiBase = msetApiBase.value.trim().replace(/\/$/, '');
    const localCategories = await getStorage('local_categories', null);
    const localLinks = await getStorage('local_links', null);

    if (!localCategories || !localLinks || localCategories.length === 0) {
      showStatus(msetSyncStatus, '推送失败: 本地暂无数据。', false);
      return;
    }

    if (!confirm(`警告：此操作将使用本地数据（共 ${localCategories.length} 个分类，${localLinks.length} 个链接）完全覆盖云端数据库，确定继续吗？`)) {
      return;
    }

    showStatus(msetSyncStatus, '正在同步到云端...', null);
    msetPushBtn.disabled = true;

    try {
      const token = await getModalAuthToken();
      const syncRes = await fetch(`${apiBase}/api/admin/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ categories: localCategories, links: localLinks })
      });

      if (!syncRes.ok) {
        const errJson = await syncRes.json().catch(() => ({ error: syncRes.statusText }));
        throw new Error(errJson.error || '推送失败');
      }

      showStatus(msetSyncStatus, '同步成功！正在重新载入获取服务器分配的 ID...', null);

      const catRes = await fetch(`${apiBase}/api/categories`);
      const linksRes = await fetch(`${apiBase}/api/links`);
      if (catRes.ok && linksRes.ok) {
        const categories = await catRes.json();
        const links = await linksRes.json();
        const slugMap = {};
        categories.forEach(c => { slugMap[c.id] = c.slug; });
        const mappedLinks = links.map(l => ({ ...l, category_slug: slugMap[l.category_id] || '' }));
        await setStorage('local_categories', categories);
        await setStorage('local_links', mappedLinks);
      }

      showStatus(msetSyncStatus, '全部同步并刷新完成！本地和云端已 100% 同步。', true);
      await loadData();
      setTimeout(() => {
        hideModal();
        showSettingsModal();
      }, 1000);
    } catch (err) {
      showStatus(msetSyncStatus, '同步失败: ' + err.message, false);
    } finally {
      msetPushBtn.disabled = false;
    }
  });

  function showStatus(element, msg, success) {
    if (!element) return;
    element.textContent = msg;
    element.className = 'status-msg';
    if (success === true) {
      element.classList.add('status-success');
    } else if (success === false) {
      element.classList.add('status-error');
    } else {
      element.style.color = 'var(--color-muted)';
    }
  }
}

// ── IP Purity Detection ──
async function getClientIpv4() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch('https://api4.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return data.ip;
    }
  } catch (err) {
    console.warn('Failed to fetch IPv4 from ipify:', err);
  }
  return null;
}

function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  
  leafletPromise = new Promise((resolve, reject) => {
    if (window.L) {
      resolve();
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'leaflet.css';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'leaflet.js';
    script.onload = () => resolve();
    script.onerror = (err) => {
      leafletPromise = null;
      reject(new Error('Failed to load Leaflet.js'));
    };
    document.body.appendChild(script);
  });
  return leafletPromise;
}

function renderMiniMap(lat, lon) {
  if (ipMap) {
    try {
      ipMap.remove();
    } catch (e) {
      console.warn('Error removing map:', e);
    }
    ipMap = null;
  }
  
  const mapContainer = document.getElementById('ip-minimap');
  if (!mapContainer) return;
  
  try {
    ipMap = L.map(mapContainer, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false
    }).setView([lat, lon], 7);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(ipMap);
    
    L.circleMarker([lat, lon], {
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.8,
      radius: 6
    }).addTo(ipMap);
    
    setTimeout(() => {
      if (ipMap) ipMap.invalidateSize();
    }, 100);
  } catch (err) {
    console.error('Failed to init Leaflet map:', err);
  }
}

function renderIpBadge(info) {
  const container = document.getElementById('ip-badge');
  if (!container) return;
  
  let badgeClass = 'ip-clean';
  let statusText = '纯净';
  let statusEmoji = '🟢';

  if (info.level === 'danger') {
    badgeClass = 'ip-danger';
    statusText = '高风险';
    statusEmoji = '🔴';
  } else if (info.level === 'suspicious') {
    badgeClass = 'ip-suspicious';
    statusText = '中风险';
    statusEmoji = '🟡';
  }

  const tooltip = `${info.country || ''} ${info.city || ''}`.trim() || '未知位置';

  container.innerHTML = `
    <div class="ip-badge ${badgeClass}" style="cursor: pointer;" title="${escapeHtml(tooltip)}">
      <span class="ip-emoji">${statusEmoji}</span>
      <span class="ip-text">${escapeHtml(info.ip)}</span>
      <span class="ip-status-text">${statusText}</span>
    </div>
  `;
}

function fillPopupContent(info) {
  const popup = document.getElementById('ip-popup');
  if (!popup) return;

  let statusText = '安全';
  let statusEmoji = '🟢';
  let riskScore = 0;

  if (info.level === 'danger') {
    statusText = '高风险';
    statusEmoji = '🔴';
    riskScore = info.threat_score > 49 ? info.threat_score : 75;
  } else if (info.level === 'suspicious') {
    statusText = '中风险';
    statusEmoji = '🟡';
    riskScore = info.threat_score > 10 ? info.threat_score : 35;
  } else {
    riskScore = info.threat_score || 5;
  }

  const geoParts = [];
  if (info.continent) geoParts.push(info.continent);
  if (info.country) geoParts.push(info.country);
  if (info.region) geoParts.push(info.region);
  if (info.city) geoParts.push(info.city);
  if (info.district) geoParts.push(info.district);
  const geoText = geoParts.join(' · ') || '未知位置';

  let connTypeLabel = '未知网络';
  if (info.conn_type === 'residential') connTypeLabel = '🏠 家用宽带';
  else if (info.conn_type === 'mobile') connTypeLabel = '📡 移动蜂窝';
  else if (info.conn_type === 'datacenter') connTypeLabel = '🏢 数据中心';

  popup.innerHTML = `
    <div class="ip-popup-header">
      <span class="ip-popup-title">🛡️ IP 安全画像</span>
      <div class="ip-popup-actions">
        <button id="ip-refresh-btn" class="ip-btn-icon" title="重新检测">🔄</button>
        <button id="ip-close-btn" class="ip-btn-icon" style="font-size:16px;" title="关闭">✕</button>
      </div>
    </div>
    <div class="ip-popup-ip-row">
      <div class="ip-popup-ip">
        <span>${statusEmoji}</span>
        <span>${escapeHtml(info.ip)}</span>
      </div>
      <button id="ip-copy-btn" class="ip-popup-copy-btn">📋 复制</button>
    </div>
    <div class="ip-popup-geo">
      <span>📍</span>
      <span>${escapeHtml(geoText)}</span>
    </div>
    <div class="ip-risk-section">
      <div class="ip-risk-label-row">
        <span>风险评分</span>
        <span style="color: ${info.level === 'danger' ? '#ef4444' : info.level === 'suspicious' ? '#eab308' : '#22c55e'}">${riskScore} / 100 (${statusText})</span>
      </div>
      <div class="ip-risk-bar-container">
        <div id="ip-risk-bar" class="ip-risk-bar" style="width: 0%;"></div>
      </div>
    </div>
    <div class="ip-tags-row">
      <span class="ip-tag ip-tag-${info.conn_type || 'info'}">${connTypeLabel}</span>
      ${info.continent ? `<span class="ip-tag ip-tag-info">🌏 ${escapeHtml(info.continent)}</span>` : ''}
      ${info.timezone ? `<span class="ip-tag ip-tag-info">🕐 ${escapeHtml(info.timezone)}</span>` : ''}
    </div>
    <div class="ip-details-list">
      <div class="ip-details-row">
        <span class="ip-details-label">运营商 (ISP)</span>
        <span class="ip-details-val" title="${escapeHtml(info.isp || '未知')}">${escapeHtml(info.isp || '未知')}</span>
      </div>
      <div class="ip-details-row">
        <span class="ip-details-label">AS 编号</span>
        <span class="ip-details-val" title="${escapeHtml(info.as || '未知')}">${escapeHtml(info.as || '未知')}</span>
      </div>
      <div class="ip-details-row">
        <span class="ip-details-label">代理 / VPN</span>
        <span class="ip-details-val" style="color: ${info.is_proxy ? '#ef4444' : 'inherit'}">${info.is_proxy ? '⚠️ 检测到' : '未检测到'}</span>
      </div>
      <div class="ip-details-row">
        <span class="ip-details-label">机房 IP (Hosting)</span>
        <span class="ip-details-val" style="color: ${info.is_hosting ? '#ef4444' : 'inherit'}">${info.is_hosting ? '⚠️ 是' : '否'}</span>
      </div>
    </div>
    <div class="ip-map-section" id="ip-map-section">
      <div id="ip-minimap" class="ip-minimap"></div>
      <div class="ip-coords-text">经纬度: ${info.lat !== null ? info.lat.toFixed(4) : '--'}, ${info.lon !== null ? info.lon.toFixed(4) : '--'}</div>
    </div>
  `;

  setTimeout(() => {
    const bar = document.getElementById('ip-risk-bar');
    if (bar) bar.style.width = `${riskScore}%`;
  }, 50);

  // Bind actions
  document.getElementById('ip-close-btn').addEventListener('click', () => {
    popup.style.display = 'none';
  });

  document.getElementById('ip-copy-btn').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(info.ip);
      const btn = e.currentTarget || e.target;
      btn.innerText = '✅ 已复制';
      setTimeout(() => {
        btn.innerText = '📋 复制';
      }, 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  });

  document.getElementById('ip-refresh-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget || e.target;
    btn.classList.add('ip-spinner');
    btn.disabled = true;
    try {
      const ipv4 = await getClientIpv4();
      const newInfo = await api.getIpInfo(ipv4);
      if (newInfo && !newInfo.error) {
        currentIpInfo = newInfo;
        renderIpBadge(newInfo);
        fillPopupContent(newInfo);
        if (newInfo.lat !== null && newInfo.lon !== null) {
          await loadLeaflet();
          renderMiniMap(newInfo.lat, newInfo.lon);
        }
      }
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      btn.classList.remove('ip-spinner');
      btn.disabled = false;
    }
  });
}

async function initIpBadge() {
  const container = document.getElementById('ip-badge');
  const popup = document.getElementById('ip-popup');
  if (!container || !popup) return;

  container.innerHTML = '<span class="ip-loading">IP 检测中...</span>';

  try {
    const ipv4 = await getClientIpv4();
    const info = await api.getIpInfo(ipv4);
    if (!info || info.error) {
      container.innerHTML = '<span class="ip-err" title="获取IP纯净度失败">⚠️ IP获取失败</span>';
      return;
    }

    currentIpInfo = info;
    renderIpBadge(info);

    container.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (popup.style.display === 'none') {
        fillPopupContent(currentIpInfo);
        popup.style.display = 'flex';
        
        if (currentIpInfo.lat !== null && currentIpInfo.lon !== null) {
          try {
            await loadLeaflet();
            renderMiniMap(currentIpInfo.lat, currentIpInfo.lon);
          } catch (err) {
            console.error(err);
          }
        }
      } else {
        popup.style.display = 'none';
      }
    });

    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && !container.contains(e.target)) {
        popup.style.display = 'none';
      }
    });

    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });

  } catch (err) {
    console.error('Failed to init IP badge:', err);
    container.innerHTML = '<span class="ip-err" title="连接API失败">⚠️ 无法检测</span>';
  }
}

// ── HTML Escaping Utility ──
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Init ──
async function init() {
  initClock();
  initBackToTop();
  initSearch();
  await updateSearchPlaceholder();
  initEditMode();
  initModal();
  initSettingsBtn();

  await loadData();
  await initIpBadge();
}

document.addEventListener('DOMContentLoaded', init);
