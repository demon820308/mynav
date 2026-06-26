import '../css/variables.css';
import '../css/base.css';
import '../css/components.css';

import { api } from './api.js';
import { initTheme } from './theme.js';
import { escapeHtml } from './utils.js';

let categories = [];
let githubTabs = [];

function init() {
  initTheme();

  if (localStorage.getItem('admin_token')) {
    showAdmin();
  }

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('btn-add-link').addEventListener('click', () => showLinkForm());
  document.getElementById('btn-add-category').addEventListener('click', () => showCategoryForm());
  document.getElementById('link-cancel').addEventListener('click', hideLinkForm);
  document.getElementById('cat-cancel').addEventListener('click', hideCategoryForm);
  document.getElementById('link-form').addEventListener('submit', handleSaveLink);
  document.getElementById('category-form').addEventListener('submit', handleSaveCategory);
  document.getElementById('link-url').addEventListener('blur', previewFavicon);

  // Event delegation for dynamically rendered table rows — replaces the
  // former window.__editLink / window.__deleteLink global functions.
  document.getElementById('admin-content').addEventListener('click', handleTableAction);
}

async function handleLogin(e) {
  e.preventDefault();
  const pw = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  try {
    const { token } = await api.adminLogin(pw);
    localStorage.setItem('admin_token', token);
    showAdmin();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

function handleLogout() {
  localStorage.removeItem('admin_token');
  document.getElementById('login-section').style.display = '';
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
}

async function showAdmin() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('admin-section').style.display = '';
  document.getElementById('logout-btn').style.display = '';
  await loadData();
}

async function loadData() {
  try {
    const [cats, links, tabs] = await Promise.all([
      api.getCategories(),
      api.adminGetLinks(),
      api.getGithubTabs(),
    ]);
    categories = cats;
    githubTabs = tabs;
    renderCategoryOptions(cats);
    renderTable(links, cats);
    renderTopics(tabs);
  } catch (e) {
    document.getElementById('admin-content').innerHTML =
      `<div class="empty-state">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function renderCategoryOptions(cats) {
  const select = document.getElementById('link-category');
  select.innerHTML = cats
    .map(c => `<option value="${c.id}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`)
    .join('');
}

function renderTable(links, cats) {
  const container = document.getElementById('admin-content');

  if (!links.length) {
    container.innerHTML = '<div class="empty-state">暂无链接</div>';
    return;
  }

  // Group links by category name
  const grouped = {};
  for (const link of links) {
    const catName = link.category_name || '未分类';
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(link);
  }

  let html = '';

  // ── Links section ──
  for (const [catName, catLinks] of Object.entries(grouped)) {
    html += `<h3 style="margin: 20px 0 12px; font-size: 15px; color: var(--color-muted);">${escapeHtml(catName)}</h3>`;
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    for (const link of catLinks) {
      html += `
        <div class="link-card" style="cursor: default;">
          <img class="link-favicon" src="${escapeHtml(link.favicon_url)}" alt="" onerror="this.style.display='none'">
          <div class="link-info">
            <div class="link-title">${escapeHtml(link.title)}</div>
            <div class="link-desc">${escapeHtml(link.url)}</div>
          </div>
          <button class="btn btn-ghost btn-sm"
                  data-action="edit-link" data-id="${link.id}">编辑</button>
          <button class="btn btn-danger btn-sm"
                  data-action="delete-link" data-id="${link.id}" data-title="${escapeHtml(link.title)}">删除</button>
        </div>
      `;
    }
    html += '</div>';
  }

  // ── Categories section ──
  html += `<h3 style="margin: 32px 0 12px; font-size: 15px; color: var(--color-muted);">分类管理</h3>`;
  html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
  for (const cat of cats) {
    html += `
      <div class="link-card" style="cursor: default;">
        <span style="font-size: 24px;">${escapeHtml(cat.icon) || '📁'}</span>
        <div class="link-info">
          <div class="link-title">${escapeHtml(cat.name)}</div>
          <div class="link-desc">${escapeHtml(cat.slug)} · 排序: ${cat.sort_order}</div>
        </div>
        <button class="btn btn-ghost btn-sm"
                data-action="edit-category" data-id="${cat.id}">编辑</button>
        <button class="btn btn-danger btn-sm"
                data-action="delete-category" data-id="${cat.id}" data-name="${escapeHtml(cat.name)}">删除</button>
      </div>
    `;
  }
  html += '</div>';

  // Single assignment — no redundant intermediate write
  container.innerHTML = html;
}

// ── Table event delegation ──

function handleTableAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, title, name } = btn.dataset;

  switch (action) {
    case 'edit-link':      editLink(Number(id)); break;
    case 'delete-link':    deleteLink(Number(id), title); break;
    case 'edit-category':  editCategory(Number(id)); break;
    case 'delete-category': deleteCategory(Number(id), name); break;
  }
}

// ── Forms ──

function showLinkForm(link = null) {
  const panel = document.getElementById('link-form-panel');
  panel.style.display = '';
  document.getElementById('link-form-title').textContent = link ? '编辑链接' : '添加链接';
  document.getElementById('link-id').value = link?.id || '';
  document.getElementById('link-title').value = link?.title || '';
  document.getElementById('link-url').value = link?.url || '';
  document.getElementById('link-desc').value = link?.description || '';
  document.getElementById('link-category').value = link?.category_id || categories[0]?.id || '';
  document.getElementById('link-favicon').value = link?.favicon_url || '';
  document.getElementById('link-sort').value = link?.sort_order ?? 0;
  panel.scrollIntoView({ behavior: 'smooth' });
}

function hideLinkForm() {
  document.getElementById('link-form-panel').style.display = 'none';
  document.getElementById('link-form').reset();
}

function showCategoryForm(cat = null) {
  const panel = document.getElementById('category-form-panel');
  panel.style.display = '';
  document.getElementById('category-form-title').textContent = cat ? '编辑分类' : '添加分类';
  document.getElementById('cat-id').value = cat?.id || '';
  document.getElementById('cat-name').value = cat?.name || '';
  document.getElementById('cat-icon').value = cat?.icon || '';
  document.getElementById('cat-slug').value = cat?.slug || '';
  document.getElementById('cat-sort').value = cat?.sort_order ?? 0;
  panel.scrollIntoView({ behavior: 'smooth' });
}

function hideCategoryForm() {
  document.getElementById('category-form-panel').style.display = 'none';
  document.getElementById('category-form').reset();
}

async function handleSaveLink(e) {
  e.preventDefault();
  const id = document.getElementById('link-id').value;
  const data = {
    title: document.getElementById('link-title').value,
    url: document.getElementById('link-url').value,
    description: document.getElementById('link-desc').value,
    category_id: Number(document.getElementById('link-category').value),
    favicon_url: document.getElementById('link-favicon').value || undefined,
    sort_order: Number(document.getElementById('link-sort').value) || 0,
  };

  try {
    if (id) {
      data.id = Number(id);
      await api.adminUpdateLink(data);
    } else {
      await api.adminCreateLink(data);
    }
    hideLinkForm();
    await loadData();
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

async function handleSaveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('cat-id').value;
  const data = {
    name: document.getElementById('cat-name').value,
    icon: document.getElementById('cat-icon').value,
    slug: document.getElementById('cat-slug').value,
    sort_order: Number(document.getElementById('cat-sort').value) || 0,
  };

  try {
    if (id) {
      data.id = Number(id);
      await api.adminUpdateCategory(data);
    } else {
      await api.adminCreateCategory(data);
    }
    hideCategoryForm();
    await loadData();
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

function previewFavicon() {
  const url = document.getElementById('link-url').value;
  const faviconInput = document.getElementById('link-favicon');
  if (url && !faviconInput.value) {
    try {
      const domain = new URL(url).hostname;
      faviconInput.placeholder = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {}
  }
}

// ── CRUD actions (called from handleTableAction) ──

async function editLink(id) {
  const links = await api.adminGetLinks();
  const link = links.find(l => l.id === id);
  if (link) showLinkForm(link);
}

async function deleteLink(id, title) {
  if (!confirm(`确定删除链接「${title}」？`)) return;
  try {
    await api.adminDeleteLink(id);
    await loadData();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

function editCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (cat) showCategoryForm(cat);
}

async function deleteCategory(id, name) {
  if (!confirm(`确定删除分类「${name}」？该分类下的链接也会被删除。`)) return;
  try {
    await api.adminDeleteCategory(id);
    await loadData();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

// ── GitHub Tabs ──

const TYPE_LABELS = {
  all: '总榜', week_active: '周最火', month_active: '月最火',
  week_new: '周新增', month_new: '月新增',
  week_born: '周新星', month_born: '月新星', skill: '话题',
};
function typeLabel(t) { return TYPE_LABELS[t] || t; }

function renderTopics(tabs) {
  const panel = document.getElementById('topics-panel');
  if (!panel) return;

  const listHtml = tabs.length
    ? `<div style="display:flex;flex-direction:column;gap:8px;">${tabs.map(t => `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--color-bg-soft);border:1px solid var(--color-border);border-radius:var(--radius-sm);">
          <span style="font-size:12px;padding:2px 8px;background:${t.tab_type === 'skill' ? 'var(--color-secondary)' : 'var(--color-primary)'};color:white;border-radius:var(--radius-pill);">${typeLabel(t.tab_type)}</span>
          <span style="font-weight:600;font-size:14px;">${escapeHtml(t.name)}</span>
          <span style="font-size:12px;color:var(--color-muted);font-family:var(--font-mono);">${escapeHtml(t.search_query)}</span>
          <span style="font-size:12px;color:${t.enabled ? 'var(--color-success)' : 'var(--color-muted)'};">${t.enabled ? '启用' : '禁用'}</span>
          <div style="margin-left:auto;display:flex;gap:4px;">
            <button class="btn btn-ghost btn-sm" onclick="editTab(${t.id})">编辑</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleTab(${t.id},${t.enabled})">${t.enabled ? '禁用' : '启用'}</button>
            <button class="btn btn-danger btn-sm" onclick="deleteTab(${t.id})">删除</button>
          </div>
        </div>`).join('')}</div>`
    : '<p style="color:var(--color-muted);font-size:13px;">暂无配置，从下方模板选择或手动添加</p>';

  panel.innerHTML = `
    <h3 style="margin-bottom:12px;font-size:15px;">GitHub 内容管理</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-bottom:12px;">
      <input type="text" id="tab-name" placeholder="名称">
      <input type="text" id="tab-kw1" placeholder="关键词1（如 image）">
      <input type="text" id="tab-kw2" placeholder="关键词2（选填，如 skills）">
      <select id="tab-type" style="width:auto;">
        <option value="all">全网总榜</option>
        <option value="week_active">本周最火</option>
        <option value="month_active">本月最火</option>
        <option value="week_new">本周新增最多</option>
        <option value="month_new">本月新增最多</option>
        <option value="week_born">本周新星</option>
        <option value="month_born">本月新星</option>
        <option value="skill">按话题</option>
      </select>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="btn btn-primary" onclick="addTab()">+ 添加</button>
    </div>
    ${listHtml}
  `;
}

window.addTab = async function() {
  const name = document.getElementById('tab-name').value.trim();
  const kw1 = document.getElementById('tab-kw1').value.trim();
  const kw2 = document.getElementById('tab-kw2').value.trim();
  const type = document.getElementById('tab-type').value;
  if (!name) { alert('请输入名称'); return; }
  const query = [kw1, kw2].filter(Boolean).join(' ');
  try {
    await api.adminCreateTab({ name, search_query: query, tab_type: type });
    await loadData();
  } catch (e) {
    alert('添加失败: ' + e.message);
  }
};

function showModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'flex';
  overlay.onclick = (e) => { if (e.target === overlay) hideModal(); };
}

function hideModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

window.editTab = async function(id) {
  const tabs = await api.getGithubTabs();
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  const existingKw = (tab.search_query || '').split(' ');
  showModal('编辑内容', `
    <form id="edit-tab-form" style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="font-size:13px;color:var(--color-muted);margin-bottom:4px;display:block;">名称</label>
        <input type="text" id="edit-tab-name" value="${escapeHtml(tab.name)}" required>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <label style="font-size:13px;color:var(--color-muted);margin-bottom:4px;display:block;">关键词1</label>
          <input type="text" id="edit-tab-kw1" value="${escapeHtml(existingKw[0] || '')}" placeholder="如 image">
        </div>
        <div>
          <label style="font-size:13px;color:var(--color-muted);margin-bottom:4px;display:block;">关键词2（选填）</label>
          <input type="text" id="edit-tab-kw2" value="${escapeHtml(existingKw[1] || '')}" placeholder="如 skills">
        </div>
      </div>
      <div>
        <label style="font-size:13px;color:var(--color-muted);margin-bottom:4px;display:block;">维度</label>
        <select id="edit-tab-type">
          <option value="all" ${tab.tab_type === 'all' ? 'selected' : ''}>全网总榜</option>
          <option value="week_active" ${tab.tab_type === 'week_active' ? 'selected' : ''}>本周最火</option>
          <option value="month_active" ${tab.tab_type === 'month_active' ? 'selected' : ''}>本月最火</option>
          <option value="week_new" ${tab.tab_type === 'week_new' ? 'selected' : ''}>本周新增最多</option>
          <option value="month_new" ${tab.tab_type === 'month_new' ? 'selected' : ''}>本月新增最多</option>
          <option value="week_born" ${tab.tab_type === 'week_born' ? 'selected' : ''}>本周新星</option>
          <option value="month_born" ${tab.tab_type === 'month_born' ? 'selected' : ''}>本月新星</option>
          <option value="skill" ${tab.tab_type === 'skill' ? 'selected' : ''}>按话题</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-ghost" onclick="hideModal()">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  `);

  document.getElementById('edit-tab-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const ek1 = document.getElementById('edit-tab-kw1').value.trim();
      const ek2 = document.getElementById('edit-tab-kw2').value.trim();
      await api.adminUpdateTab({
        id,
        name: document.getElementById('edit-tab-name').value,
        search_query: [ek1, ek2].filter(Boolean).join(' '),
        tab_type: document.getElementById('edit-tab-type').value,
      });
      hideModal();
      await loadData();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  });
};

window.toggleTab = async function(id, current) {
  try {
    await api.adminUpdateTab({ id, enabled: current ? 0 : 1 });
    await loadData();
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
};

window.deleteTab = async function(id) {
  const tab = githubTabs.find(t => t.id === id);
  const name = tab ? tab.name : '';
  if (!confirm(`确定删除「${name}」？`)) return;
  try {
    await api.adminDeleteTab(id);
    await loadData();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
};

init();
