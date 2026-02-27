## [Completed]
- SourcePanel 全面重写：展示全部信源（含禁用），禁用信源灰显+状态圆点；编辑模式支持信源/分类重命名、置顶、取消订阅
- 后端新增 pinned 列（sources 表）+ API 支持置顶切换，信源按 pinned→名称排序
- Settings 主题外观改为下拉框（亮色/暗色/跟随系统），移除卡片选择器
- Settings 精简所有描述文案：LLM 卡片移除冗长说明框，筛选规则卡片移除底部大段注释
- 信源导航面板（SourcePanel）：文章 Tab 左侧展示按分类分组的信源列表，支持搜索、点击切换信源过滤
- 筛选规则预设与手动筛选要求合并为统一的「筛选规则」卡片，默认筛选要求作为可折叠兜底项
- Tailwind 颜色系统改为 CSS 变量驱动（dark-* 类自动适配主题），globals.css 新增 light 主题变量
- 全面重写 LLM System Prompt（prompts.py）：严格评分标准、强制约束 6 条、禁止虚高评分
- 编写完整系统说明文档 `系统说明文档.md`（9 大章节）

## [In Progress]
- 无

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
