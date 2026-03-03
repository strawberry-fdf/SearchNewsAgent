# AgentNews — AI 智能资讯精选系统

> AI Agent 驱动的技术资讯精选与降噪系统，自动从 RSS/网页/API 源抓取文章，经 LLM 分析 + 四步规则引擎精选，最终呈现高质量 AI 领域资讯。

---

## 1. 系统概览

### 1.1 核心定位

本系统面向 AI 从业者及技术爱好者，解决"信息过载"痛点：

- **自动化抓取**: 定时从自定义信源（RSS、网页、API）抓取最新文章
- **LLM 智能分析**: 调用 OpenAI / Anthropic 模型对每篇文章进行分类、评分、摘要
- **四步硬核精选**: 规则引擎实现分类拦截 → 相关性过滤 → 模型精选 → 重要性门槛四级漏斗
- **前端即时呈现**: Next.js 多主题 UI（亮色/暗色/跟随系统），支持分类筛选、按信源分组、收藏、搜索、Pipeline 实时日志
- **飞书推送**: 入选文章自动推送到飞书 Webhook 群
- **Electron 桌面应用**: 打包为 macOS/Windows/Linux 独立桌面程序，无感启动，开箱即用

### 1.2 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Python ≥ 3.10 + FastAPI 0.115+ |
| LLM | OpenAI (gpt-4o-mini) / Anthropic (claude-3-5-haiku) |
| 数据库 | SQLite (aiosqlite 异步) — 单文件免运维 |
| 定时调度 | APScheduler 3.x (AsyncIOScheduler) |
| 前端框架 | Next.js 13.5 + React 18 + TypeScript 5.3 |
| UI 样式 | Tailwind CSS 3.4 (亮色/暗色/跟随系统主题) |
| 图标 | lucide-react |
| 桌面应用 | Electron 33 + electron-builder 25 |
| 后端打包 | PyInstaller 6.x (--onedir --windowed) |
| 部署 | Electron 桌面应用 / 本地 start.sh 开发 |

### 1.3 架构图

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  RSS / Web   │─────▶│   Ingestion  │─────▶│   Dedup      │
│  Sources     │      │  (Fetcher)   │      │ (URL Hash)   │
└──────────────┘      └──────────────┘      └──────┬───────┘
                                                    │
                                                    ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Feishu     │◀─────│  Rules       │◀─────│   LLM        │
│   Webhook    │      │  Engine      │      │  Extractor   │
└──────────────┘      └──────┬───────┘      └──────────────┘
                             │
                             ▼
                    ┌──────────────┐      ┌──────────────┐
                    │   SQLite     │◀────▶│   Next.js    │
                    │   Storage    │      │   Frontend   │
                    └──────────────┘      └──────────────┘
```

---

## 2. 目录结构

```
SearchNewsAgent/
├── backend/                    # Python 后端
│   ├── main.py                 # FastAPI 入口 + APScheduler 生命周期
│   ├── config.py               # 全局配置 (环境变量)
│   ├── pipeline.py             # Pipeline 编排器 (5 步流程)
│   ├── seed.py                 # 初始信源种子数据
│   ├── api/
│   │   └── routes.py           # REST API 路由 (全部端点)
│   ├── ingestion/              # 数据采集层
│   │   ├── dedup.py            # URL SHA-256 去重
│   │   ├── rss_fetcher.py      # RSS/Atom 抓取器
│   │   └── web_scraper.py      # 网页爬虫 (静态+动态)
│   ├── llm/                    # LLM 分析层
│   │   ├── extractor.py        # LLM 调用引擎 (OpenAI/Anthropic)
│   │   └── prompts.py          # System/User Prompt 模板
│   ├── models/                 # Pydantic 数据模型
│   │   ├── article.py          # 文章模型 (LLMAnalysis, ArticleDocument)
│   │   └── source.py           # 信源模型 (Source, SourceType)
│   ├── notification/           # 消息推送层
│   │   └── feishu.py           # 飞书 Webhook 卡片消息
│   ├── rules/                  # 规则引擎层
│   │   └── engine.py           # 四步过滤漏斗
│   ├── storage/                # 存储层
│   │   └── db.py               # SQLite 异步实现
│   └── requirements.txt
├── frontend/                   # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx        # 首页 (侧边栏 + 信源面板 + 内容区)
│   │   │   ├── layout.tsx      # 根布局
│   │   │   └── globals.css     # Tailwind + 自定义 CSS 变量
│   │   ├── components/
│   │   │   ├── ArticleCard.tsx  # 文章卡片
│   │   │   ├── ArticleFeed.tsx  # 文章列表 (精选/全部/收藏，按日期/信源分组，支持信源过滤)
│   │   │   ├── ScoreBadge.tsx   # 分数徽章
│   │   │   ├── Settings.tsx     # 设置页面 (主题/LLM/筛选规则/缓存管理)
│   │   │   ├── Sidebar.tsx      # 侧边栏导航
│   │   │   ├── SourceManager.tsx # 信源管理
│   │   │   ├── SourcePanel.tsx  # 信源导航面板 (按分类分组，搜索过滤，文章计数)
│   │   │   ├── StatsPanel.tsx   # 统计面板 + Pipeline 历史
│   │   │   └── ThemeProvider.tsx # 主题提供者 (亮色/暗色/跟随系统)
│   │   └── lib/
│   │       └── api.ts          # API 客户端封装
│   ├── package.json
│   └── tailwind.config.js
├── electron/                   # Electron 主进程
│   ├── main.js                 # 窗口管理 + 后端子进程生命周期
│   ├── preload.js              # 预加载脚本
│   └── loading.html            # 加载页面 (开发调试用)
├── scripts/                    # 构建脚本
│   ├── electron-entry.py       # PyInstaller 入口脚本
│   ├── build-backend.ps1       # Windows 后端打包脚本
│   └── build-backend.sh        # Linux 后端打包脚本
├── build/                      # 构建产物目录
│   ├── backend/                # PyInstaller 后端可执行文件
│   ├── default.env             # 默认环境变量模板
│   ├── icon.ico                # Windows 图标
│   └── icon.png                # Linux 图标
├── package.json                # 根 package.json (Electron + 构建脚本)
├── electron-builder.yml        # Electron 打包配置
├── progress.md                 # 开发进度追踪
├── docs/
│   ├── electron-packaging.md   # Electron 打包指南
│   ├── product-requirements.md # 产品需求 PRD
│   └── system-architecture.md  # 系统架构说明（本文档）
├── scripts/
│   ├── build-backend.mjs       # Node.js 跨平台后端打包脚本
│   └── electron-entry.py       # PyInstaller 运行时入口
```

---

## 3. 核心模块详解

### 3.1 Pipeline 编排器 (`pipeline.py`)

Pipeline 是系统的心脏，由 APScheduler 定时触发（默认 30 分钟），也可通过 API 手动触发。

**五步流程:**

| 步骤 | 描述 | 模块 |
|------|------|------|
| Step 1 | 获取所有已启用信源列表 | `storage/db.py` |
| Step 2 | 遍历信源抓取新文章，URL 去重后入库 | `ingestion/*` + `dedup.py` |
| Step 3 | 对 pending 文章调用 LLM 分析 | `llm/extractor.py` |
| Step 4 | 规则引擎四步精选 | `rules/engine.py` |
| Step 5 | 入选文章推送飞书 | `notification/feishu.py` |

**特性:**
- SSE 实时日志推送到前端
- Pipeline 运行状态持久化到 `pipeline_runs` 表
- 互斥锁防止并发执行

### 3.2 数据采集层 (`ingestion/`)

#### RSS 抓取器 (`rss_fetcher.py`)
- 使用 `feedparser` 解析 RSS/Atom Feed
- 提取 `title`、`link`、`published` 等元数据
- 支持 `fetch_since` 日期过滤（只抓取该日期之后的文章）
- 超时保护 (30 秒)

#### 网页爬虫 (`web_scraper.py`)
- 使用 `httpx` 异步抓取网页 HTML
- `BeautifulSoup` 清理噪音标签 (`<script>`, `<style>`, `<nav>` 等)
- `markdownify` 将清洗后的 HTML 转为 Markdown
- Token 截断防止超长内容（默认 4000 token 上限）

#### URL 去重 (`dedup.py`)
- 对 URL 规范化后取 SHA-256 哈希
- 查询数据库判断是否已存在，避免重复入库和重复 LLM 调用

### 3.3 LLM 分析层 (`llm/`)

#### 分析引擎 (`extractor.py`)
支持任意 OpenAI 兼容 LLM API，通过设置页面「大模型配置」管理多个配置（模型名/API Key/Base URL），每次激活一个：

| 配置方式 | 优先级 | 说明 |
|----------|--------|------|
| 设置页面 LLM 配置（激活项） | 最高 | 支持任意 OpenAI 兼容 API（OpenAI/DeepSeek/Together 等） |
| 环境变量 `.env` | 兜底 | `LLM_PROVIDER` 支持 openai / anthropic 双 Provider |

**分析流程:**
1. 构建 System + User Prompt（含文章 Markdown 内容）
2. 调用 LLM API，要求 JSON 格式输出
3. 解析并校验结构化结果
4. 返回 `LLMAnalysis` 对象

**输出字段:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | LLM 重写的中文标题 |
| `summary` | string | 2-3 句摘要 |
| `category` | enum | 分类（模型发布/论文研究/评测基准/行业动态/DevTool/非AI） |
| `ai_relevance` | int (0-100) | AI 相关性评分 |
| `importance` | int (0-100) | 重要性评分 |
| `model_selected` | bool | 模型是否推荐精选 |
| `tags` | string[] | 自动生成标签 |

#### Prompt 模板 (`prompts.py`)
- `SYSTEM_PROMPT`: 定义 AI 分析师角色、分类体系、评分标准
- `USER_PROMPT_TEMPLATE`: 注入文章标题和内容的模板
- 支持**筛选预设方案**扩展：用户可创建多条自定义 Prompt 预设，支持多选叠加，所有激活预设的规则合并后作为最高优先级评判标准附加到 System Prompt 中

### 3.4 规则引擎 (`rules/engine.py`)

四步过滤漏斗，逐级淘汰：

```
Step 1: 分类拦截    → category == "非AI/通用工具" → REJECTED_NON_AI
Step 2: 相关性拦截  → ai_relevance < 60         → REJECTED_LOW_RELEVANCE
Step 3: 模型精选拦截 → model_selected == false    → REJECTED_MODEL_UNSELECTED
                     (豁免: "大佬blog" 标签信源)
Step 4: 重要性门槛  → importance < 阈值          → REJECTED_LOW_IMPORTANCE
```

**动态阈值 (Step 4):**

| 分类 | 门槛 |
|------|------|
| 模型发布 | 75 |
| 论文/研究 | 82 |
| 评测/基准 | 84 |
| DevTool/工程向 | 86 |
| 行业动态/政策监管 | 88 |
| 默认 | 75 |

### 3.5 存储层 (`storage/db.py`)

基于 SQLite + aiosqlite 的异步存储，7 张数据表：

| 表名 | 用途 |
|------|------|
| `sources` | 信源配置（URL、类型、标签、抓取间隔） |
| `articles` | 文章主表（原文、分析结果、状态、评分） |
| `settings` | 全局键值配置 |
| `interest_tags` | 用户兴趣标签 |
| `keyword_rules` | 关键词过滤规则 |
| `pipeline_runs` | Pipeline 执行历史（日志、统计） |
| `filter_presets` | 筛选预设方案（自定义 Prompt） |

**设计特点:**
- 单连接池模式，应用启动时自动建表 + 迁移
- JSON 字段序列化存储（tags、analysis_json）
- 布尔值用 INTEGER 0/1 存储
- 支持动态 SQL 构建（排序、筛选、分页）

### 3.6 通知推送 (`notification/feishu.py`)

- 构建飞书交互式卡片消息（标题 + 分数 + 摘要 + 原文链接按钮）
- 支持 HMAC-SHA256 签名校验（可选）
- 异步 HTTP 发送，失败不阻塞主流程
- 通过环境变量 `FEISHU_WEBHOOK_URL` 配置

### 3.7 前端 (`frontend/`)

#### 页面结构

| 页面 | 组件 | 功能 |
|------|------|------|
| 精选 Feed | `SourcePanel` + `ArticleFeed` (mode=feed) | 左侧信源导航面板 + 右侧已入选文章列表，分类/标签/关键词/信源筛选，按日期或信源分组 |
| 全部文章 | `SourcePanel` + `ArticleFeed` (mode=all) | 左侧信源导航面板 + 右侧所有文章（含被拒绝），状态筛选，关键词全局检索 |
| 收藏 | `SourcePanel` + `ArticleFeed` (mode=starred) | 左侧信源导航面板 + 右侧用户收藏的文章 |
| 统计 | `StatsPanel` | 文章计数 + Pipeline 执行历史 + SSE 日志 |
| 信源管理 | `SourceManager` | 信源列表增删改，启用/禁用 |
| 设置 | `Settings` | 主题切换（亮色/暗色/跟随系统）、LLM 开关、筛选规则（预设+默认要求）、缓存管理 |

#### 核心组件

- **ArticleCard**: 展示单篇文章卡片，含分数徽章、展开详情、收藏、删除、用户标签编辑；支持 hideSource 模式
- **SourcePanel**: 信源导航面板，位于 Sidebar 与 ArticleFeed 之间；按 Source.category 分类分组展示信源，带文章计数徽章和搜索过滤，支持单击切换信源筛选
- **ScoreBadge**: 分数色值映射 (绿 ≥80 / 黄 ≥60 / 红 <60)
- **Sidebar**: 侧边栏导航，响应式（移动端可收起）
- **ThemeProvider**: 主题上下文提供者，支持亮色/暗色/跟随系统三种模式，localStorage 持久化
- **api.ts**: 统一 HTTP 客户端封装，所有 API 调用通过 `fetchJSON<T>()` 泛型函数

---

## 4. API 端点

### 4.1 文章相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/articles/selected` | 获取精选文章列表（分页+筛选+source_name） |
| GET | `/api/articles` | 获取全部文章列表（支持 source_name 过滤） |
| GET | `/api/articles/source-counts` | 获取每个信源的文章计数（可按 status 过滤） |
| POST | `/api/articles/{url_hash}/star` | 切换文章收藏状态 |
| PUT | `/api/articles/{url_hash}/user-tags` | 更新文章用户标签 |
| DELETE | `/api/articles/{url_hash}` | 删除单篇文章 |
| POST | `/api/articles/batch-delete` | 批量删除文章 |

### 4.2 信源相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sources` | 获取所有信源 |
| POST | `/api/sources` | 新增信源 |
| PATCH | `/api/sources/{source_id}` | 更新信源属性 |
| DELETE | `/api/sources?url=` | 删除信源 |

### 4.3 配置相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取全局设置 |
| PUT | `/api/settings` | 更新全局设置 |
| GET | `/api/tags` | 获取兴趣标签列表 |
| POST | `/api/tags` | 添加兴趣标签 |
| DELETE | `/api/tags/{tag}` | 删除兴趣标签 |
| GET | `/api/rules` | 获取关键词规则 |
| POST | `/api/rules` | 添加关键词规则 |
| PATCH | `/api/rules/{id}/toggle` | 切换规则启用状态 |
| DELETE | `/api/rules/{id}` | 删除关键词规则 |

### 4.4 筛选预设方案

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/filter-presets` | 获取所有预设方案 |
| POST | `/api/filter-presets` | 创建预设方案 |
| PATCH | `/api/filter-presets/{id}` | 更新预设方案 |
| POST | `/api/filter-presets/{id}/activate` | 激活预设（单选，向后兼容） |
| POST | `/api/filter-presets/{id}/toggle-active` | 切换预设激活状态（多选） |
| POST | `/api/filter-presets/deactivate` | 停用所有预设 |
| DELETE | `/api/filter-presets/{id}` | 删除预设方案 |

### 4.5 管理端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats` | 获取文章统计总览 |
| POST | `/api/admin/run-pipeline` | 手动触发 Pipeline |
| GET | `/api/admin/pipeline-status` | 获取当前 Pipeline 状态 |
| GET | `/api/admin/pipeline-stream` | SSE 实时过程日志 |
| GET | `/api/admin/pipeline-runs` | 获取 Pipeline 执行历史 |
| DELETE | `/api/admin/pipeline-runs/{id}` | 删除执行记录 |

### 4.6 缓存管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cache/stats` | 获取数据库空间占用统计（按信源分组） |
| POST | `/api/cache/clear` | 清理文章缓存（支持按信源/全部清理） |

---

## 5. 数据流

```
[用户配置信源]
       │
       ▼
[APScheduler 定时触发 / 手动触发]
       │
       ▼
[Step 1] 获取已启用信源列表 (db.get_all_sources)
       │
       ▼
[Step 2] 遍历信源抓取文章
       ├── RSS → rss_fetcher.fetch_rss()
       └── Web → web_scraper.scrape_url()
       │
       ├── URL Hash 去重 (dedup.url_hash → db.article_exists)
       └── 新文章入库 (db.insert_article, status="pending")
       │
       ▼
[Step 3] LLM 分析 (extractor.analyze_article)
       ├── 构建 Prompt (prompts.py)
       ├── 调用 OpenAI / Anthropic API
       └── 解析 JSON → 更新 article (db.update_article)
       │
       ▼
[Step 4] 规则引擎精选 (engine.evaluate_article)
       ├── 通过 → status="selected"
       └── 拒绝 → status="rejected", rejection_reason="REJECTED_*"
       │
       ▼
[Step 5] 飞书推送 (feishu.send_feishu_notification)
       │
       ▼
[前端展示] Next.js → GET /api/articles/selected
```

---

## 6. 配置说明

### 6.1 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `openai` | LLM 提供商 (`openai` / `anthropic`) |
| `OPENAI_API_KEY` | — | OpenAI API 密钥 |
| `OPENAI_BASE_URL` | 官方地址 | OpenAI 兼容端点 (可用于代理) |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI 模型名称 |
| `ANTHROPIC_API_KEY` | — | Anthropic API 密钥 |
| `ANTHROPIC_MODEL` | `claude-3-5-haiku-20241022` | Anthropic 模型 |
| `FEISHU_WEBHOOK_URL` | — | 飞书 Webhook URL |
| `FEISHU_WEBHOOK_SECRET` | — | 飞书签名密钥 (可选) |
| `FETCH_INTERVAL_MINUTES` | `30` | 全局抓取间隔 (分钟) |
| `MAX_CONTENT_TOKENS` | `4000` | 发送给 LLM 的最大 Token 数 |
| `SQLITE_DB_PATH` | `agent_news.db` | SQLite 数据库文件路径 |
| `LOG_LEVEL` | `INFO` | 日志级别 (DEBUG/INFO/WARNING/ERROR) |

### 6.2 信源配置

通过前端 **信源管理** 页面或 API 添加，支持三种类型：

- **RSS**: 标准 RSS/Atom Feed URL
- **Web**: 网页 URL（爬虫抓取）
- **API**: 第三方 API 端点

每个信源可设置：
- `tags`: 自定义标签（如 `["大佬blog"]` 可豁免规则引擎 Step 3）
- `category`: 分类
- `fetch_since`: 只抓取该日期之后的文章
- `fetch_interval_minutes`: 独立抓取间隔
- `enabled`: 启用/禁用

### 6.3 初始种子数据 (`seed.py`)

系统首次启动时自动导入 20+ AI 领域信源：

- **OpenAI Blog** / **Anthropic News** / **Google DeepMind Blog**
- **Hacker News (AI)** / **TechCrunch AI** / **The Verge AI**
- **arXiv (cs.AI)** / **Hugging Face Blog**
- **GitHub Trending**
- **AI 大佬 Blog**: Karpathy、Lilian Weng、Simon Willison、Chip Huyen 等

---

## 7. 部署指南

### 7.1 Electron 桌面应用（推荐）

系统已打包为 Electron 桌面应用，开箱即用：

**Windows:**
- `AgentNews-x.x.x-setup.exe` — NSIS 安装程序（支持自定义安装目录）

**启动流程:**
1. 首次启动自动在用户数据目录创建 `.env` 配置文件和 SQLite 数据库
2. 无感启动：窗口在后端就绪后直接显示完整界面（无加载页面）
3. 关闭窗口时自动终止后端进程

**用户数据目录:**

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%/agent-news/` |
| Linux | `~/.config/agent-news/` |

包含: `agent_news.db`（SQLite 数据库）、`.env`（用户配置）

**菜单栏:**
- 文件 → 打开配置目录（快速定位 .env 文件）
- 视图 → 重新加载 / 缩放 / 全屏
- 帮助 → GitHub 仓库 / 关于

> 详细打包说明参见 [Electron 打包指南](electron-packaging.md)

### 7.2 本地开发

```bash
# 一键启动 (后端 + 前端)
chmod +x start.sh
./start.sh

# 或分别启动:

# 后端
cd AgentNews
python -m backend.main

# 前端
cd AgentNews/frontend
npm install
npm run dev
```

**前端代理配置**: `next.config.js` 将 `/api/*` 请求代理到 `http://localhost:8000`。

**Electron 开发模式（可选）:**
```bash
# 确保后端和前端已启动，然后:
cd AgentNews
pnpm dev
```

---

## 8. 关键设计决策

| 决策 | 原因 |
|------|------|
| SQLite 替代 MongoDB | 单文件部署，无需额外数据库服务，适合中小规模 |
| 双 LLM Provider 支持 | 设置页面支持多配置单激活，统一 OpenAI 兼容模式支持任意模型；环境变量兜底支持 openai/anthropic |
| Token 截断 (4000) | 控制 LLM 调用成本，避免超长文章导致高消费 |
| URL SHA-256 去重 | 在 LLM 调用前去重，节省 API 费用 |
| 四步过滤漏斗 | 宁缺毋滥，确保"精选"质量 |
| SSE 实时日志 | Pipeline 运行过程可视化，用户体验 |
| 飞书推送（非邮件） | 团队协作场景下即时推送效率更高 |
| 筛选预设方案 | 用户可自定义 Prompt 扩展精选策略 |
| CSS 变量主题系统 | dark-* 颜色类映射 CSS 变量，零组件改动即支持亮色/暗色主题 |
| 按信源分组视图 | 用户可按信源维度浏览文章，信源头部可折叠，提升信息密度 |
| Electron 桌面应用 | 开箱即用，无需用户配置 Python/Node 环境 |
| PyInstaller --windowed | 无控制台弹窗，无感启动体验 |
| 缓存管理 | 前端支持按信源勾选清理、全部清理 + 二次确认弹窗 |

---

## 9. 数据库 Schema

### articles 表

```sql
CREATE TABLE articles (
    id TEXT PRIMARY KEY,
    url_hash TEXT UNIQUE,        -- URL SHA-256 哈希 (去重键)
    url TEXT,                    -- 原文 URL
    source_id TEXT,              -- 关联信源 ID
    source_name TEXT,            -- 信源名称
    raw_html TEXT,               -- 原始 HTML
    clean_markdown TEXT,         -- 清洗后 Markdown
    raw_title TEXT,              -- 原始标题
    title TEXT,                  -- LLM 重写标题
    summary TEXT,                -- LLM 生成摘要
    category TEXT,               -- LLM 判定分类
    ai_relevance INTEGER,        -- AI 相关性 (0-100)
    importance INTEGER,          -- 重要性 (0-100)
    model_selected INTEGER,      -- LLM 是否推荐精选
    tags TEXT,                   -- JSON: LLM 生成标签
    user_tags TEXT DEFAULT '[]', -- JSON: 用户自定义标签
    status TEXT DEFAULT 'pending', -- pending/selected/rejected
    rejection_reason TEXT,       -- REJECTED_* 拒绝码
    starred INTEGER DEFAULT 0,   -- 收藏标记
    fetched_at TEXT,             -- 抓取时间
    analyzed_at TEXT,            -- 分析完成时间
    published_at TEXT,           -- 原文发布时间
    analysis_json TEXT           -- 完整 LLM 分析 JSON 备份
);
```

### sources 表

```sql
CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    url TEXT UNIQUE,
    name TEXT,
    source_type TEXT,            -- rss/web/api
    tags TEXT,                   -- JSON: 自定义标签
    category TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    fetch_interval_minutes INTEGER DEFAULT 30,
    fetch_since TEXT DEFAULT NULL, -- ISO 日期
    last_fetched_at TEXT,
    created_at TEXT
);
```
