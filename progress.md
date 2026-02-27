## [Completed]
- 移除 Docker 及 MongoDB 相关所有逻辑与文件，系统全面本地化，仅依赖 SQLite 单文件数据库
- 后端 config/requirements/db/pipeline/api/models/env 等全部切换为 SQLite 配置与实现，彻底去除 mongo 相关引用
- 删除 docker-compose.yml、backend/Dockerfile、frontend/Dockerfile、backend/storage/mongo.py 等遗留文件
- 新增文章缓存管理功能：后端提供 /api/cache/stats 与 /api/cache/clear，支持统计数据库空间、按信源/全部清理缓存
- 前端 Settings 页面新增缓存管理区块，支持查看总占用、按信源勾选清理、全部清理、二次确认弹窗
- 其它 UI/功能优化：筛选规则合并、主题切换、信源导航、LLM prompt 优化等

---
【2026-02】去中心化/本地化与缓存管理大改动：
- 移除 Docker 及 MongoDB 相关所有逻辑与文件，系统全面本地化，仅依赖 SQLite 单文件数据库
- 后端 config/requirements/db/pipeline/api/models/env 等全部切换为 SQLite 配置与实现，彻底去除 mongo 相关引用
- 删除 docker-compose.yml、backend/Dockerfile、frontend/Dockerfile、backend/storage/mongo.py 等遗留文件
- 新增文章缓存管理功能：后端提供 /api/cache/stats 与 /api/cache/clear，支持统计数据库空间、按信源/全部清理缓存
- 前端 Settings 页面新增缓存管理区块，支持查看总占用、按信源勾选清理、全部清理、二次确认弹窗

## [In Progress]


## [Next Steps]
1. 部署运行后端联调，验证信源过滤 + 多预设叠加评分效果
2. 考虑为 storage/mongo.py（遗留 MongoDB 实现）添加注释

## [Key Decisions / Context]
- SourcePanel 展示全部信源（不再过滤 enabled），禁用信源以半透明+灰色圆点区分，启用信源显示绿色圆点
- 编辑模式：点击铅笔图标进入，支持内联重命名（信源/分类）、置顶（Pin）、取消订阅（确认弹窗）；分类中有置顶信源的排在前面
- 信源导航面板（SourcePanel）位于 Sidebar 与 ArticleFeed 之间，仅在 feed/all/starred Tab 时显示
- 后端所有文章查询/计数函数均支持 source_name 可选过滤，新增 get_source_article_counts() 按信源聚合
- 主题系统采用 CSS 变量 + Tailwind 映射方案，ThemeProvider 使用 React Context + localStorage 持久化
- 筛选规则统一为独立 SectionCard（icon: Filter），LLM 开关从筛选规则拆出为独立卡片
- 筛选预设从单选激活改为多选叠加，Pipeline 启动时获取所有 is_active=1 的预设组合注入 extractor
- 所有代码注释统一使用中文，与项目面向中文用户的定位一致
