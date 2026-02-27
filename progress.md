## [Completed]
- 「全部文章」页面添加关键词全局检索（标题/摘要/全文），后端 db.py 支持 keyword 参数
- Settings 页面精简：移除「关键词规则」和「兴趣标签」两个冗余功能区块
- 筛选规则预设并入「大模型分析」卡片，改为多选叠加模式（toggle-active），所有激活预设规则合并注入 Prompt
- 全面重写 LLM System Prompt（prompts.py）：严格评分标准、强制约束 6 条、禁止虚高评分、纯 JSON 输出
- 修复 web_scraper.py 缺少 raw_title 字段的问题，添加 `_extract_title()` 辅助函数
- 编写完整系统说明文档 `系统说明文档.md`（9 大章节）
- 全部代码文件添加中文 docstring / JSDoc 注释

## [In Progress]
- 无

## [Next Steps]
1. 部署运行后端联调，验证多预设叠加评分效果
2. 考虑为 storage/mongo.py（遗留 MongoDB 实现）添加注释

## [Key Decisions / Context]
- 筛选预设从单选激活改为多选叠加，Pipeline 启动时获取所有 is_active=1 的预设，组合为编号规则列表注入 extractor
- 新增 API 端点 `POST /api/filter-presets/{id}/toggle-active`，旧 activate 端点保留向后兼容
- LLM Prompt 采用强指令格式（═══分隔符 + 【最高优先级】标记 + 5 条强制执行指令），确保模型严格遵循用户自定义规则
- 关键词搜索对「全部文章」模式新增后端 LIKE 匹配（title / raw_title / summary / clean_markdown 四字段）
- 所有代码注释统一使用中文，与项目面向中文用户的定位一致
- 前端采用 JSDoc `/** */` 格式组件级注释，后端采用 Python docstring 风格
