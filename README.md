# AgentNews – AI 智能资讯精选与降噪系统

> AI Agent + 自动化流水线，多渠道聚合 → LLM 深度解析 → 规则引擎精选 → 多端分发

---

## 架构总览

```
数据采集层 ➡️ LLM 解析层 ➡️ 规则引擎层 ➡️ 数据存储层 ➡️ 呈现与分发层
(RSS/Web)    (OpenAI/Claude)  (4步漏斗)    (MongoDB)     (Next.js + 飞书)
```

## 项目结构

```
AgentNews/
├── backend/                 # Python FastAPI 后端
│   ├── api/routes.py        # REST API 接口
│   ├── ingestion/           # 数据采集 (RSS / 网页爬虫)
│   ├── llm/                 # LLM 分析引擎 (OpenAI + Anthropic)
│   ├── rules/engine.py      # 四步精选决策规则引擎
│   ├── notification/        # 飞书 Webhook 推送
│   ├── storage/mongo.py     # MongoDB 异步存储层
│   ├── models/              # Pydantic 数据模型
│   ├── pipeline.py          # 全流程编排
│   ├── main.py              # FastAPI 入口 + APScheduler
│   ├── seed.py              # 初始信源种子数据
│   └── config.py            # 环境配置
├── frontend/                # Next.js 前端 (暗黑极客风)
│   └── src/
│       ├── app/             # Next.js App Router
│       ├── components/      # React 组件
│       └── lib/api.ts       # API 客户端
├── docker-compose.yml       # 一键启动
└── xuqiu.md                 # 需求文档
```

## 快速开始

### 前置条件

- Python 3.11+
- Node.js 18+
- MongoDB 6+ (本地或 Docker)
- OpenAI / Anthropic API Key

### 1. 启动 MongoDB

```bash
# 方式一：Docker
docker run -d --name mongo -p 27017:27017 mongo:7

# 方式二：使用 docker-compose (推荐)
docker-compose up -d mongodb
```

### 2. 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key 等配置

# 初始化信源种子数据
python -m backend.seed

# 启动后端 (端口 8000)
python -m backend.main
```

### 3. 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器 (端口 3000)
npm run dev
```

### 4. Docker Compose 一键启动

```bash
# 先配置 backend/.env
docker-compose up -d
```

访问 http://localhost:3000 查看前端界面。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/articles/selected` | 获取精选文章列表 |
| GET | `/api/articles` | 获取所有文章（支持 status/category 筛选） |
| POST | `/api/articles/{url_hash}/star` | 切换收藏状态 |
| GET | `/api/stats` | 获取统计数据 |
| GET | `/api/sources` | 获取信源列表 |
| POST | `/api/sources` | 添加新信源 |
| DELETE | `/api/sources?url=...` | 删除信源 |
| POST | `/api/admin/run-pipeline` | 手动触发采集流水线 |

## 核心精选规则 (四步漏斗)

1. **非 AI 分类拦截** – `category == "非AI/通用工具"` → 直接剔除
2. **AI 相关性硬拦截** – `ai_relevance < 60` → 剔除
3. **模型精选拦截 + 白名单豁免** – `model_selected == false` 且非"大佬blog"白名单 → 剔除
4. **重要性动态门槛** – 按分类设定阈值（模型发布 75, 论文 82, 评测 84, 行业 88, DevTool 86）

## 技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | FastAPI + Uvicorn |
| 数据库 | MongoDB + Motor (异步) |
| 调度器 | APScheduler |
| 数据采集 | feedparser + httpx + BeautifulSoup + markdownify |
| LLM | OpenAI GPT-4o-mini / Anthropic Claude (可配置切换) |
| 前端 | Next.js 15 + React 19 + Tailwind CSS |
| 推送 | 飞书 Webhook (卡片消息) |
| 部署 | Docker Compose |

## License

MIT
