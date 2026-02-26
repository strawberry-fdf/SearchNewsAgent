## [Completed]
- 全部后端 Python 文件添加中文 docstring 和注释（__init__.py × 7、config/main/pipeline/seed、routes、dedup/rss_fetcher/web_scraper、extractor/prompts、article/source、engine、feishu、db.py）
- 全部前端 TSX/TS 文件添加 JSDoc 中文组件说明（page/layout、ArticleCard/ArticleFeed/ScoreBadge/Settings/Sidebar/SourceManager/StatsPanel、api.ts）
- 编写完整系统说明文档 `系统说明文档.md`（9 大章节：系统概览、目录结构、核心模块、API 端点、数据流、配置说明、部署指南、设计决策、数据库 Schema）

## [In Progress]
- 无

## [Next Steps]
1. 根据实际运行验证代码注释无语法错误
2. 如需扩展：为 storage/mongo.py（遗留 MongoDB 实现）添加注释

## [Key Decisions / Context]
- 所有代码注释统一使用中文，与项目面向中文用户的定位一致
- 前端采用 JSDoc `/** */` 格式组件级注释，后端采用 Python docstring 风格
- db.py 的 section header 全部从英文替换为中文（如 "Source CRUD" → "信源 (Source) 增删改查"）
- `系统说明文档.md` 覆盖架构图、数据流图、完整 API 端点表、数据库 Schema 等关键内容
