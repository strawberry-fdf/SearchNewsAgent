/**
 * API 客户端 —— 封装所有与 FastAPI 后端的 HTTP 通信。
 *
 * 接口分组:
 *   - Articles:  文章列表 / 收藏 / 删除 / 标签
 *   - Stats:     统计总览
 *   - Sources:   信源增删改查
 *   - Settings:  全局配置
 *   - Interest Tags: 兴趣标签
 *   - Keyword Rules: 关键词过滤规则
 *   - Filter Presets: 筛选预设方案
 *   - Admin:     Pipeline 触发 / 状态 / 执行历史
 */

export interface ArticleAnalysis {
  title: string;
  summary: string;
  category: string;
  ai_relevance: number;
  importance: number;
  model_selected: boolean;
  tags: string[];
}

export interface Article {
  id: string;
  url: string;
  url_hash: string;
  source_name: string;
  status: string;
  rejection_reason: string;
  starred: boolean;
  fetched_at: string;
  analyzed_at: string | null;
  published_at: string | null;
  raw_title: string | null;
  user_tags: string[];
  analysis: ArticleAnalysis | null;
}

export interface ArticlesResponse {
  total: number;
  skip: number;
  limit: number;
  items: Article[];
}

export interface Stats {
  total: number;
  selected: number;
  rejected: number;
  pending: number;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  source_type: string;
  tags: string[];
  enabled: boolean;
  fetch_interval_minutes: number;
  last_fetched_at: string | null;
  category: string;
  fetch_since: string | null; // ISO date string, e.g. "2024-10-01"
  pinned: boolean;
  pin_order: number;
}

export interface AppSettings {
  llm_enabled: boolean;
  llm_filter_prompt: string;
}

export interface LlmConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  is_active: boolean;
  created_at: string;
}

export interface LlmProvider {
  provider: string;
  label: string;
  default_base_url: string;
  docs_url: string;
  static_models: string[];
  discovery_style: string;
  auth_scheme: string;
}

export interface ProviderModelsResponse {
  provider: string;
  models: string[];
  source: string;
  default_base_url: string;
  used_base_url: string;
  error: string | null;
}

export interface KeywordRule {
  id: string;
  keyword: string;
  field: string;
  enabled: boolean;
  created_at: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  prompt: string;
  is_active: boolean;
  created_at: string;
}

export interface PipelineRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  logs: string[];
  stats: Record<string, number>;
  status: "done" | "error" | "running";
}

const BASE = "";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── 文章相关接口 ──

export async function getSelectedArticles(
  skip = 0,
  limit = 30,
  category?: string,
  tags?: string[],
  keyword?: string,
  sortBy = "fetched_at",
  sortOrder = "desc",
  sourceName?: string,
): Promise<ArticlesResponse> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  if (category) params.set("category", category);
  if (tags && tags.length > 0) params.set("tags", tags.join(","));
  if (keyword) params.set("keyword", keyword);
  if (sortBy !== "fetched_at") params.set("sort_by", sortBy);
  if (sortOrder !== "desc") params.set("sort_order", sortOrder);
  if (sourceName) params.set("source_name", sourceName);
  return fetchJSON(`/api/articles/selected?${params}`);
}

export async function getAllArticles(
  skip = 0,
  limit = 50,
  status?: string,
  sortBy = "fetched_at",
  sortOrder = "desc",
  keyword?: string,
  sourceName?: string,
): Promise<ArticlesResponse> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  if (status) params.set("status", status);
  if (sortBy !== "fetched_at") params.set("sort_by", sortBy);
  if (sortOrder !== "desc") params.set("sort_order", sortOrder);
  if (keyword) params.set("keyword", keyword);
  if (sourceName) params.set("source_name", sourceName);
  return fetchJSON(`/api/articles?${params}`);
}

export async function toggleStar(urlHash: string): Promise<{ starred: boolean }> {
  return fetchJSON(`/api/articles/${urlHash}/star`, { method: "POST" });
}

// ── 信源文章计数 ──

export interface SourceCount {
  source_name: string;
  count: number;
}

export async function getSourceArticleCounts(
  status?: string,
  starred?: boolean,
): Promise<{ total: number; items: SourceCount[] }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (starred !== undefined) params.set("starred", String(starred));
  const qs = params.toString();
  return fetchJSON(`/api/articles/source-counts${qs ? `?${qs}` : ""}`);
}

export async function updateArticleUserTags(
  urlHash: string,
  tags: string[]
): Promise<{ status: string; tags: string[] }> {
  return fetchJSON(`/api/articles/${urlHash}/user-tags`, {
    method: "PUT",
    body: JSON.stringify({ tags }),
  });
}

export async function deleteArticle(urlHash: string): Promise<void> {
  await fetchJSON(`/api/articles/${urlHash}`, { method: "DELETE" });
}

export async function deleteArticlesBatch(
  urlHashes: string[]
): Promise<{ status: string; deleted: number }> {
  return fetchJSON("/api/articles/batch-delete", {
    method: "POST",
    body: JSON.stringify({ url_hashes: urlHashes }),
  });
}

// ── 统计总览 ──

export async function getStats(): Promise<Stats> {
  return fetchJSON("/api/stats");
}

// ── 信源管理 ──

export async function getSources(): Promise<{ items: Source[] }> {
  return fetchJSON("/api/sources");
}

export async function addSource(source: {
  name: string;
  url: string;
  source_type: string;
  tags: string[];
  category?: string;
  fetch_since?: string | null;
}): Promise<{ status: string; id: string }> {
  return fetchJSON("/api/sources", {
    method: "POST",
    body: JSON.stringify(source),
  });
}

export async function updateSource(
  sourceId: string,
  updates: {
    enabled?: boolean;
    category?: string;
    name?: string;
    url?: string;
    tags?: string[];
    fetch_interval_minutes?: number;
    fetch_since?: string | null;
    pinned?: boolean;
    pin_order?: number;
  }
): Promise<{ status: string }> {
  return fetchJSON(`/api/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteSource(url: string): Promise<void> {
  await fetchJSON(`/api/sources?url=${encodeURIComponent(url)}`, {
    method: "DELETE",
  });
}

// ── 分类置顶管理 ──

export async function getPinnedCategories(): Promise<{ pinned_categories: string[] }> {
  return fetchJSON("/api/sources/pinned-categories");
}

export async function updatePinnedCategories(
  pinnedCategories: string[]
): Promise<{ status: string; pinned_categories: string[] }> {
  return fetchJSON("/api/sources/pinned-categories", {
    method: "PUT",
    body: JSON.stringify({ pinned_categories: pinnedCategories }),
  });
}

// ── 全局配置 ──

export async function getSettings(): Promise<AppSettings> {
  return fetchJSON("/api/settings");
}

export async function updateSettings(
  settings: Partial<AppSettings>
): Promise<AppSettings> {
  return fetchJSON("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// ── LLM 配置管理 ──

export async function getLlmConfigs(): Promise<{ items: LlmConfig[] }> {
  return fetchJSON("/api/llm-configs");
}

export async function createLlmConfig(data: {
  name: string;
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
}): Promise<{ status: string; id: string }> {
  return fetchJSON("/api/llm-configs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateLlmConfig(
  configId: string,
  updates: { name?: string; provider?: string; model?: string; api_key?: string; base_url?: string }
): Promise<{ status: string }> {
  return fetchJSON(`/api/llm-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function getLlmProviders(): Promise<{ items: LlmProvider[] }> {
  return fetchJSON("/api/llm-providers");
}

export async function discoverProviderModels(
  provider: string,
  data: { api_key: string; base_url?: string }
): Promise<ProviderModelsResponse> {
  return fetchJSON(`/api/llm-providers/${provider}/models`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function activateLlmConfig(
  configId: string
): Promise<{ status: string; active_id: string }> {
  return fetchJSON(`/api/llm-configs/${configId}/activate`, { method: "POST" });
}

export async function deactivateLlmConfigs(): Promise<{ status: string }> {
  return fetchJSON("/api/llm-configs/deactivate", { method: "POST" });
}

export async function deleteLlmConfig(configId: string): Promise<void> {
  await fetchJSON(`/api/llm-configs/${configId}`, { method: "DELETE" });
}

// ── 兴趣标签 ──

export async function getInterestTags(): Promise<{ items: string[] }> {
  return fetchJSON("/api/tags");
}

export async function addInterestTag(
  tag: string
): Promise<{ status: string; tag: string }> {
  return fetchJSON("/api/tags", {
    method: "POST",
    body: JSON.stringify({ tag }),
  });
}

export async function deleteInterestTag(tag: string): Promise<void> {
  await fetchJSON(`/api/tags/${encodeURIComponent(tag)}`, { method: "DELETE" });
}

// ── 关键词过滤规则 ──

export async function getKeywordRules(): Promise<{ items: KeywordRule[] }> {
  return fetchJSON("/api/rules");
}

export async function addKeywordRule(
  keyword: string,
  field = "title"
): Promise<{ status: string; id: string }> {
  return fetchJSON("/api/rules", {
    method: "POST",
    body: JSON.stringify({ keyword, field }),
  });
}

export async function toggleKeywordRule(
  ruleId: string
): Promise<{ enabled: boolean }> {
  return fetchJSON(`/api/rules/${ruleId}/toggle`, { method: "PATCH" });
}

export async function deleteKeywordRule(ruleId: string): Promise<void> {
  await fetchJSON(`/api/rules/${ruleId}`, { method: "DELETE" });
}

// ── 筛选预设方案 ──

export async function getFilterPresets(): Promise<{ items: FilterPreset[] }> {
  return fetchJSON("/api/filter-presets");
}

export async function createFilterPreset(
  name: string,
  prompt: string
): Promise<{ status: string; id: string }> {
  return fetchJSON("/api/filter-presets", {
    method: "POST",
    body: JSON.stringify({ name, prompt }),
  });
}

export async function updateFilterPreset(
  presetId: string,
  updates: { name?: string; prompt?: string }
): Promise<{ status: string }> {
  return fetchJSON(`/api/filter-presets/${presetId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function activateFilterPreset(
  presetId: string
): Promise<{ status: string; active_id: string }> {
  return fetchJSON(`/api/filter-presets/${presetId}/activate`, { method: "POST" });
}

export async function toggleFilterPresetActive(
  presetId: string
): Promise<{ status: string; is_active: boolean }> {
  return fetchJSON(`/api/filter-presets/${presetId}/toggle-active`, { method: "POST" });
}

export async function deactivateFilterPresets(): Promise<{ status: string }> {
  return fetchJSON("/api/filter-presets/deactivate", { method: "POST" });
}

export async function deleteFilterPreset(presetId: string): Promise<void> {
  await fetchJSON(`/api/filter-presets/${presetId}`, { method: "DELETE" });
}

// ── 管理端 (Pipeline 触发/状态) ──

export interface PipelineStatus {
  running: boolean;
  logs: string[];
  stats: Record<string, number> | null;
}

export async function triggerPipeline(): Promise<{ status: string }> {
  return fetchJSON("/api/admin/run-pipeline", { method: "POST" });
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  return fetchJSON("/api/admin/pipeline-status");
}

export async function getPipelineRuns(): Promise<{ items: PipelineRun[] }> {
  return fetchJSON("/api/admin/pipeline-runs");
}

export async function deletePipelineRun(runId: string): Promise<void> {
  await fetchJSON(`/api/admin/pipeline-runs/${runId}`, { method: "DELETE" });
}

// ── 文章缓存管理 ──

export interface CacheSourceStat {
  source_name: string;
  source_id: string | null;
  article_count: number;
  estimated_bytes: number;
}

export interface CacheStats {
  db_file_size_bytes: number;
  total_articles: number;
  article_total_bytes: number;
  other_bytes: number;
  sources: CacheSourceStat[];
}

export async function getCacheStats(): Promise<CacheStats> {
  return fetchJSON("/api/cache/stats");
}

export async function clearCache(
  sourceIds?: string[] | null,
): Promise<{ status: string; deleted: number }> {
  return fetchJSON("/api/cache/clear", {
    method: "POST",
    body: JSON.stringify({ source_ids: sourceIds ?? null }),
  });
}
