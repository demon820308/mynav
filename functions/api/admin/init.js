const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT DEFAULT '',
  category_id INTEGER NOT NULL,
  favicon_url TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS github_trending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  description TEXT DEFAULT '',
  language TEXT DEFAULT '',
  stars INTEGER DEFAULT 0,
  weekly_stars INTEGER DEFAULT 0,
  fetched_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS github_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL DEFAULT '[]',
  fetched_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_links_category ON links(category_id);
CREATE INDEX IF NOT EXISTS idx_links_sort ON links(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);
CREATE TABLE IF NOT EXISTS github_tabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tab_key TEXT NOT NULL UNIQUE,
  search_query TEXT NOT NULL DEFAULT '',
  tab_type TEXT NOT NULL DEFAULT 'skill',
  sort_order INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS github_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  topic_url TEXT NOT NULL,
  top_repo TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  description TEXT DEFAULT '',
  language TEXT DEFAULT '',
  stars INTEGER DEFAULT 0,
  fetched_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT '',
  content TEXT NOT NULL,
  is_private INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`;

const SEED = `
INSERT OR IGNORE INTO categories (name, icon, slug, sort_order) VALUES
('前端开发', '🌐', 'frontend', 1),
('后端服务', '⚙️', 'backend', 2),
('开发工具', '🛠️', 'devtools', 3),
('设计资源', '🎨', 'design', 4),
('AI 工具', '🤖', 'ai', 5),
('常用网站', '⭐', 'common', 6);

INSERT OR IGNORE INTO links (title, url, description, category_id, sort_order) VALUES
('Vue.js', 'https://vuejs.org', '渐进式 JavaScript 框架', 1, 1),
('React', 'https://react.dev', '用于构建用户界面的 JavaScript 库', 1, 2),
('Astro', 'https://astro.build', '构建快速、内容驱动的网站', 1, 3),
('MDN Web Docs', 'https://developer.mozilla.org', 'Web 技术权威文档', 1, 4),
('Node.js', 'https://nodejs.org', 'JavaScript 运行时', 2, 1),
('Cloudflare', 'https://cloudflare.com', 'CDN 与安全服务', 2, 2),
('Supabase', 'https://supabase.com', '开源 Firebase 替代方案', 2, 3),
('GitHub', 'https://github.com', '代码托管平台', 3, 1),
('VS Code', 'https://code.visualstudio.com', '代码编辑器', 3, 2),
('Figma', 'https://figma.com', '协作设计工具', 4, 1),
('Dribbble', 'https://dribbble.com', '设计灵感社区', 4, 2),
('ChatGPT', 'https://chat.openai.com', 'AI 对话助手', 5, 1),
('Claude', 'https://claude.ai', 'AI 助手', 5, 2),
('Google', 'https://google.com', '搜索引擎', 6, 1),
('YouTube', 'https://youtube.com', '视频平台', 6, 2);
`;

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { password } = await request.json();
    if (password !== env.ADMIN_TOKEN) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
    for (const sql of statements) {
      await env.DB.prepare(sql).run();
    }

    const seedStatements = SEED.split(';').map(s => s.trim()).filter(Boolean);
    for (const sql of seedStatements) {
      await env.DB.prepare(sql).run();
    }

    return jsonResponse({ success: true, message: 'Database initialized with schema and seed data' });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
