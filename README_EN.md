<div align="center">

**English | [简体中文](README.md)**

<img src="docs/images/logo.png" alt="AgentNews Logo" width="120" />

# AgentNews

**AI-Powered News Curation & Noise Reduction System**

Multi-source Aggregation → LLM Deep Analysis → 4-Step Rules Engine → Desktop + Feishu Distribution

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-≥3.10-3776AB?logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-13.5-000?logo=next.js)](https://nextjs.org)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://conventionalcommits.org)

<img src="docs/images/screenshot-dark.png" alt="AgentNews Screenshot" width="800" />

</div>

---

## ✨ Introduction

AgentNews is built for AI practitioners and tech enthusiasts to combat information overload:

- **Automated Ingestion** — Periodically fetches articles from custom sources (RSS / Web pages)
- **LLM-Powered Analysis** — Classifies, scores, and summarizes each article via OpenAI / Anthropic / DeepSeek
- **4-Step Curation Funnel** — Rules engine: category filter → relevance gate → model recommendation → importance threshold
- **Multi-Theme Frontend** — Next.js with dark / light / system-follow UI, source grouping, bookmarks, search
- **Feishu Push** — Curated articles are automatically pushed to Feishu Webhook groups
- **Electron Desktop App** — One-click packaging for macOS / Windows / Linux, ready out of the box

---

## 🏗️ Architecture

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

**5-Step Pipeline**: Source Fetch → Data Ingestion & Dedup → LLM Analysis → Rules Engine Curation → Feishu Push

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python ≥ 3.10 · FastAPI · Uvicorn |
| Database | SQLite + aiosqlite (single file, zero maintenance) |
| Ingestion | feedparser · httpx · BeautifulSoup · markdownify |
| LLM | OpenAI-compatible API (GPT-4o-mini / DeepSeek / Claude, etc.) |
| Frontend | Next.js 13.5 · React 18 · TypeScript 5.3 · Tailwind CSS 3.4 |
| Desktop | Electron 33 · electron-builder 25 |
| Notification | Feishu Webhook (interactive card messages) |
| Testing | Vitest (223 frontend tests) · Pytest (283 backend tests) |
| Engineering | Husky · commitlint · Conventional Commits · SemVer |

---

## 🚀 Quick Start

```bash
# Clone & install
git clone https://github.com/strawberry-fdf/SearchNewsAgent.git
cd SearchNewsAgent
pnpm install

# Python environment
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt

# Configure LLM (can also be configured in the frontend settings page)
cp build/default.env .env
# Edit .env, fill in OPENAI_API_KEY, etc.

# Start dev environment
pnpm dev
```

Visit http://localhost:3000 after startup. Backend API runs at http://localhost:8000.

> For more setup details, see [CONTRIBUTING.md](CONTRIBUTING.md#开发环境搭建)

---

## 📁 Project Structure

```
SearchNewsAgent/
├── backend/                     # Python FastAPI backend
│   ├── api/routes.py            #   REST API routes (30+ endpoints)
│   ├── ingestion/               #   Data ingestion (RSS + scraper + dedup)
│   ├── llm/                     #   LLM analysis engine (multi-model)
│   ├── rules/engine.py          #   4-step curation rules engine
│   ├── notification/feishu.py   #   Feishu Webhook push
│   ├── storage/db.py            #   SQLite async storage (8 tables)
│   ├── pipeline.py              #   5-step pipeline orchestrator
│   └── tests/                   #   Backend tests (283 tests)
├── frontend/src/                # Next.js frontend
│   ├── components/              #   React components (10)
│   ├── lib/api.ts               #   API client wrapper
│   └── __tests__/               #   Frontend tests (223 tests)
├── electron/                    # Electron main process
├── scripts/                     # Node.js engineering scripts
│   ├── dev.mjs                  #   Dev environment launcher
│   ├── commit.mjs               #   Interactive conventional commit
│   ├── release.mjs              #   Semantic version release
│   ├── check.mjs                #   Code quality checks
│   └── build.mjs                #   Unified build pipeline
├── docs/                        # Documentation
├── .husky/                      # Git Hooks (pre-commit + commit-msg)
├── CONTRIBUTING.md              # Contribution guide
└── package.json                 # All script commands
```

---

## 📋 Scripts

```bash
pnpm dev              # Start dev environment (backend + frontend + Electron)
pnpm check            # Run all quality checks (tsc + Vitest + Pytest)
pnpm commit           # Interactive conventional commit
pnpm release:patch    # Release patch version (x.x.1)
pnpm release:minor    # Release minor version (x.1.0)
pnpm release:major    # Release major version (1.0.0)
pnpm build:mac        # Build macOS desktop app
pnpm build:win        # Build Windows desktop app
pnpm build:linux      # Build Linux desktop app
```

> Full command list in the `scripts` field of `package.json`

---

## 🔍 Curation Rules

Each article passes through a 4-step rules engine after LLM analysis:

| Step | Rule | Rejection Tag |
|------|------|---------------|
| 1 | Category filter — `category == "Non-AI/General"` | `REJECTED_NON_AI` |
| 2 | Relevance — `ai_relevance < 60` | `REJECTED_LOW_RELEVANCE` |
| 3 | Model recommendation — `model_selected == false` (exemption for "expert blog" sources) | `REJECTED_MODEL_UNSELECTED` |
| 4 | Importance threshold — dynamic per-category threshold | `REJECTED_LOW_IMPORTANCE` |

**Step 4 Thresholds**: Model Release 75 · Papers 82 · Benchmarks 84 · DevTool 86 · Industry 88

---

## 🔌 API Overview

The backend provides 30+ REST endpoints. Full list in [System Architecture](docs/system-architecture.md#4-api-端点). Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/articles/selected` | Get curated articles |
| GET | `/api/articles` | Get all articles (with filters) |
| POST | `/api/articles/{url_hash}/star` | Toggle bookmark |
| GET | `/api/sources` | List sources |
| POST | `/api/sources` | Add new source |
| POST | `/api/admin/run-pipeline` | Manually trigger pipeline |
| GET | `/api/admin/pipeline-stream` | SSE real-time log stream |
| GET | `/api/stats` | Statistics |

---

## 💻 Desktop App

Electron packages the app as a cross-platform desktop application — no Python / Node setup required:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` (arm64) |
| Windows | `-setup.exe` (NSIS) (x64) |
| Linux | `.AppImage` (x64) |

Build output goes to `dist/`. See [Electron Packaging Guide](docs/electron-packaging.md) for details.

---

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, commit conventions, testing requirements, and PR workflow.

---

## 📄 License

[MIT](LICENSE)
