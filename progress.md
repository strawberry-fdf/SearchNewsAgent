## [Completed]
- 大模型配置重构为多配置单激活模式: 参考筛选规则交互设计，支持保存多条 LLM 配置（名称/模型/API Key/Base URL），每次仅激活一个；删除 LLM 提供商选项，统一 OpenAI 兼容模式支持任意模型；新建/编辑配置改为屏幕中央弹窗；缓存管理只显示文章数据大小
- 修复打包三大问题: ①后端改 --windowed + windowsHide 消除控制台弹窗; ②去掉 loading.html 实现无感启动; ③排除 venv/__pycache__/.db 减小包体至 ~173MB
- 修复 ModuleNotFoundError (fastapi.middleware.cors): PyInstaller 改用 --collect-submodules 递归收集 fastapi/starlette/uvicorn/pydantic/openai/anthropic/httpcore 全部子模块
- 删除信源时级联删除对应文章: `delete_source()` 先查信源名再删 articles 再删 sources，确保数据库一致性
- 信源面板置顶功能完善: 分类置顶（pinned_categories 存 settings 表，有序列表）+ 信源置顶（pin_order 字段按先后排序），编辑模式下分类头部新增置顶按钮，正常模式显示 Pin 图标
- 修复缓存统计不一致问题: 信源估算字节数扩展为包含所有文本字段（raw_html/clean_markdown/title/summary/analysis_json 等）+ WAL 文件大小

---
【2026-02】Electron 桌面打包方案：
- 新增 electron/ 目录 (main.js, preload.js, loading.html)：主进程管理窗口与后端子进程生命周期
- 新增 scripts/ 目录 (electron-entry.py, build-backend.ps1, build-backend.sh)：PyInstaller 入口 + 构建脚本
- 新增根 package.json + electron-builder.yml：Electron 依赖管理与跨平台打包配置
- 修改 frontend/next.config.js：支持 ELECTRON=true 时静态导出 (output: 'export')
- 修改 backend/main.py：CORS 扩展 + 可配置端口 + Electron 模式检测
- 生产模式架构: Electron 启动 → PyInstaller 后端 (API + 静态文件同源 localhost:8000) → BrowserWindow 加载
- 用户数据 (.env + SQLite DB) 存储在系统 userData 目录，首次启动自动初始化

## [In Progress]


## [Next Steps]
1. 在 Linux 运行 `npm run build:linux` 完整打包测试
2. 实际安装并运行 Windows 打包产物，验证端到端功能正常

## [Key Decisions / Context]
- SourcePanel 展示全部信源（不再过滤 enabled），禁用信源以半透明+灰色圆点区分，启用信源显示绿色圆点
- 编辑模式：点击铅笔图标进入，支持内联重命名（信源/分类）、置顶（Pin）、取消订阅（确认弹窗）；分类支持独立置顶（Pin 按钮），信源置顶按 pin_order 排序
- 删除信源时级联删除该信源下的所有文章，保持数据库一致性
- 分类置顶数据存储在 settings 表的 pinned_categories 键中（有序列表），信源置顶增加 pin_order 字段
- **大模型配置**: 重构为多配置单激活模式（llm_configs 表），删除 LLM 提供商选项，仅保留模型名/API Key/Base URL，统一使用 OpenAI 兼容客户端支持任意模型；新建/编辑配置通过屏幕中央弹窗；激活的配置优先级高于环境变量
- 缓存管理统计: 只显示文章数据大小和文章数，不再显示其他占用
- 信源导航面板（SourcePanel）位于 Sidebar 与 ArticleFeed 之间，仅在 feed/all/starred Tab 时显示
- 后端所有文章查询/计数函数均支持 source_name 可选过滤，新增 get_source_article_counts() 按信源聚合
- 主题系统采用 CSS 变量 + Tailwind 映射方案，ThemeProvider 使用 React Context + localStorage 持久化
- 筛选规则统一为独立 SectionCard（icon: Filter），LLM 开关从筛选规则拆出为独立卡片
- 筛选预设从单选激活改为多选叠加，Pipeline 启动时获取所有 is_active=1 的预设组合注入 extractor
- 所有代码注释统一使用中文，与项目面向中文用户的定位一致
- **Electron 打包**: 生产模式下后端通过 STATIC_DIR 挂载前端静态文件，实现 API + 前端同源 (localhost:8000)，无需额外 CORS 配置
- **PyInstaller**: 使用 --onedir 模式打包后端，hidden-import 覆盖全部 backend.* 子模块 + 关键三方库
- **用户配置**: .env 存放于系统 userData 目录，首次启动从 default.env 模板复制；菜单栏提供"打开配置目录"快捷入口
