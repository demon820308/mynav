import '../css/variables.css';
import '../css/base.css';
import '../css/components.css';

import { api } from './api.js';
import { initTheme } from './theme.js';
import { initWeather } from './weather.js';
import { isFavorite, toggleFavorite } from './favorites.js';
import { escapeHtml, linkify, renderMarkdown } from './utils.js';

let allLinks = [];
let allCategories = [];
let editMode = false;
let dragState = null;
let currentIpInfo = null;
let ipMap = null;

async function init() {
  initTheme();
  initBackToTop();
  initSearch();
  initEditMode();
  initModal();
  initIpBadge();
  initWeather();
  initMemos();

  await loadData();
  initGithubTabs();
}

async function loadData() {
  try {
    const [categories, links] = await Promise.all([
      api.getCategories(),
      api.getLinks(),
    ]);
    allCategories = categories;
    allLinks = links;
    renderCategories(categories, links);
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<div class="empty-state">加载失败: ${e.message}</div>`;
  }
}

// ── Edit Mode ──

function initEditMode() {
  const btn = document.getElementById('edit-toggle');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (editMode) {
      editMode = false;
      btn.textContent = '✏️ 编辑';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-ghost');
      renderCategories(allCategories, allLinks);
      return;
    }

    if (!api.isLoggedIn()) {
      showLoginModal();
      return;
    }

    editMode = true;
    btn.textContent = '✅ 完成';
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-primary');
    renderCategories(allCategories, allLinks);
  });
}

// ── Render ──

function renderCategories(categories, links) {
  const container = document.getElementById('content');

  if (!links.length && !editMode) {
    container.innerHTML = '<div class="empty-state">暂无导航链接</div>';
    return;
  }

  // Ensure links are sorted by sort_order
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
        ${group.links.map(link => renderLinkCard(link)).join('')}
        ${editMode ? `
          <button class="link-card link-card-add" data-action="add-link" data-category-id="${group.id}">
            <div class="link-favicon-fallback" style="background: var(--color-border);">+</div>
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
    const addCatBtn = `<div style="text-align:center; margin: 16px 0;">
      <button class="btn btn-ghost" data-action="add-cat">+ 添加分类</button>
    </div>`;
    container.innerHTML += addCatBtn;
  }

  bindEvents();
}

function renderLinkCard(link, favorites = []) {
  const isFav = Array.isArray(favorites)
    ? favorites.includes(link.id)
    : (typeof isFavorite === 'function' && isFavorite(link.id));

  const fallbackLetter = escapeHtml(link.title.charAt(0).toUpperCase());
  
  let faviconUrl = link.favicon_url;
  if (!faviconUrl && link.url) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(link.url)}&size=64`;
      } else {
        const domain = new URL(link.url).hostname;
        faviconUrl = `https://www.faviconextractor.com/favicon/${domain}?larger=true`;
      }
    } catch (e) {
      faviconUrl = '';
    }
  }

  const faviconHtml = faviconUrl
    ? `<img class="link-favicon" src="${escapeHtml(faviconUrl)}" alt="">`
    : '';

  return `
    <div class="link-card ${editMode ? 'link-card-editable' : ''}"
         data-link-id="${link.id}" data-category-id="${link.category_id}">
      ${faviconHtml}
      <div class="link-favicon-fallback" style="${faviconUrl ? 'display:none;' : ''}">${fallbackLetter}</div>
      <div class="link-info">
        <div class="link-title">${escapeHtml(link.title)}</div>
        <div class="link-desc">${escapeHtml(link.description || '')}</div>
      </div>
      ${editMode ? `
        <div class="card-edit-actions">
          <button class="btn btn-danger btn-sm" data-action="delete-link" data-id="${link.id}" data-title="${escapeHtml(link.title)}" title="删除">🗑️</button>
        </div>
      ` : `
        <button class="link-fav ${isFav ? 'active' : ''}" data-id="${link.id}" title="收藏">${isFav ? '★' : '☆'}</button>
      `}
    </div>
  `;
}

// ── Events ──

function bindEvents() {
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

  // Favorites
  document.querySelectorAll('.link-fav').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const added = toggleFavorite(id);
      btn.textContent = added ? '★' : '☆';
      btn.classList.toggle('active', added);
    });
  });

  // Edit mode actions
  if (editMode) {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', handleAction);
    });
    // Click card body to edit link
    document.querySelectorAll('.link-card[data-link-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.link-fav') || e.target.closest('[data-action]')) return;
        const link = allLinks.find(l => l.id === Number(card.dataset.linkId));
        if (link) showLinkModal(link);
      });
    });
  }

  // Always enable drag and drop
  initDragAndDrop();
}

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

// ── Drag & Drop (swap on release) ──
//
// Interaction: drag a card and hover over another card in the SAME category.
// On mouse release the two cards swap positions. No cross-category movement.
// The hovered card is highlighted so the user always knows what will swap.

function initDragAndDrop() {
  document.querySelectorAll('.link-card[data-link-id]').forEach(card => {
    card.addEventListener('mousedown', (e) => {
      if (editMode) return; // Disable dragging in edit mode
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
            document.removeEventListener('mouseup',   onMouseUp);
          }
        }
      }
      
      function onMouseUp(upEvent) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (!dragStarted && !editMode) {
          const link = allLinks.find(l => l.id === Number(card.dataset.linkId));
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
  ghost.style.transition = 'none';
  
  const gripX = e.clientX - rect.left;
  const gripY = e.clientY - rect.top;
  
  const offsetX = e.clientX - gripX;
  const offsetY = e.clientY - gripY;
  
  // Apply initial scale and tilt rotate for physical pickup feel
  ghost.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(1.05) rotate(1.5deg)`;
  
  document.body.appendChild(ghost);

  // Hide the original card slot
  card.style.opacity = '0';

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
    
    // Smooth trailing with tilt rotate
    ghost.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(1.05) rotate(1.5deg)`;

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

function onDragEnd() {
  if (rAF) cancelAnimationFrame(rAF);
  if (!dragState) return;

  const { card, ghost, swapTarget, moved } = dragState;

  if (swapTarget) swapTarget.classList.remove('drop-target');

  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup',   onDragEnd);

  const grid = card.closest('.links-grid');

  if (moved && swapTarget && grid && grid === swapTarget.closest('.links-grid')) {
    // 1. FLIP: Record initial positions
    const siblings = [...grid.querySelectorAll('.link-card[data-link-id]')];
    const positions = siblings.map(c => {
      const rect = c.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });

    // 2. Perform DOM movement
    const cardIndex = siblings.indexOf(card);
    const targetIndex = siblings.indexOf(swapTarget);

    if (cardIndex < targetIndex) {
      grid.insertBefore(card, swapTarget.nextSibling);
    } else {
      grid.insertBefore(card, swapTarget);
    }

    // 3. FLIP: Record final positions
    const newSiblings = [...grid.querySelectorAll('.link-card[data-link-id]')];
    const newPositions = newSiblings.map(c => {
      const rect = c.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });

    // 4. Calculate target landing rect for the ghost
    const targetRect = card.getBoundingClientRect();

    // 5. Animate ghost landing (with scale recovery and spring curve)
    ghost.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    ghost.style.transform = `translate3d(${targetRect.left}px, ${targetRect.top}px, 0) scale(1) rotate(0deg)`;

    // 6. FLIP: Animate other cards sliding
    newSiblings.forEach((c, i) => {
      if (c === card) return; // card itself is hidden and represented by ghost
      
      const oldIdx = siblings.indexOf(c);
      if (oldIdx === -1) return;
      
      const dx = positions[oldIdx].left - newPositions[i].left;
      const dy = positions[oldIdx].top - newPositions[i].top;
      
      if (dx !== 0 || dy !== 0) {
        c.style.transition = 'none';
        c.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        c.offsetHeight; // force reflow
        c.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        c.style.transform = 'none';
        
        // Cleanup transition styles after animation completes
        setTimeout(() => {
          c.style.transition = '';
          c.style.transform = '';
        }, 300);
      }
    });

    // 7. Cleanup ghost and restore card visibility after landing animation
    setTimeout(() => {
      ghost.remove();
      card.style.transition = 'none';
      card.style.opacity = '';
      card.offsetHeight; // force reflow
      card.style.transition = '';
      saveOrder(grid);
    }, 300);

  } else {
    // No swap happened, animate ghost back to its original slot
    const targetRect = card.getBoundingClientRect();
    ghost.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    ghost.style.transform = `translate3d(${targetRect.left}px, ${targetRect.top}px, 0) scale(1) rotate(0deg)`;
    
    setTimeout(() => {
      ghost.remove();
      card.style.transition = 'none';
      card.style.opacity = '';
      card.offsetHeight; // force reflow
      card.style.transition = '';
    }, 300);
  }

  dragState = null;
}



async function saveOrder(grid) {
  const newCategoryId = Number(grid.dataset.categoryId);
  const cards = grid.querySelectorAll('.link-card[data-link-id]');
  const items = [];

  cards.forEach((c, index) => {
    items.push({
      id: Number(c.dataset.linkId),
      category_id: newCategoryId,
      sort_order: index + 1,
    });
    c.dataset.categoryId = newCategoryId;
  });

  try {
    await api.adminUpdateSort(items);
    allLinks = allLinks.map(l => {
      const updated = items.find(i => i.id === l.id);
      if (updated) return { ...l, category_id: updated.category_id, sort_order: updated.sort_order };
      return l;
    });
    allLinks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  } catch (err) {
    console.error('Sort update failed:', err);
    // Do NOT call loadData() here — that would snap the cards back to server
    // state, making the swap appear to have failed visually. The DOM already
    // reflects the new order; the user can refresh if a permanent reset is needed.
    alert('排序保存失败: ' + err.message);
  }
}

// ── Modal ──

function initModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideModal();
  });

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
  document.getElementById('modal-overlay').style.display = 'none';
}

function showLoginModal() {
  showModal('管理员登录', `
    <form id="modal-login-form" style="display:flex;flex-direction:column;gap:12px;">
      <input type="password" id="modal-password" placeholder="输入管理密码" required autofocus>
      <p id="modal-login-err" style="color:var(--color-danger);font-size:13px;display:none;"></p>
      <button type="submit" class="btn btn-primary" style="width:100%;">登录</button>
    </form>
  `);

  document.getElementById('modal-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('modal-password').value;
    const errEl = document.getElementById('modal-login-err');
    errEl.style.display = 'none';
    try {
      const { token } = await api.adminLogin(pw);
      localStorage.setItem('admin_token', token);
      hideModal();
      editMode = true;
      const btn = document.getElementById('edit-toggle');
      btn.textContent = '✅ 完成';
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-primary');
      renderCategories(allCategories, allLinks);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });
}

function showLinkModal(link = {}) {
  const isEdit = !!link.id;
  const catOptions = allCategories.map(c =>
    `<option value="${c.id}" ${c.id === (link.category_id || allCategories[0]?.id) ? 'selected' : ''}>${c.icon} ${c.name}</option>`
  ).join('');

  showModal(isEdit ? '编辑链接' : '添加链接', `
    <form id="modal-link-form" style="display:flex;flex-direction:column;gap:12px;">
      <input type="hidden" id="mlink-id" value="${link.id || ''}">
      <div>
        <label class="form-label">标题 *</label>
        <input type="text" id="mlink-title" value="${link.title || ''}" placeholder="网站名称" required>
      </div>
      <div>
        <label class="form-label">URL *</label>
        <input type="url" id="mlink-url" value="${link.url || ''}" placeholder="https://example.com" required>
      </div>
      <div>
        <label class="form-label">描述</label>
        <input type="text" id="mlink-desc" value="${link.description || ''}" placeholder="简短描述">
      </div>
      <div>
        <label class="form-label">分类 *</label>
        <select id="mlink-category">${catOptions}</select>
      </div>
      <div>
        <label class="form-label">图标 URL（留空自动获取）</label>
        <input type="url" id="mlink-favicon" value="${link.favicon_url || ''}" placeholder="自动获取">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modal-overlay').style.display='none'">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  `);

  document.getElementById('modal-link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('mlink-id').value;
    const data = {
      title: document.getElementById('mlink-title').value,
      url: document.getElementById('mlink-url').value,
      description: document.getElementById('mlink-desc').value,
      category_id: Number(document.getElementById('mlink-category').value),
      favicon_url: document.getElementById('mlink-favicon').value || undefined,
      sort_order: 0,
    };

    try {
      if (id) {
        data.id = Number(id);
        await api.adminUpdateLink(data);
      } else {
        await api.adminCreateLink(data);
      }
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
    <form id="modal-cat-form" style="display:flex;flex-direction:column;gap:12px;">
      <input type="hidden" id="mcat-id" value="${cat.id || ''}">
      <div>
        <label class="form-label">名称 *</label>
        <input type="text" id="mcat-name" value="${cat.name || ''}" placeholder="分类名称" required>
      </div>
      <div>
        <label class="form-label">图标（emoji）</label>
        <input type="text" id="mcat-icon" value="${cat.icon || ''}" placeholder="🌐">
      </div>
      <div>
        <label class="form-label">Slug *</label>
        <input type="text" id="mcat-slug" value="${cat.slug || ''}" placeholder="category-slug" required>
      </div>
      <div>
        <label class="form-label">排序</label>
        <input type="number" id="mcat-sort" value="${cat.sort_order ?? 0}" placeholder="0">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modal-overlay').style.display='none'">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  `);

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
        data.id = Number(id);
        await api.adminUpdateCategory(data);
      } else {
        await api.adminCreateCategory(data);
      }
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
    await api.adminDeleteLink(id);
    await loadData();
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`确定删除分类「${name}」？该分类下的链接也会被删除。`)) return;
  try {
    await api.adminDeleteCategory(id);
    await loadData();
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

// ── Search ──

function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        renderCategories(allCategories, allLinks);
        return;
      }
      const filtered = allLinks.filter(l =>
        l.title.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q))
      );
      renderCategories(allCategories, filtered);
    }, 200);
  });
}

// ── Back to top ──

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

// ── GitHub Tabs ──

let githubTabs = [];
let activeTabKey = null;

async function initGithubTabs() {
  try {
    const tabs = await api.getGithubTabs();
    githubTabs = tabs.filter(t => t.enabled);

    if (!githubTabs.length) {
      document.getElementById('github-section').style.display = 'none';
      return;
    }

    document.getElementById('github-section').style.display = '';
    renderTabButtons(githubTabs);
    activeTabKey = githubTabs[0].tab_key;
    renderTabContent(activeTabKey);
  } catch (e) {
    console.error('Failed to load GitHub tabs:', e);
  }
}

function renderTabButtons(tabs) {
  const container = document.getElementById('github-tab-buttons');
  container.innerHTML = tabs.map(t => {
    return `<button class="github-tab${t.tab_key === activeTabKey ? ' active' : ''}" data-tab="${t.tab_key}">${t.name}</button>`;
  }).join('');

  container.querySelectorAll('.github-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.github-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabContent(btn.dataset.tab);
    });
  });
}

async function renderTabContent(tabKey) {
  const container = document.getElementById('github-panels');
  const tab = githubTabs.find(t => t.tab_key === tabKey);
  if (!tab) return;

  container.innerHTML = '<div class="empty-state">加载中...</div>';

  try {
    const { items } = await api.getGithubTabData(tabKey);

    if (!items || !items.length) {
      container.innerHTML = '<div class="empty-state">暂无数据</div>';
      return;
    }

    container.innerHTML = `
      <div class="links-grid github-grid-20">
        ${items.map(r => {
          const fullName = r.name || r.repo || r.topic || '';
          const parts = fullName.split('/');
          const repoName = parts.length > 1 ? parts[1] : fullName;
          const owner = parts.length > 1 ? parts[0] : '';
          return `
          <a href="${r.url || r.repo_url || r.topic_url || '#'}" target="_blank" rel="noopener" class="github-card fade-in">
            <div class="github-repo">${repoName}</div>
            ${owner ? `<div class="github-owner">${owner}</div>` : ''}
            <div class="github-desc">${r.description || ''}</div>
            <div class="github-meta">
              <span>⭐ ${formatNumber(r.stars)}</span>
              ${r.language ? `<span>${r.language}</span>` : ''}
            </div>
          </a>`;
        }).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`;
  }
}

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

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

let leafletPromise = null;

function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  
  leafletPromise = new Promise((resolve, reject) => {
    if (window.L) {
      resolve();
      return;
    }
    
    // Inject CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet/dist/leaflet.css';
    document.head.appendChild(link);
    
    // Inject JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet/dist/leaflet.js';
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

// ── Memos / Notepad ──

let allMemos = [];

function initMemos() {
  const toggleBtn = document.getElementById('memo-toggle');
  const drawer = document.getElementById('memo-drawer');
  const closeBtn = document.getElementById('memo-drawer-close');
  const overlay = document.getElementById('drawer-overlay');
  const addBtn = document.getElementById('memo-add-btn');

  if (!toggleBtn || !drawer || !closeBtn || !overlay) return;

  toggleBtn.addEventListener('click', () => {
    drawer.classList.add('active');
    overlay.classList.add('active');
    loadMemos();
  });

  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
  });

  overlay.addEventListener('click', () => {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
  });

  addBtn.addEventListener('click', () => {
    showMemoModal();
  });
}

async function loadMemos() {
  const listEl = document.getElementById('memo-list');
  const adminActions = document.getElementById('memo-admin-actions');
  
  if (api.isLoggedIn()) {
    adminActions.style.display = 'block';
  } else {
    adminActions.style.display = 'none';
  }

  try {
    allMemos = await api.getMemos();
    renderMemos(allMemos);
  } catch (err) {
    listEl.innerHTML = `<div class="memo-empty" style="color: var(--color-danger);">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

function renderMemos(memos) {
  const listEl = document.getElementById('memo-list');
  if (!memos || memos.length === 0) {
    listEl.innerHTML = '<div class="memo-empty">暂无备忘录</div>';
    return;
  }

  const isAdmin = api.isLoggedIn();

  listEl.innerHTML = memos.map(memo => {
    const formattedContent = renderMarkdown(memo.content);
    const titleHtml = memo.title 
      ? escapeHtml(memo.title) 
      : '<span class="memo-card-title empty">(无标题)</span>';
    
    // Format date nicely (assuming UTC time suffix 'Z' for ISO-like sqlite strings or localizing correctly)
    let dateStr = '';
    if (memo.updated_at) {
      // sqlite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC. Append ' UTC' or 'Z' for parsing.
      const rawDateStr = memo.updated_at.includes('T') ? memo.updated_at : memo.updated_at.replace(' ', 'T') + 'Z';
      try {
        dateStr = new Date(rawDateStr).toLocaleString('zh-CN', { hour12: false });
      } catch (e) {
        dateStr = memo.updated_at;
      }
    }

    const badgeHtml = isAdmin 
      ? (memo.is_private 
          ? '<span class="memo-badge memo-badge-private">🔒 私有</span>' 
          : '<span class="memo-badge memo-badge-public">🌐 公开</span>')
      : '';

    const actionsHtml = isAdmin
      ? `<div class="memo-card-actions">
           <button class="btn btn-ghost btn-sm memo-edit-btn" data-id="${memo.id}" title="编辑">✏️</button>
           <button class="btn btn-ghost btn-sm memo-delete-btn" data-id="${memo.id}" title="删除">🗑️</button>
         </div>`
      : '';

    const dragHandleHtml = isAdmin
      ? '<div class="memo-drag-handle" title="按住拖拽排序">⋮⋮</div>'
      : '';

    return `
      <div class="memo-card fade-in" data-id="${memo.id}">
        <div class="memo-card-header">
          <div class="memo-card-title-container">
            <div class="memo-card-title">${titleHtml}</div>
            <div class="memo-card-meta">
              <span>${escapeHtml(dateStr)}</span>
              ${badgeHtml}
            </div>
          </div>
          ${actionsHtml}
        </div>
        <div class="memo-card-content">${formattedContent}</div>
        ${dragHandleHtml}
      </div>
    `;
  }).join('');

  // Bind click events on cards (for expand/collapse) and buttons
  listEl.querySelectorAll('.memo-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // If edit, delete, or drag handle is clicked, do not toggle expand
      if (e.target.closest('.memo-edit-btn') || e.target.closest('.memo-delete-btn') || e.target.closest('.memo-drag-handle') || e.target.tagName === 'A') {
        return;
      }
      card.classList.toggle('expanded');
    });
  });

  if (isAdmin) {
    listEl.querySelectorAll('.memo-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const memo = allMemos.find(m => m.id === id);
        if (memo) showMemoModal(memo);
      });
    });

    listEl.querySelectorAll('.memo-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        if (confirm('确定删除这条备忘录吗？')) {
          try {
            await api.adminDeleteMemo(id);
            loadMemos();
          } catch (err) {
            alert('删除失败: ' + err.message);
          }
        }
      });
    });

    // ── Memo Drag & Drop (same swap pattern as links) ──
    listEl.querySelectorAll('.memo-drag-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startMemoDrag(e, handle, listEl);
      });
    });
  }
}

let memoDragState = null;

function startMemoDrag(e, handle, listEl) {
  const card = handle.closest('.memo-card');
  if (!card) return;

  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.className = 'memo-card memo-drag-ghost';
  ghost.style.width = rect.width + 'px';
  ghost.style.left = (e.clientX - rect.width / 2) + 'px';
  ghost.style.top = (e.clientY - rect.height / 2) + 'px';
  document.body.appendChild(ghost);

  card.style.opacity = '0.3';

  memoDragState = { card, ghost, listEl, moved: false, swapTarget: null };

  document.addEventListener('mousemove', onMemoDragMove);
  document.addEventListener('mouseup', onMemoDragEnd);
}

function onMemoDragMove(e) {
  if (!memoDragState) return;
  e.preventDefault();
  memoDragState.moved = true;

  const { ghost } = memoDragState;
  ghost.style.left = (e.clientX - ghost.offsetWidth / 2) + 'px';
  ghost.style.top = (e.clientY - ghost.offsetHeight / 2) + 'px';

  let newTarget = null;
  const siblings = [...memoDragState.listEl.querySelectorAll('.memo-card[data-id]')]
    .filter(c => c !== memoDragState.card);

  for (const c of siblings) {
    const r = c.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom) {
      newTarget = c;
      break;
    }
  }

  if (memoDragState.swapTarget !== newTarget) {
    if (memoDragState.swapTarget) memoDragState.swapTarget.classList.remove('drop-target');
    if (newTarget) newTarget.classList.add('drop-target');
    memoDragState.swapTarget = newTarget;
  }
}

function onMemoDragEnd() {
  if (!memoDragState) return;

  const { card, ghost, listEl, swapTarget } = memoDragState;

  ghost.remove();
  card.style.opacity = '';
  if (swapTarget) swapTarget.classList.remove('drop-target');

  document.removeEventListener('mousemove', onMemoDragMove);
  document.removeEventListener('mouseup', onMemoDragEnd);

  if (memoDragState.moved && swapTarget) {
    const children = [...listEl.querySelectorAll('.memo-card[data-id]')];
    const cardIndex = children.indexOf(card);
    const targetIndex = children.indexOf(swapTarget);

    if (cardIndex < targetIndex) {
      listEl.insertBefore(card, swapTarget.nextSibling);
    } else {
      listEl.insertBefore(card, swapTarget);
    }

    saveMemoOrder(listEl);
  }

  memoDragState = null;
}

async function saveMemoOrder(listEl) {
  const cards = listEl.querySelectorAll('.memo-card[data-id]');
  const items = [];

  cards.forEach((c, index) => {
    items.push({
      id: Number(c.dataset.id),
      sort_order: index + 1,
    });
  });

  try {
    await api.adminUpdateMemoSort(items);
    allMemos = allMemos.map(m => {
      const updated = items.find(i => i.id === m.id);
      if (updated) return { ...m, sort_order: updated.sort_order };
      return m;
    });
    allMemos.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  } catch (err) {
    console.error('Memo sort update failed:', err);
    alert('排序保存失败: ' + err.message);
  }
}

function showMemoModal(memo = {}) {
  const isEdit = !!memo.id;
  showModal(isEdit ? '编辑备忘录' : '新建备忘录', `
    <form id="modal-memo-form" style="display:flex;flex-direction:column;gap:12px;">
      <input type="hidden" id="mmemo-id" value="${memo.id || ''}">
      <div>
        <label class="form-label">标题（可选）</label>
        <input type="text" id="mmemo-title" value="${escapeHtml(memo.title || '')}" placeholder="输入备忘标题">
      </div>
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
          <label class="form-label" style="margin-bottom:0;">内容 *</label>
          <div class="memo-editor-tabs">
            <button type="button" class="memo-tab active" data-tab="edit">编辑</button>
            <button type="button" class="memo-tab" data-tab="preview">预览</button>
          </div>
        </div>
        <textarea id="mmemo-content" placeholder="支持 Markdown 格式：**粗体**、*斜体*、\`代码\`、- 列表、[链接](url) 等..." required rows="8" style="width:100%; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg-soft); color: var(--color-text); font-family: inherit; font-size: 14px; resize: vertical;"></textarea>
        <div id="mmemo-preview" class="memo-preview-area" style="display:none;"></div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="mmemo-private" ${memo.is_private !== 0 ? 'checked' : ''} style="width:auto; cursor:pointer;">
        <label for="mmemo-private" style="font-size:13px; color:var(--color-ink); cursor:pointer; user-select:none;">仅管理员可见（私有）</label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modal-overlay').style.display='none'">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  `);

  const textarea = document.getElementById('mmemo-content');
  const previewEl = document.getElementById('mmemo-preview');
  textarea.value = memo.content || '';

  document.querySelectorAll('.memo-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.memo-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'preview') {
        previewEl.innerHTML = renderMarkdown(textarea.value);
        textarea.style.display = 'none';
        previewEl.style.display = 'block';
      } else {
        textarea.style.display = '';
        previewEl.style.display = 'none';
      }
    });
  });

  document.getElementById('modal-memo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('mmemo-id').value;
    const data = {
      title: document.getElementById('mmemo-title').value.trim(),
      content: textarea.value,
      is_private: document.getElementById('mmemo-private').checked ? 1 : 0
    };

    try {
      if (id) {
        data.id = Number(id);
        await api.adminUpdateMemo(data);
      } else {
        await api.adminCreateMemo(data);
      }
      hideModal();
      loadMemos();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  });
}

init();
