/**
 * API client for communicating with the FastAPI backend.
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
}

export interface AppSettings {
  llm_enabled: boolean;
  llm_filter_prompt: string;
}

export interface KeywordRule {
  id: string;
  keyword: string;
  field: string;
  enabled: boolean;
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

// ── Articles ──

export async function getSelectedArticles(
  skip = 0,
  limit = 30,
  category?: string,
  tags?: string[],
  keyword?: string
): Promise<ArticlesResponse> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  if (category) params.set("category", category);
  if (tags && tags.length > 0) params.set("tags", tags.join(","));
  if (keyword) params.set("keyword", keyword);
  return fetchJSON(`/api/articles/selected?${params}`);
}

export async function getAllArticles(
  skip = 0,
  limit = 50,
  status?: string
): Promise<ArticlesResponse> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  if (status) params.set("status", status);
  return fetchJSON(`/api/articles?${params}`);
}

export async function toggleStar(urlHash: string): Promise<{ starred: boolean }> {
  return fetchJSON(`/api/articles/${urlHash}/star`, { method: "POST" });
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

// ── Stats ──

export async function getStats(): Promise<Stats> {
  return fetchJSON("/api/stats");
}

// ── Sources ──

export async function getSources(): Promise<{ items: Source[] }> {
  return fetchJSON("/api/sources");
}

export async function addSource(source: {
  name: string;
  url: string;
  source_type: string;
  tags: string[];
  category?: string;
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
    tags?: string[];
    fetch_interval_minutes?: number;
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

// ── Settings ──

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

// ── Interest Tags ──

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

// ── Keyword Rules ──

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

// ── Admin ──

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
