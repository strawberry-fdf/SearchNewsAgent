/**
 * API client for communicating with the FastAPI backend.
 * In development, requests are proxied via Next.js rewrites to localhost:8000.
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
}

const BASE = "";  // Uses Next.js rewrites in dev

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
  category?: string
): Promise<ArticlesResponse> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  if (category) params.set("category", category);
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
}): Promise<{ status: string; id: string }> {
  return fetchJSON("/api/sources", {
    method: "POST",
    body: JSON.stringify(source),
  });
}

export async function deleteSource(url: string): Promise<void> {
  await fetchJSON(`/api/sources?url=${encodeURIComponent(url)}`, {
    method: "DELETE",
  });
}

// ── Admin ──

export async function triggerPipeline(): Promise<{ status: string; stats: Record<string, number> }> {
  return fetchJSON("/api/admin/run-pipeline", { method: "POST" });
}
