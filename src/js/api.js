const API_BASE = '/api';

async function request(path, options = {}) {
  const { headers: extra, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function authHeaders() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  getCategories: () => request('/categories'),
  getLinks: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.q) qs.set('q', params.q);
    const query = qs.toString();
    return request(`/links${query ? `?${query}` : ''}`);
  },
  getGithubTrending: () => request('/github-trending'),
  getGithubSkills: () => request('/github-skills'),

  adminLogin: (password) => request('/admin/auth', {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),

  isLoggedIn: () => !!localStorage.getItem('admin_token'),

  adminGetLinks: () => request('/admin/links', { headers: authHeaders() }),
  adminCreateLink: (data) => request('/admin/links', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminUpdateLink: (data) => request('/admin/links', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminDeleteLink: (id) => request(`/admin/links?id=${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }),
  adminUpdateSort: (items) => request('/admin/links', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ action: 'sort', items }),
  }),

  adminCreateCategory: (data) => request('/admin/categories', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminUpdateCategory: (data) => request('/admin/categories', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminDeleteCategory: (id) => request(`/admin/categories?id=${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }),

  getGithubTopics: () => request('/github-topics'),
  adminCreateTopic: (data) => request('/github-topics', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminDeleteTopic: (id) => request(`/github-topics?id=${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }),

  getGithubTabs: () => request('/admin/github-tabs', { headers: authHeaders() }),
  adminCreateTab: (data) => request('/admin/github-tabs', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminUpdateTab: (data) => request('/admin/github-tabs', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminDeleteTab: (id) => request(`/admin/github-tabs?id=${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }),
  getGithubTabData: (tabKey) => request(`/github-tab?tab=${tabKey}`),
  getIpInfo: (ip) => request(`/ip-check${ip ? `?ip=${ip}` : ''}`),

  getMemos: () => request('/memos', { headers: authHeaders() }),
  adminCreateMemo: (data) => request('/admin/memos', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminUpdateMemo: (data) => request('/admin/memos', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  }),
  adminDeleteMemo: (id) => request(`/admin/memos?id=${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }),
  adminUpdateMemoSort: (items) => request('/admin/memos', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ action: 'sort', items }),
  }),
};
