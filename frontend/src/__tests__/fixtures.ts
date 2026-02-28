/**
 * 测试用 Mock 数据工厂 —— 提供各类接口的标准化测试数据。
 * 使用工厂函数，支持覆盖任意字段。
 */
import type {
  Article,
  ArticleAnalysis,
  ArticlesResponse,
  Stats,
  Source,
  AppSettings,
  LlmConfig,
  FilterPreset,
  KeywordRule,
  PipelineRun,
  PipelineStatus,
  CacheStats,
  CacheSourceStat,
  SourceCount,
} from "@/lib/api";

// ── Article ──

export function createAnalysis(overrides: Partial<ArticleAnalysis> = {}): ArticleAnalysis {
  return {
    title: "GPT-5 正式发布",
    summary: "OpenAI 发布了 GPT-5 模型，在推理能力上有重大突破。",
    category: "模型发布",
    ai_relevance: 92,
    importance: 88,
    model_selected: true,
    tags: ["GPT-5", "OpenAI", "LLM"],
    ...overrides,
  };
}

export function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "art-001",
    url: "https://example.com/article-1",
    url_hash: "hash001",
    source_name: "TechCrunch",
    status: "selected",
    rejection_reason: "",
    starred: false,
    fetched_at: "2026-02-28T10:00:00Z",
    analyzed_at: "2026-02-28T10:01:00Z",
    published_at: "2026-02-28T09:00:00Z",
    raw_title: "GPT-5 Released",
    user_tags: [],
    analysis: createAnalysis(),
    ...overrides,
  };
}

export function createArticlesResponse(
  items: Article[] = [createArticle()],
  overrides: Partial<ArticlesResponse> = {},
): ArticlesResponse {
  return {
    total: items.length,
    skip: 0,
    limit: 30,
    items,
    ...overrides,
  };
}

// ── Stats ──

export function createStats(overrides: Partial<Stats> = {}): Stats {
  return {
    total: 100,
    selected: 25,
    rejected: 60,
    pending: 15,
    ...overrides,
  };
}

// ── Source ──

export function createSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "src-001",
    name: "TechCrunch",
    url: "https://techcrunch.com/feed",
    source_type: "rss",
    tags: ["tech"],
    enabled: true,
    fetch_interval_minutes: 30,
    last_fetched_at: "2026-02-28T09:00:00Z",
    category: "科技媒体",
    fetch_since: null,
    pinned: false,
    pin_order: 0,
    ...overrides,
  };
}

// ── Settings ──

export function createAppSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    llm_enabled: true,
    llm_filter_prompt: "筛选 AI 相关的高质量文章",
    ...overrides,
  };
}

// ── LLM Config ──

export function createLlmConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    id: "llm-001",
    name: "GPT-4o-mini",
    model: "gpt-4o-mini",
    api_key: "sk-test-key",
    base_url: "https://api.openai.com/v1",
    is_active: true,
    created_at: "2026-02-28T08:00:00Z",
    ...overrides,
  };
}

// ── Filter Preset ──

export function createFilterPreset(overrides: Partial<FilterPreset> = {}): FilterPreset {
  return {
    id: "preset-001",
    name: "AI 核心",
    prompt: "仅保留与 AI 直接相关的文章",
    is_active: true,
    created_at: "2026-02-28T08:00:00Z",
    ...overrides,
  };
}

// ── Keyword Rule ──

export function createKeywordRule(overrides: Partial<KeywordRule> = {}): KeywordRule {
  return {
    id: "rule-001",
    keyword: "广告",
    field: "title",
    enabled: true,
    created_at: "2026-02-28T08:00:00Z",
    ...overrides,
  };
}

// ── Pipeline ──

export function createPipelineRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: "run-001",
    started_at: "2026-02-28T10:00:00Z",
    finished_at: "2026-02-28T10:05:00Z",
    logs: ["[INFO] Pipeline started", "[INFO] Fetched 10 articles", "[INFO] Pipeline done"],
    stats: { fetched: 10, analyzed: 8, selected: 3 },
    status: "done",
    ...overrides,
  };
}

export function createPipelineStatus(overrides: Partial<PipelineStatus> = {}): PipelineStatus {
  return {
    running: false,
    logs: [],
    stats: null,
    ...overrides,
  };
}

// ── Cache ──

export function createCacheSourceStat(overrides: Partial<CacheSourceStat> = {}): CacheSourceStat {
  return {
    source_name: "TechCrunch",
    source_id: "src-001",
    article_count: 50,
    estimated_bytes: 102400,
    ...overrides,
  };
}

export function createCacheStats(overrides: Partial<CacheStats> = {}): CacheStats {
  return {
    db_file_size_bytes: 524288,
    total_articles: 100,
    article_total_bytes: 409600,
    other_bytes: 114688,
    sources: [createCacheSourceStat()],
    ...overrides,
  };
}

// ── Source Counts ──

export function createSourceCount(overrides: Partial<SourceCount> = {}): SourceCount {
  return {
    source_name: "TechCrunch",
    count: 25,
    ...overrides,
  };
}

/**
 * 批量生成文章列表
 */
export function createArticleList(count: number, baseOverrides: Partial<Article> = {}): Article[] {
  return Array.from({ length: count }, (_, i) =>
    createArticle({
      id: `art-${String(i + 1).padStart(3, "0")}`,
      url: `https://example.com/article-${i + 1}`,
      url_hash: `hash${String(i + 1).padStart(3, "0")}`,
      raw_title: `Article ${i + 1}`,
      analysis: createAnalysis({ title: `文章标题 ${i + 1}` }),
      ...baseOverrides,
    }),
  );
}
