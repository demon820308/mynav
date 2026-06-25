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
