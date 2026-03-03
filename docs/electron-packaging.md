# AgentNews Electron 桌面应用打包指南

> 将 AgentNews 打包为可在 **Windows** 和 **Linux** 上开箱即用的桌面程序。

---

## 1. 架构概述

```
┌─────────────────────────────────────────────────┐
│                  Electron Shell                  │
│  ┌─────────────────────────────────────────────┐ │
│  │           BrowserWindow                     │ │
│  │  ┌───────────────┐  ┌───────────────────┐  │ │
│  │  │  Next.js 静态  │  │  FastAPI 后端     │  │ │
│  │  │  HTML/JS/CSS   │←→│  (PyInstaller)    │  │ │
│  │  │  (localhost:   │  │  localhost:8000   │  │ │
│  │  │   8000)        │  │  API + Static     │  │ │
│  │  └───────────────┘  └───────────────────┘  │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**生产模式流程:**
1. Electron 启动 → 窗口保持隐藏，后台静默启动 PyInstaller 打包的 Python 后端
2. 后端提供 API + 静态前端文件（通过 `STATIC_DIR`，同源 `localhost:8000`）
3. 轮询后端健康检查 (`/api/stats`)，就绪后加载主界面并显示窗口
4. 全程无感启动，用户直接看到完整界面
5. 关闭窗口时自动终止后端进程（Windows 使用 `taskkill /f /t`）

---

## 2. 环境准备

### 2.1 通用依赖

| 工具 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | ≥ 18 | Electron + Next.js 构建 |
| Python | ≥ 3.10 | 后端运行 + PyInstaller 打包 |
| npm | ≥ 9 | 包管理 |
| pip | 最新 | Python 包管理 |

### 2.2 安装项目依赖

```bash
# 1. 安装根目录 Electron 依赖
cd AgentNews
npm install

# 2. 安装前端依赖（npm install 会自动通过 postinstall 脚本触发）
# 如需手动: cd frontend && npm install

# 3. 安装后端 Python 依赖
pip install -r backend/requirements.txt

# 4. 安装 PyInstaller（打包后端用）
pip install pyinstaller
```

---

## 3. 开发模式

开发时无需打包，直接启动三个服务：

### 方式一：手动启动（推荐）

```bash
# 终端 1: 启动后端
cd AgentNews
python -m backend.main

# 终端 2: 启动前端
cd AgentNews/frontend
npm run dev

# 终端 3: 启动 Electron（可选，也可直接用浏览器 http://localhost:3000）
cd AgentNews
npm run electron:dev
```

### 方式二：一键启动

```bash
npm run dev:all
```

> 注意: 开发模式下 Electron 会自动打开 DevTools。

---

## 4. 生产打包

### 4.1 Windows 完整打包

```powershell
# 一键构建（前端静态导出 + 后端 PyInstaller + Electron 打包）
npm run build:win
```

产出:
- `dist/AgentNews-x.x.x-setup.exe` — NSIS 安装程序（支持选择安装目录）

### 4.2 Linux 完整打包

```bash
# 一键构建
npm run build:linux
```

产出:
- `dist/AgentNews-x.x.x.AppImage` — 通用 AppImage（推荐）

### 4.3 分步构建（调试用）

```bash
# 步骤 1: 构建前端（生成 frontend/out/ 静态文件）
npm run build:frontend

# 步骤 2: 构建后端（生成 build/backend/ PyInstaller 可执行文件）
# Windows:
npm run build:backend:win
# Linux:
npm run build:backend:linux

# 步骤 3: Electron 打包
# Windows:
npx electron-builder --win
# Linux:
npx electron-builder --linux
```

> **注意**: 后端使用 `--windowed` 模式打包（无控制台窗口），并通过 `--collect-submodules` 递归收集 fastapi/starlette/uvicorn 等关键包的全部子模块。打包完成后会自动清理 `venv/`、`__pycache__/`、`*.db` 等冗余文件。

---

## 5. 目录结构

打包后的文件结构：

```
AgentNews/                          (安装目录)
├── AgentNews.exe                   (主程序 / Linux 无后缀)
├── resources/
│   ├── app.asar                    (Electron 主进程代码)
│   ├── backend/                    (PyInstaller 后端)
│   │   ├── backend.exe             (后端可执行文件)
│   │   └── _internal/              (Python 运行时 + 依赖)
│   ├── frontend/                   (Next.js 静态文件)
│   │   ├── index.html
│   │   ├── _next/
│   │   └── ...
│   └── default.env                 (默认配置模板)
```

用户数据目录（首次启动自动创建）：

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%/agent-news/` |
| Linux | `~/.config/agent-news/` |

包含:
- `agent_news.db` — SQLite 数据库
- `.env` — 用户配置文件（从 `default.env` 复制）

---

## 6. 用户配置

首次启动时，应用会将 `default.env` 复制到用户数据目录。用户可通过菜单栏 **文件 → 打开配置目录** 找到 `.env` 文件进行编辑。

关键配置项：

```env
# LLM 提供商: openai 或 anthropic
LLM_PROVIDER=openai

# OpenAI（必填其一）
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# 或 Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-3-5-haiku-20241022

# 飞书推送（可选）
FEISHU_WEBHOOK_URL=https://open.feishu.cn/...
FEISHU_WEBHOOK_SECRET=

# 调度间隔
FETCH_INTERVAL_MINUTES=30

# 日志级别
LOG_LEVEL=INFO
```

修改后重启应用即可生效。

---

## 7. 常见问题

### Q: Windows SmartScreen 拦截？
A: 因为应用未经代码签名，Windows 可能会弹出警告。点击 "更多信息" → "仍要运行" 即可。正式发布建议购买代码签名证书。

### Q: 后端启动超时？
A: 检查用户数据目录下的 `.env` 文件配置是否正确。也可以尝试增加启动超时时间（修改 `electron/main.js` 中的 `BACKEND_STARTUP_TIMEOUT`，默认 60 秒）。

### Q: 启动时一直黑屏/白屏？
A: 应用采用无感启动模式，窗口会在后端就绪后才显示。如果长时间无响应，可能是后端启动失败，请通过开发者工具查看日志排查。

### Q: 如何查看日志？
A: 生产模式下通过菜单 **视图 → 开发者工具**（需先在菜单中启用）可查看 Electron 控制台日志（包含后端 stdout/stderr 输出）。

### Q: 如何重置数据？
A: 删除用户数据目录下的 `agent_news.db` 文件，重启应用会自动创建新数据库。

### Q: 跨平台打包？
A: electron-builder 支持在 Windows 上打包 Windows 应用，在 Linux 上打包 Linux 应用。**不支持**在一个平台上交叉编译另一个平台的 PyInstaller 可执行文件。需要在对应平台上运行打包命令。

---

## 8. 脚本速查表

| 命令 | 说明 |
|------|------|
| `npm run electron:dev` | 启动 Electron 开发模式 |
| `npm run dev:all` | 一键启动后端 + 前端 + Electron |
| `npm run build:frontend` | 构建前端静态文件 |
| `npm run build:backend:win` | PyInstaller 打包后端 (Windows) |
| `npm run build:backend:linux` | PyInstaller 打包后端 (Linux) |
| `npm run build:win` | 完整 Windows 打包 |
| `npm run build:linux` | 完整 Linux 打包 |
| `npm run clean` | 清理所有构建产物 |
