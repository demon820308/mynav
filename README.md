# 🧭 dEmOn 个人导航与 Speed Dial 浏览器扩展

这是一个基于 **Cloudflare Pages + D1 数据库** 构建的个人静态导航网站，同时配备了深度集成的 **Chrome/Edge 浏览器新标签页扩展（dEmOn Speed Dial）**。

整个系统完全采用原生三件套（HTML5 / Vanilla CSS / Vanilla JS）开发，无重量级框架依赖，极致轻量、响应迅速，且拥有极其现代的视觉设计与丰富的动效。

---

## 🌟 核心功能特性

### 1. 双端联动与数据同步
*   **Web 导航主页**：支持主题切换（明暗模式）、备忘录面板、天气预报、IP地址详情、GitHub 趋势/技术榜单以及管理员后台。
*   **浏览器扩展 (Speed Dial)**：完美接管浏览器新标签页。支持拉取云端后台分类与链接、本地个性化星标收藏、关键字实时过滤及完全离线的安全沙箱环境（符合 Chrome MV3 标准）。
*   **全量配置同步**：支持在扩展端或网页后台对所有分类、链接数据进行一键覆盖与双向同步 (`/api/admin/sync`)。

### 2. 强大的后台管理与可视化排序
*   **安全认证**：采用基于 `HMAC-SHA-256` 派生的 Session Token 机制，不直接传输或保存管理员密码，支持防暴力破解与时间常数对比 (`timingSafeEqual`) 抵御旁路时间攻击。
*   **直观的管理入口**：在网页主页或扩展中，点击 **"✏️ 编辑"** 输入密码登录后，即可在主页上直接进行 **分类/链接的添加、修改、删除**，无需进入专门的表单页面。
*   **精细化拖动排序**：处于编辑模式下时，链接和备忘录卡片会出现拖拽手柄（⋮⋮），支持通过鼠标拖动快速调整显示顺序。拖拽释放后，系统通过 D1 数据库的批量更新指令 (`db.batch`) 以最高性能同步更新排序字段 (`sort_order`)。

### 3. 多元化组件与微服务 API
*   **GitHub 趋势与技术卡片**：
    *   集成 GitHub 官方 API 搜索热门仓库。
    *   通过 Cloudflare Workers 的 `HTMLRewriter` 高效抓取并解析 `https://github.com/trending` 趋势榜（无 API 速率限制）。
    *   在 D1 数据库中缓存表 (`github_cache`)，根据 Tab 类型设置不同 TTL（6小时至7天），极大缩减了二次请求延迟。
*   **IP 与地理位置卡片**：
    *   使用 `cf-connecting-ip` 识别真实访问 IP，若在本地局域网调试，则通过 `ipify` 提取公网 IP。
    *   利用 `ip-api.com` 获取详细的运营商 (ISP)、自治系统 (ASN)、地理经纬度等，并根据 `cf-threat-score` 及托管代理检测进行风险等级评估（Clean / Suspicious / Danger）。
*   **智能天气小部件**：
    *   默认结合 IP 地理坐标，自动调用 `open-meteo.com` 免费 API 抓取当地实时天气及未来 8 天的详细气象预测。
    *   集成搜索功能，可通过中文城市名利用 Geocoding 服务自动转换经纬度进行天气切换。
*   **Markdown 备忘录 (Memo)**：
    *   右侧抽屉式备忘录，集成 `marked` 库，支持完整的 Markdown 格式渲染。
    *   支持**公开/私有**属性。普通用户仅能查看公开备忘，管理员登录后可查看并编辑全部备忘录。

---

## 📂 项目目录结构

```text
/
├── .dev.vars                  # 本地开发环境变量（包含 ADMIN_TOKEN 密码）
├── wrangler.toml              # Cloudflare Pages 配置文件，绑定 D1 数据库
├── schema.sql                 # D1 数据库表结构定义文件
├── seed.sql                   # 导航初始预设数据
├── migrate-memo-sort.sql      # 备忘录排序字段迁移脚本
├── package.json               # 项目配置文件及构建脚本
├── vite.config.js             # Vite 配置文件（配置 src/ 为根目录并构建双入口）
├── scripts/
│   └── dev.js                 # 本地开发服务器启动包装脚本（自动监听端口并运行初始化）
├── functions/                 # Cloudflare Pages Functions 后端 API (serverless)
│   └── api/
│       ├── _shared.js         # 共享的 HMAC 安全认证工具类
│       ├── ip-check.js        # IP 及运营商、风险属性解析
│       ├── weather.js         # 实时及未来八天天气查询
│       ├── weather-geocode.js # 城市中文名转经纬度 API
│       ├── categories.js      # 公共分类查询
│       ├── links.js           # 公共链接查询
│       ├── memos.js           # 公共/私有备忘录查询（区分管理员权限）
│       ├── github-tab.js      # GitHub 各种分类（Trending/Active/Born）数据拉取与缓存
│       └── admin/             # 管理员专有 API (全接口鉴权验证)
│           ├── init.js        # 后台数据库一键构建/重置接口
│           ├── sync.js        # 导航配置全量同步接口
│           ├── categories.js  # 分类 CRUD
│           ├── links.js       # 链接 CRUD
│           ├── memos.js       # 备忘录 CRUD
│           └── github-tabs.js # 动态 GitHub 导航栏 Tab CRUD
├── src/                       # 前端网页源文件
│   ├── index.html             # 导航网站首页
│   ├── admin.html             # 导航管理后台
│   ├── css/                   # 样式设计系统
│   │   ├── variables.css      # CSS 变量定义（颜色、圆角、阴影、动画）
│   │   ├── base.css           # 基础全局样式与重置
│   │   └── components.css     # 精美卡片、抽屉、弹窗及骨架屏组件样式
│   ├── js/                    # 前端业务逻辑
│   │   ├── theme.js           # 切换深浅主题配色
│   │   ├── api.js             # 通用封装 Fetch 请求（自动附加鉴权 Header）
│   │   ├── utils.js           # 防抖、状态通知提示等常用函数
│   │   ├── weather.js         # 天气交互、搜索与图表渲染
│   │   ├── favorites.js       # 本地星标快速拨号存储控制
│   │   ├── app.js             # 主导航核心业务逻辑（拖拽、按类渲染、备忘）
│   │   └── admin.js           # 前台数据表格管理后台逻辑
│   └── public/                # 静态托管资源
│       ├── favicon.png        # 网站图标
│       └── extension.zip      # 离线 Chrome 扩展包（方便用户在主页直链下载）
└── extension/                 # Chrome / Edge 扩展插件源码
    ├── manifest.json          # 扩展清单文件 (MV3)
    ├── newtab.html            # 新标签页入口
    ├── newtab.css             # 新标签页专属样式
    ├── newtab.js              # 核心同步逻辑、星标收藏、搜索过滤及管理操作
    ├── options.html           # 扩展选项页 (配置自定义 API 域名)
    ├── options.js             # 选项保存与后端联通性测试
    └── images/                # 扩展图标包
```

---

## 🛠️ 数据库设计说明

整个系统依赖于 Cloudflare D1 关系型数据库。表结构详情参考：[schema.sql](file:///e:/Nav/schema.sql)。

### 主要数据表定义

1.  **分类表 (`categories`)**
    *   `id`: 整数自增，分类唯一标识。
    *   `name`: 文本，分类显示名称（如：前端开发）。
    *   `icon`: 文本，分类图标（推荐使用 Emoji 🌐）。
    *   `slug`: 文本，唯一且不重复的 URL 别名。
    *   `sort_order`: 整数，排序权重，越小越靠前。

2.  **链接表 (`links`)**
    *   `id`: 整数自增，链接唯一主键。
    *   `title`: 文本，网站名称。
    *   `url`: 文本，网站链接地址。
    *   `description`: 文本，短说明。
    *   `category_id`: 外键，关联 `categories.id`，级联删除。
    *   `favicon_url`: 文本，自定义图标链接，留空时系统通过 `www.faviconextractor.com` 智能拉取。
    *   `sort_order`: 整数，分类内排序。

3.  **备忘录表 (`memos`)**
    *   `id`: 整数自增。
    *   `title`: 文本，备忘短标题。
    *   `content`: 文本，Markdown 格式内容。
    *   `is_private`: 整数（`1` 为私有备忘需登录，`0` 为公开所有人可见）。
    *   `sort_order`: 整数，拖拽排序位置。

4.  **GitHub 动态标签配置表 (`github_tabs`)**
    *   支持在管理后台动态修改前端 GitHub 区域显示的标签：
    *   `tab_key`: 唯一标识（例如 `week-trending-js`）。
    *   `tab_type`: 动作类型，包括 `skill`（技能分类）、`week_new`/`month_new`（周/月 Trending）、`week_active`/`week_born`（活跃/新生项目等）。
    *   `search_query`: 搜索关键词或编程语言类型（如 `javascript`）。

5.  **GitHub 爬虫缓存表 (`github_cache`)**
    *   `cache_key`: 标识（格式为 `tab_[id]`）。
    *   `data`: 存储 JSON 字符串形式的仓库列表。
    *   `fetched_at`: 时间戳，用于计算 TTL 缓存是否过期。

---

## 💻 本地开发调试指南

### 1. 准备工作
确保本地已安装 [Node.js](https://nodejs.org/)（推荐 v18 及以上版本）。

### 2. 安装项目依赖
克隆项目到本地后，在根目录下执行：
```bash
npm install
```

### 3. 配置本地环境变量
在项目根目录下创建一个名为 `.dev.vars` 的文件，填入您的本地管理密码：
```ini
ADMIN_TOKEN=your-secure-local-password
```
*(注意：此密码即为本地运行环境时的后台登录密码)*

### 4. 数据库初始化（本地）
本地 Wrangler 运行环境会自动在本地 `.wrangler` 目录创建 SQLite 实例。执行以下命令以注入表结构和种子数据：
```bash
# 初始化本地数据库结构
npm run db:init:local

# 导入默认分类与链接数据
npm run db:seed:local
```

### 5. 启动本地开发服务
运行以下命令：
```bash
npm run dev
```
此命令会执行以下工作流：
1.  调用 Vite 构建并打包前端资源至 `dist`。
2.  同时拉起本地 Wrangler API 模拟器（监听端口 `8788`，搭载 D1 数据库）和 Vite 开发服务器（监听端口 `5173`）。
3.  自动向本地 API 发起 `/api/admin/init` 握手，确保本地开发表结构时刻保持最新。

**访问链接**：
*   **前端展示页面**：[http://localhost:5173](http://localhost:5173)
*   **本地 API 服务**：[http://localhost:8788](http://localhost:8788)

---

## 🚀 线上部署指南 (Cloudflare Pages)

本项目专为 **Cloudflare Pages** 平台设计，以下为完整的零成本上线流程：

### 1. 在 Cloudflare 上创建 D1 数据库
登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，在左侧导航栏点击 **"存储和数据库" -> "D1"**，点击 **"创建" -> "创建数据库"**，命名为 `nav-db`。
或者使用 Wrangler CLI 直接在终端创建：
```bash
npx wrangler d1 create nav-db
```
创建完成后，终端会输出类似如下的 D1 配置片段：
```toml
[[d1_databases]]
binding = "DB"
database_name = "nav-db"
database_id = "your-database-uuid"
```
将上述片段（特别是 `database_id`）复制到您本地项目的 `wrangler.toml` 文件中，覆盖原有的配置。

### 2. 初始化生产数据库
将数据库表结构和种子数据导入到 Cloudflare 云端 D1 数据库中：
```bash
# 执行生产数据库表结构导入
npx wrangler d1 execute nav-db --remote --file=schema.sql

# 执行种子数据灌入（可选）
npx wrangler d1 execute nav-db --remote --file=seed.sql
```

### 3. 配置 Cloudflare Pages 环境变量
在 Cloudflare 仪表盘中：
1.  选择您的 Pages 项目（若未创建，可在 **"无服务器函数和托管" -> "Pages"** 中选择连接 GitHub 仓库或直接上传 `dist` 文件夹新建项目）。
2.  进入项目的 **"设置" (Settings) -> "环境变量" (Environment Variables)**。
3.  在 **"生产环境" (Production)** 和 **"预览环境" (Preview)** 中添加以下变量：
    *   **变量名**：`ADMIN_TOKEN`
    *   **值**：`您的强管理密码` *(该密码用于登录管理后台、更新配置和导入数据)*
    *   *(可选)* **变量名**：`GITHUB_TOKEN`
    *   **值**：`您的 GitHub Personal Access Token` *(用以提高 API 请求频次，防范被限流)*
4.  保存并重新部署。

### 4. 绑定 D1 数据库至 Pages
在 Cloudflare Pages 项目的 **"设置" (Settings) -> "函数" (Functions)** 页面：
1.  找到 **"D1 数据库绑定" (D1 database bindings)** 部分。
2.  点击 **"添加绑定" (Add binding)**。
3.  **变量名称**填入 `DB`（必须为大写，且与代码对应）。
4.  **D1 数据库**下拉列表中选择刚刚创建 of `nav-db`。
5.  保存设置。

### 5. 编译并部署项目
配置完成后，在本地运行一键部署指令：
```bash
npm run deploy
```
Vite 会自动构建生产包，Wrangler CLI 会打包 `dist` 目录及 `functions/` 中的 Serverless Functions 并安全推送到 Cloudflare 边缘网络。部署完成后，Wrangler 会返回您的专属域名（例如 `https://nav.pages.dev`）。

---

## 🧩 Chrome / Edge 扩展配置与使用

`dEmOn Speed Dial` 是本项目极为关键的组成部分，它将您的浏览器默认标签页转化为绝美的数据面板。

### 1. 离线安装扩展
1.  运行 `npm run build`，确保最新资源在 `dist` 生效。
2.  由于项目已将扩展源码归集在 `/extension` 目录下，您可以直接将此文件夹用作开发包。
3.  打开 Chrome 或 Edge 浏览器，进入扩展管理页面 `chrome://extensions/`。
4.  开启页面右上角的 **"开发者模式"**。
5.  点击左上角的 **"加载已解压的扩展程序" (Load unpacked)**。
6.  在弹出的文件夹选择框中，选中本项目根目录下的 [extension](file:///e:/Nav/extension) 文件夹。
7.  安装完成后，新建标签页，扩展即可生效。
8.  *(可选)* 为方便其他终端或用户直接安装，您可以将此目录打包为 `extension.zip` 并放入 `src/public/` 中。用户只需在您的导航主页底部点击链接即可获取。

### 2. 配置 API 域名
首次打开新标签页时，系统可能处于空数据状态：
1.  点击页面右上角的 **"⚙️ 设置"**。
2.  在 **API Host** 文本框中，输入您的 Cloudflare 后端生产域名（例如 `https://your-app.pages.dev`），或本地调试时的 `http://localhost:8788`。
3.  点击 **"测试连接"**。若连接正常，系统将弹出成功提示。
4.  点击 **"保存"**，页面将自动拉取云端数据库的分类和链接，并在新标签页精美呈现。

---

## 📖 日常使用与高级操作指南

### 1. 管理员登录与前台编辑
*   **进入编辑**：无论是在 Web 主页还是在浏览器新标签页中，点击右上角的 **"✏️ 编辑"** 按钮，会弹出密码输入框。输入您在环境变量中设置的 `ADMIN_TOKEN` 并确认。
*   **添加/修改分类**：在编辑状态下，点击导航栏分类尾部的 **"+"** 按钮可快速新建分类。鼠标悬浮在已有分类名上，可点击编辑或删除分类。
*   **添加/修改链接**：点击任意分类中的 **"添加链接"** 卡片，即可唤醒表单。只需输入标题与 URL。若不填写 **Favicon URL**，后端会自动根据域名请求提取高精度的网站图标。
*   **一键退出**：管理完毕后，点击右上角的 **"✅ 完成"** 退出编辑状态，数据会自动持久化保存。

### 2. 利用本地星标功能 (收藏夹)
*   每个链接卡片的右上角都有一个微小的 **"☆"** 按钮。
*   点击星标后，该链接会被优先归档至首个分类 **"常用收藏" (Favorites)** 中。
*   收藏数据由扩展程序利用本地存储 `localStorage` 进行隔离维护，您可以随时对云端大类下的某些高频项加星，互不干扰。

### 3. Markdown 备忘录管理
*   点击右上角的 **"📝 备忘"** 打开侧边抽屉。
*   普通用户访问仅展示非私密的备忘卡片。
*   当您在前台成功登录管理员后，备忘抽屉中会出现 **"新建备忘"** 按钮，并且私密卡片会带有明显的 `[私密]` 锁扣标记。
*   支持随时编辑，输入格式标准的 Markdown 文档（如列表、加粗、链接、代码块），系统会自动精美转换。

### 4. 数据一键同步与云备份 (Sync API)
为了防止数据丢失，或当您在本地开发完成了大范围的数据重构后希望批量上线：
1.  登录管理员身份。
2.  在扩展的管理配置页中，支持 **"导出本地数据"** 为 JSON，或 **"将当前配置推送到服务器"**。
3.  后端 `/api/admin/sync` 在收到经过授权的请求后，会利用 D1 事务机制，安全清除旧有的 `links` 与 `categories`，并将新的数据批量灌入，完成云端重建。
