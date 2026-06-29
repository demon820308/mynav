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

document.addEventListener('DOMContentLoaded', async () => {
  const apiInput = document.getElementById('api-base-input');
  const connStatus = document.getElementById('connection-status');
  const testBtn = document.getElementById('test-connection-btn');
  const saveBtn = document.getElementById('save-btn');
  
  const loginStatusText = document.getElementById('login-status-text');
  const logoutBtn = document.getElementById('logout-btn');
  const resetBtn = document.getElementById('reset-btn');

  const syncPasswordInput = document.getElementById('sync-password-input');
  const syncPullBtn = document.getElementById('sync-pull-btn');
  const syncPushBtn = document.getElementById('sync-push-btn');
  const syncStatus = document.getElementById('sync-status');

  // Load saved settings
  chrome.storage.local.get(['api_base', 'admin_token'], (result) => {
    apiInput.value = result.api_base || 'https://nav.ipanic.bond';
    updateLoginStatus(result.admin_token);
  });

  function updateLoginStatus(token) {
    if (token) {
      loginStatusText.textContent = '已登录为管理员';
      loginStatusText.style.color = '#10b981';
      logoutBtn.style.display = 'block';
    } else {
      loginStatusText.textContent = '未登录';
      loginStatusText.style.color = 'var(--color-muted)';
      logoutBtn.style.display = 'none';
    }
  }

  // Helper to obtain authorization token (authenticates if password provided)
  async function getAuthToken() {
    const pw = syncPasswordInput.value.trim();
    const apiBase = apiInput.value.trim().replace(/\/$/, '');

    if (pw) {
      try {
        const res = await fetch(`${apiBase}/api/admin/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw })
        });
        if (!res.ok) {
          throw new Error('密码错误或身份认证失败。');
        }
        const { token } = await res.json();
        await setStorage('admin_token', token);
        updateLoginStatus(token);
        syncPasswordInput.value = ''; // clear password input
        return token;
      } catch (err) {
        throw new Error('管理员认证失败: ' + err.message);
      }
    }

    const savedToken = await getStorage('admin_token', null);
    if (!savedToken) {
      throw new Error('请输入管理员密码。');
    }
    return savedToken;
  }

  // Test Connection
  testBtn.addEventListener('click', async () => {
    const rawUrl = apiInput.value.trim();
    if (!rawUrl) {
      showStatus('请输入基准地址', false);
      return;
    }
    const cleanUrl = rawUrl.replace(/\/$/, '');
    
    showStatus('正在测试连接...', null);
    testBtn.disabled = true;

    try {
      const res = await fetch(`${cleanUrl}/api/categories`);
      if (res.ok) {
        showStatus('连接成功！后端响应正常。', true);
      } else {
        showStatus(`连接失败 (HTTP ${res.status}): ${res.statusText}`, false);
      }
    } catch (err) {
      showStatus(`连接失败: ${err.message}`, false);
    } finally {
      testBtn.disabled = false;
    }
  });

  // Save Settings
  saveBtn.addEventListener('click', () => {
    let rawUrl = apiInput.value.trim();
    if (!rawUrl) {
      showStatus('请输入基准地址', false);
      return;
    }
    const cleanUrl = rawUrl.replace(/\/$/, '');
    
    chrome.storage.local.set({ api_base: cleanUrl }, () => {
      showStatus('设置已保存！', true);
      setTimeout(() => {
        connStatus.textContent = '';
      }, 3000);
    });
  });

  // Logout
  logoutBtn.addEventListener('click', () => {
    if (confirm('确定退出管理员登录状态吗？')) {
      chrome.storage.local.remove('admin_token', () => {
        updateLoginStatus(null);
        showStatus('已成功退出登录。', true);
      });
    }
  });

  // Reset
  resetBtn.addEventListener('click', () => {
    if (confirm('警告：此操作将清除所有本地设置、分类、链接及收藏数据！确定继续吗？')) {
      chrome.storage.local.clear(() => {
        apiInput.value = 'https://nav.ipanic.bond';
        updateLoginStatus(null);
        showStatus('本地设置已重置。', true);
      });
    }
  });

  // Pull Sync (Cloud -> Local)
  syncPullBtn.addEventListener('click', async () => {
    const apiBase = apiInput.value.trim().replace(/\/$/, '');
    showSyncStatus('正在从云端拉取数据...', null);
    syncPullBtn.disabled = true;

    try {
      const token = await getAuthToken();
      
      // Fetch categories
      const catRes = await fetch(`${apiBase}/api/categories`);
      if (!catRes.ok) throw new Error('拉取分类失败');
      const categories = await catRes.json();

      // Fetch links
      const linkRes = await fetch(`${apiBase}/api/links`);
      if (!linkRes.ok) throw new Error('拉取链接失败');
      const links = await linkRes.json();

      // Map category ID to slug for every link
      const slugMap = {};
      categories.forEach(c => {
        slugMap[c.id] = c.slug;
      });

      const mappedLinks = links.map(l => ({
        ...l,
        category_slug: slugMap[l.category_id] || ''
      }));

      // Store in storage
      await setStorage('local_categories', categories);
      await setStorage('local_links', mappedLinks);

      showSyncStatus(`拉取成功！已同步 ${categories.length} 个分类，${mappedLinks.length} 个链接。`, true);
    } catch (err) {
      showSyncStatus('拉取失败: ' + err.message, false);
    } finally {
      syncPullBtn.disabled = false;
    }
  });

  // Push Sync (Local -> Cloud)
  syncPushBtn.addEventListener('click', async () => {
    const apiBase = apiInput.value.trim().replace(/\/$/, '');
    
    // Read local data
    const localCategories = await getStorage('local_categories', null);
    const localLinks = await getStorage('local_links', null);

    if (!localCategories || !localLinks || localCategories.length === 0) {
      showSyncStatus('推送失败: 本地暂无分类数据，请先拉取云端数据或进行编辑。', false);
      return;
    }

    if (!confirm(`警告：此操作将使用本地数据（共 ${localCategories.length} 个分类，${localLinks.length} 个链接）完全覆盖云端数据库，确定继续吗？`)) {
      return;
    }

    showSyncStatus('正在同步到云端...', null);
    syncPushBtn.disabled = true;

    try {
      const token = await getAuthToken();

      // Send to sync endpoint
      const syncRes = await fetch(`${apiBase}/api/admin/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          categories: localCategories,
          links: localLinks
        })
      });

      if (!syncRes.ok) {
        const errJson = await syncRes.json().catch(() => ({ error: syncRes.statusText }));
        throw new Error(errJson.error || '推送失败');
      }

      showSyncStatus('同步成功！正在重新载入获取服务器分配的 ID...', null);
      
      // Auto-pull to replace temporary IDs with generated D1 IDs
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

      showSyncStatus('全部同步并刷新完成！本地和云端已 100% 同步。', true);
    } catch (err) {
      showSyncStatus('同步到云端失败: ' + err.message, false);
    } finally {
      syncPushBtn.disabled = false;
    }
  });

  function showStatus(msg, success) {
    connStatus.textContent = msg;
    connStatus.className = 'status-msg';
    if (success === true) {
      connStatus.classList.add('status-success');
    } else if (success === false) {
      connStatus.classList.add('status-error');
    } else {
      connStatus.style.color = 'var(--color-muted)';
    }
  }

  function showSyncStatus(msg, success) {
    syncStatus.textContent = msg;
    syncStatus.className = 'status-msg';
    if (success === true) {
      syncStatus.classList.add('status-success');
    } else if (success === false) {
      syncStatus.classList.add('status-error');
    } else {
      syncStatus.style.color = 'var(--color-muted)';
    }
  }
});
