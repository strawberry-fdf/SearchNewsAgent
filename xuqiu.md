AI 智能资讯精选与降噪系统 PRD & 技术架构文档
1. 项目概述
当前技术行业信息处于严重过载状态。本项目旨在构建一个**“AI Agent + 自动化流水线”**系统，通过多渠道聚合信息源，利用大语言模型（LLM）进行深度阅读、结构化提取与智能打分，最后通过严格的代码级过滤规则，筛选出真正高价值的硬核技术资讯，并进行多端分发。

2. 参考原型与核心策略
![alt text](image.png)
![alt text](image-1.png)

2.1 核心精选决策流水线
图1：四步硬核过滤规则，确保“精选”内容宁缺毋滥。

2.2 前端信息流展示终端
图2：暗黑极客风格的时间轴信息流，直观展示精选结果与模型打分。

3. 核心系统架构
系统整体分为五大模块：数据采集层 ➡️ LLM 解析层 ➡️ 规则引擎层 ➡️ 数据存储层 ➡️ 呈现与分发层。

4. 模块细化与技术实现方案
4.1 数据采集层 (Data Ingestion)
负责从全网稳定、高效地获取原始图文数据。

核心功能：

多源异构接入：支持 RSS Feed（常规博客/资讯）、API 轮询（如 GitHub Trending, Twitter API）、网页清洗爬虫（针对无 RSS 的官网如 Anthropic Newsroom）。

正文提取与降噪：抓取到的 HTML 必须经过预处理，剥离导航栏、广告、页脚。

技术选型：Python + APScheduler (调度) + feedparser (RSS) + Playwright / Craw4AI (动态网页) + markdownify (HTML 转 Markdown 降噪)。

⚠️ 关键防漏设计：

去重机制：以 URL 的哈希值作为数据库唯一键，抓取前进行 Bloom Filter 或数据库级去重，防止重复调用 LLM 浪费额度。

重试机制：网络请求容易失败，需引入指数退避重试策略。

4.2 LLM 解析引擎 (AI Extractor)
系统的“大脑”，负责理解长文本并输出严格的结构化数据。

核心功能：阅读清洗后的 Markdown 正文，提取摘要、打分、分类。

技术选型：OpenAI GPT-4o-mini 或 Anthropic Claude-3.5-Haiku/Sonnet + Instructor / LangChain Structured Output。

数据契约 (JSON Schema)：

JSON
{
  "title": "重写后的精炼标题(<=20字)",
  "summary": "一句话核心摘要，说明其实质性进展或价值",
  "category": "枚举值: [默认, 模型发布, 论文/研究, 评测/基准, 行业动态/政策监管/其他, DevTool/工程向, 非AI/通用工具]",
  "ai_relevance": 85, 
  "importance": 90,
  "model_selected": true,
  "tags": ["Agent", "多模态", "模型发布"]
}
⚠️ 关键防漏设计：

Token 截断控制：长篇论文或博客可能超出 LLM 上下文限制或导致成本飙升。需在发送前进行截断（例如只保留前 4000 个 Token 的正文）。

JSON 幻觉容错：LLM 偶尔会输出非标准 JSON，必须使用具有结构化输出保证的 API，并在代码层加入 Pydantic 校验，校验失败直接丢弃或进入死信队列。

4.3 核心精选决策流水线 (Rules Engine)
完全复刻图1的过滤逻辑，系统的“守门员”。

实现逻辑 (Python)：

Python
def evaluate_article(analysis: dict, source_tags: list) -> str:
    # Step 1: 非 AI 分类直接拦截
    if analysis['category'] == "非AI/通用工具":
        return "REJECTED_NON_AI"

    # Step 2: AI 相关性硬拦截 (低于60分)
    if analysis['ai_relevance'] < 60:
        return "REJECTED_LOW_RELEVANCE"

    # Step 3: 模型精选结果硬拦截 + 白名单豁免
    if not analysis['model_selected']:
        # 大佬blog白名单特权，且不能是DevTool分类
        is_vip_blog = "大佬blog" in source_tags
        if not (is_vip_blog and analysis['category'] != "DevTool/工程向"):
            return "REJECTED_MODEL_UNSELECTED"

    # Step 4: 重要性动态门槛拦截
    thresholds = {
        "默认": 75,
        "模型发布": 75,
        "论文/研究": 82,
        "评测/基准": 84,
        "行业动态/政策监管/其他": 88,
        "DevTool/工程向": 86
    }
    # 获取对应阈值，若未匹配到则默认75
    required_score = thresholds.get(analysis['category'], 75)

    if analysis['importance'] < required_score:
        return "REJECTED_LOW_IMPORTANCE"

    return "SELECTED" # 成功通过漏斗！
4.4 数据存储层 (Storage)
支撑前后端交互的基础。

技术选型：PostgreSQL 或 MongoDB。

核心表结构设计：

Sources (信源表)：记录 RSS/API 链接、抓取频率、自定义标签（如 大佬blog）。

Articles (文章表)：记录原始 URL、原始 HTML、LLM 解析出的结构化 JSON 字段、处理状态（如 pending, selected, rejected）。

4.5 终端展示模块 (Frontend UI)
复刻图2界面的视觉体验。

核心功能：

左侧静态导航与后台入口。

右侧主信息流：按日期倒序（Group by Date），渲染卡片流。

卡片交互：收藏（Star）、点击标题跳转外链。

技术选型：Next.js + Tailwind CSS + Shadcn UI (暗色模式)。

⚠️ 关键视觉细节：

不同分数的颜色标定（如 88分显示为翠绿色，<80分显示为暗绿色或灰色）。

精选 Tag 的高亮显示。

4.6 推送与通知模块 (Notification)
实现“第一时间推送到面前”的诉求。

触发机制：当流水线判定结果为 SELECTED 且数据成功入库后，异步触发推送任务。

支持渠道：Telegram Bot / 企业微信 / 飞书 Webhook。

推送模版：

Markdown
🔥 **[AI热点精选]** {title}

📊 分数：{importance} | 🏷️ 分类：{category}
💡 摘要：{summary}
🔗 链接：{url}