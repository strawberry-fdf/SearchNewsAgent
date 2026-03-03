## [Completed]
- CI 打包修复: 移除 electron-builder 对 `build/icon.*` 与 `build/tray-icon.png` 的硬依赖，避免 CI 因缺失本地图标资源导致 Windows/macOS/Linux 打包中断
- Patch 发版验证: 已在 main 成功发布并推送 `v1.0.5`，GitHub Actions `Build & Release` 已被新 tag 正常触发
- CI 可见性修复: `.gitignore` 原先忽略整个 `.github` 导致 workflow 未入库；已放开 `.github/workflows/*.yml` 并将 `release.yml` 提交到 main
- Patch 发版推进: main 分支执行 patch 时 `v1.0.3` 因历史标签冲突，已顺延成功发布并推送 `v1.0.4`（commit + tag）
- 分支同步与提交流程完成: 已拉取远端 main 合并到 dev，解决 progress.md 冲突后推送分支并创建 PR #2（dev -> main）
- 设置页 UI 精简: LLM 配置和筛选规则区块默认只展示激活项，非激活项折叠隐藏（"展开 其他配置/未激活规则"），移除冗余提示横幅和空状态文本
- 大模型筛选规则唯一性执行: 当用户定义了自定义筛选预设且激活时，Pipeline 绕过硬编码 4 步 engine 规则，仅以 LLM 输出的 model_selected 作为唯一筛选标准
- 收藏模块信源计数修复: SourcePanel 在收藏模式下传 starred=true 只统计收藏文章数；星标切换时通过 refreshKey 机制实时刷新信源计数
- 测试修复: Settings.test.tsx 3 个断言、SourceManager.test.tsx 删除测试（window.confirm mock + 精确按钮选择器），前端 223 / 后端 283 全部通过
- 信源 URL 编辑功能: 信源管理中 URL 支持 InlineEdit 点击编辑，保存后更新数据库并刷新列表；后端 SourceUpdate 模型和 db.py allowed 集合新增 url 字段
- 全局图标替换基础架构: 创建 build/ 目录（icon.ico/icon.icns/icon.png/tray-icon.png），Sidebar Logo 支持 /logo.png 图片自动加载（失败回退文字 AN），electron-builder.yml 增加 tray-icon 资源打包
- 窗口关闭最小化到托盘: 拦截 BrowserWindow close 事件弹出三选对话框（最小化/退出/取消），系统托盘图标 + 右键菜单（显示主窗口/完全退出），单击托盘图标恢复窗口
- 开机自启动功能: Electron 主进程 IPC (get-auto-launch/set-auto-launch) + app.setLoginItemSettings 跨平台注册；前端设置页新增「系统集成」卡片含开机自启动开关及状态回显
- CI 自动发布已接入: 新增/重构 `.github/workflows/release.yml`，在推送 `v*` tag 时于 macOS/Windows/Linux 三平台并行构建并自动创建/更新 GitHub Release，上传桌面安装包产物
- 更新检查逻辑统一: 开发/生产环境均启用 GitHub 版本检查（自动+手动一致）；修复构建脚本跨平台误用导致的伪成功问题（非目标系统直接失败提示）；补全 package.json author email 以满足 Linux deb 打包要求
- 根目录文档整理: ELECTRON.md/xuqiu.md/系统说明文档.md 移入 docs/ 并重命名为 electron-packaging.md/product-requirements.md/system-architecture.md；更新所有引用路径（instructions/skills/README）
- 项目文件清理与脚本 Node.js 化: 删除散落的 test_stdout/stderr.txt、start.sh、3 个平台 shell/ps1 脚本；新建 scripts/build-backend.mjs 统一跨平台 PyInstaller 打包（自动检测平台 + --mac/--win/--linux 参数）；package.json 中 npm 引用全部改为 pnpm
- 大模型配置重构为多配置单激活模式: 参考筛选规则交互设计，支持保存多条 LLM 配置（名称/模型/API Key/Base URL），每次仅激活一个；删除 LLM 提供商选项，统一 OpenAI 兼容模式支持任意模型；新建/编辑配置改为屏幕中央弹窗；缓存管理只显示文章数据大小
- 修复打包三大问题: ①后端改 --windowed + windowsHide 消除控制台弹窗; ②去掉 loading.html 实现无感启动; ③排除 venv/__pycache__/.db 减小包体至 ~173MB
- 修复 ModuleNotFoundError (fastapi.middleware.cors): PyInstaller 改用 --collect-submodules 递归收集 fastapi/starlette/uvicorn/pydantic/openai/anthropic/httpcore 全部子模块
- 删除信源时级联删除对应文章: `delete_source()` 先查信源名再删 articles 再删 sources，确保数据库一致性
- 信源面板置顶功能完善: 分类置顶（pinned_categories 存 settings 表，有序列表）+ 信源置顶（pin_order 字段按先后排序），编辑模式下分类头部新增置顶按钮，正常模式显示 Pin 图标
- 修复缓存统计不一致问题: 信源估算字节数扩展为包含所有文本字段（raw_html/clean_markdown/title/summary/analysis_json 等）+ WAL 文件大小

- 后端测试全覆盖: 283 个测试用例全部通过，覆盖 12 个模块（dedup/models/rules_engine/extractor/feishu/rss_fetcher/web_scraper/db/pipeline/api/cross_scenarios），含单元测试+集成测试+全场景交叉复杂测试
- 前端测试全覆盖: 223 个测试用例全部通过（13 个测试文件），覆盖 api/ScoreBadge/ThemeProvider/Sidebar/ArticleCard/ArticleFeed/SourcePanel/SourceManager/StatsPanel/Settings/UpdateToast/Home(page) + 集成测试；测试框架 Vitest 4.0.18 + @testing-library/react + jest-dom + user-event + jsdom
- 工程化规范体系: Husky pre-commit hook（tsc类型检查+前端223测试+后端283测试）+ commit-msg hook（commitlint Conventional Commits 规范）；新增 5 个 Node.js 脚本: dev.mjs（开发启动）、commit.mjs（交互式规范提交）、release.mjs（版本发布+CHANGELOG+Tag）、check.mjs（手动质量检查）、build.mjs（统一构建流水线：质量检查→前端构建→后端打包→Electron打包）；语义化版本控制 major/minor/patch
- README 重写 + CONTRIBUTING.md: README 全面更新（修正技术栈/架构图/项目结构/快速开始/脚本命令速查表/桌面应用说明/去除过时 MongoDB/Docker 引用）；新增 CONTRIBUTING.md 开源贡献指南（环境搭建/提交规范/测试要求/代码规范/PR 流程/版本发布/FAQ）
- 英文 README + 截图: 新增 README_EN.md 中英切换；Playwright 截取暗色主题截图嵌入两份 README
- 数据库路径修复: SQLITE_DB_PATH 默认改为 backend/data/agent_news.db，db.py 自动创建目录；.gitignore 忽略 backend/data/
- PR #1 已更新: dev → main，包含自动更新/工程化工具链/测试套件/文档重构/DB路径修复

---
【2026-02】Electron 桌面打包方案：
- 新增 electron/ 目录 (main.js, preload.js, loading.html)：主进程管理窗口与后端子进程生命周期
- 新增 scripts/ 目录 (electron-entry.py, build-backend.ps1, build-backend.sh)：PyInstaller 入口 + 构建脚本
- 新增根 package.json + electron-builder.yml：Electron 依赖管理与跨平台打包配置
- 修改 frontend/next.config.js：支持 ELECTRON=true 时静态导出 (output: 'export')
- 修改 backend/main.py：CORS 扩展 + 可配置端口 + Electron 模式检测
- 生产模式架构: Electron 启动 → PyInstaller 后端 (API + 静态文件同源 localhost:8000) → BrowserWindow 加载
- 用户数据 (.env + SQLite DB) 存储在系统 userData 目录，首次启动自动初始化

- 实现用户端自动更新检查: 所有平台通过 GitHub Releases API 检查新版本，弹窗引导下载；菜单栏"检查更新"即时反馈；启动后延迟 5 秒自动检查；electron-updater 代码保留备用（待 CI/CD 接入后 Win/Linux 可切换为静默更新）
- 包管理器切换为 pnpm: 删除 node_modules/package-lock.json，新增 .npmrc（electron 镜像加速）、pnpm 配置；electron v33.4.11 已验证
- 设置页新增"关于与更新"卡片: Settings.tsx 添加 AboutAndUpdate 组件，显示版本号/平台信息，提供手动"检查更新"按钮（调用 electronAPI IPC）；已清理 main.js 中的模拟弹窗测试代码

## [In Progress]
- 无

## [Next Steps]
1. 将实际图标资源放入 build/ 目录（icon.ico/icon.icns/icon.png/tray-icon.png）和 frontend/public/logo.png，替换占位文件
2. 创建首个 GitHub Release (tag v1.0.0) 并手动上传打包产物，验证更新检查流程
3. 在 Linux 运行 `pnpm run build:linux` 完整打包测试

## [Key Decisions / Context]
- **提交规范**: 使用 Conventional Commits (`feat:/fix:/docs:/style:/refactor:/perf:/test:/build:/ci:/chore:/revert:`)，Husky + commitlint 自动校验；`pnpm commit` 交互式引导提交
- **版本发布**: 语义化版本 (SemVer)，`pnpm release:patch/minor/major` 自动递增版本号、更新 CHANGELOG.md、创建 Git Tag、同步前后端 package.json 版本
- **pre-commit 检查**: 每次提交前自动执行 TypeScript 类型检查 + 前端 Vitest 223 测试 + 后端 Pytest 283 测试，任一失败则阻止提交
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
- **自动更新策略**: 暂不使用 CI/CD，所有平台统一通过 GitHub API 查询最新 Release tag 对比版本号；手动检查无论结果均显示反馈弹窗，启动自动检查仅新版本才弹窗；electron-updater 代码保留，待 CI/CD 就绪后 Win/Linux 可启用静默下载安装
- **窗口关闭行为**: 点击关闭按钮弹出三选对话框（最小化到托盘/完全退出/取消），isQuitting 标志位控制真正退出时跳过拦截；系统托盘使用 build/tray-icon.png，右键菜单含「显示主窗口」「完全退出」
- **开机自启动**: 使用 Electron 内置 app.setLoginItemSettings/getLoginItemSettings，跨平台兼容（Windows 注册表/macOS 登录项/Linux XDG autostart）；前端设置页「系统集成」卡片仅在 Electron 环境显示
- **信源 URL 编辑**: 复用 InlineEdit 组件，支持点击编辑保存，后端 PATCH /api/sources/:id 支持 url 字段更新
- **图标替换架构**: build/ 目录存放打包图标（icon.ico/icns/png + tray-icon.png），前端 Sidebar Logo 加载 /logo.png 图片（前端 public/ 目录），加载失败回退为 AN 文字 Logo
- **构建策略修正**: 后端 PyInstaller 不支持跨平台产物，`build.mjs` 与 `build-backend.mjs` 已增加主机/目标平台一致性校验；跨平台完整构建需在对应系统或 CI 多平台 Runner 执行
- **发布策略升级**: 发布来源改为 GitHub Actions 自动流水线（tag 驱动），避免“仅有 tag 无 Release”导致客户端无法检测更新
