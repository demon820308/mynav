INSERT INTO categories (name, icon, slug, sort_order) VALUES
('前端开发', '🌐', 'frontend', 1),
('后端服务', '⚙️', 'backend', 2),
('开发工具', '🛠️', 'devtools', 3),
('设计资源', '🎨', 'design', 4),
('AI 工具', '🤖', 'ai', 5),
('常用网站', '⭐', 'common', 6);

INSERT INTO links (title, url, description, category_id, sort_order) VALUES
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
