/**
 * API 客户端单元测试
 * 验证所有 HTTP 请求的 URL、method、body、参数拼接逻辑，以及错误处理。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSelectedArticles,
  getAllArticles,
  toggleStar,
  getSourceArticleCounts,
  updateArticleUserTags,
  deleteArticle,
  deleteArticlesBatch,
  getStats,
  getSources,
  addSource,
  updateSource,
  deleteSource,
  getPinnedCategories,
  updatePinnedCategories,
  getSettings,
  updateSettings,
  getLlmConfigs,
  createLlmConfig,
  updateLlmConfig,
  activateLlmConfig,
  deactivateLlmConfigs,
  deleteLlmConfig,
  getInterestTags,
  addInterestTag,
  deleteInterestTag,
  getKeywordRules,
  addKeywordRule,
  toggleKeywordRule,
  deleteKeywordRule,
  getFilterPresets,
  createFilterPreset,
  updateFilterPreset,
  toggleFilterPresetActive,
  deactivateFilterPresets,
  deleteFilterPreset,
  triggerPipeline,
  getPipelineStatus,
  getPipelineRuns,
  deletePipelineRun,
  getCacheStats,
  clearCache,
} from "@/lib/api";

// ── Mock fetch ──

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });
  global.fetch = mockFetch as unknown as typeof fetch;
});

/** 辅助：解析最近一次 fetch 调用的 URL 和 init */
function lastCall() {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url: url as string, init: init as RequestInit | undefined };
}

function lastUrl() {
  return lastCall().url;
}

function lastMethod() {
  return lastCall().init?.method ?? "GET";
}

function lastBody() {
  const body = lastCall().init?.body;
  return body ? JSON.parse(body as string) : undefined;
}

// ════════════════════════════════════════════════════
// 文章相关接口
// ════════════════════════════════════════════════════

describe("文章接口", () => {
  describe("getSelectedArticles", () => {
    it("默认参数生成正确 URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0, skip: 0, limit: 30 }),
      });
      await getSelectedArticles();
      expect(lastUrl()).toBe("/api/articles/selected?skip=0&limit=30");
    });

    it("传入所有可选参数后 URL 包含完整 query 参数", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0, skip: 0, limit: 30 }),
      });
      await getSelectedArticles(10, 20, "模型发布", ["AI", "LLM"], "GPT", "importance", "asc", "TechCrunch");
      const url = lastUrl();
      expect(url).toContain("skip=10");
      expect(url).toContain("limit=20");
      expect(url).toContain("category=%E6%A8%A1%E5%9E%8B%E5%8F%91%E5%B8%83");
      expect(url).toContain("tags=AI%2CLLM");
      expect(url).toContain("keyword=GPT");
      expect(url).toContain("sort_by=importance");
      expect(url).toContain("sort_order=asc");
      expect(url).toContain("source_name=TechCrunch");
    });

    it("默认排序字段不生成 sort_by/sort_order 参数", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0, skip: 0, limit: 30 }),
      });
      await getSelectedArticles(0, 30, undefined, undefined, undefined, "fetched_at", "desc");
      const url = lastUrl();
      expect(url).not.toContain("sort_by");
      expect(url).not.toContain("sort_order");
    });
  });

  describe("getAllArticles", () => {
    it("传入 status 过滤参数", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0, skip: 0, limit: 50 }),
      });
      await getAllArticles(0, 50, "selected");
      expect(lastUrl()).toContain("status=selected");
    });

    it("传入 keyword 和 sourceName", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0, skip: 0, limit: 50 }),
      });
      await getAllArticles(0, 50, undefined, "fetched_at", "desc", "test", "Source1");
      const url = lastUrl();
      expect(url).toContain("keyword=test");
      expect(url).toContain("source_name=Source1");
    });
  });

  describe("toggleStar", () => {
    it("发送 POST 请求到正确的 URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ starred: true }),
      });
      const result = await toggleStar("hash123");
      expect(lastUrl()).toBe("/api/articles/hash123/star");
      expect(lastMethod()).toBe("POST");
      expect(result).toEqual({ starred: true });
    });
  });

  describe("getSourceArticleCounts", () => {
    it("无参数时不添加 query string", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 0, items: [] }),
      });
      await getSourceArticleCounts();
      expect(lastUrl()).toBe("/api/articles/source-counts");
    });

    it("传入 status 时添加到 query", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 10, items: [] }),
      });
      await getSourceArticleCounts("selected");
      expect(lastUrl()).toBe("/api/articles/source-counts?status=selected");
    });
  });

  describe("updateArticleUserTags", () => {
    it("发送 PUT 请求并携带正确的 body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "ok", tags: ["tag1"] }),
      });
      await updateArticleUserTags("hash001", ["tag1"]);
      expect(lastUrl()).toBe("/api/articles/hash001/user-tags");
      expect(lastMethod()).toBe("PUT");
      expect(lastBody()).toEqual({ tags: ["tag1"] });
    });
  });

  describe("deleteArticle", () => {
    it("发送 DELETE 请求", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await deleteArticle("hash001");
      expect(lastUrl()).toBe("/api/articles/hash001");
      expect(lastMethod()).toBe("DELETE");
    });
  });

  describe("deleteArticlesBatch", () => {
    it("发送 POST 请求并携带 url_hashes 数组", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "ok", deleted: 3 }),
      });
      await deleteArticlesBatch(["h1", "h2", "h3"]);
      expect(lastUrl()).toBe("/api/articles/batch-delete");
      expect(lastMethod()).toBe("POST");
      expect(lastBody()).toEqual({ url_hashes: ["h1", "h2", "h3"] });
    });
  });
});

// ════════════════════════════════════════════════════
// 统计总览
// ════════════════════════════════════════════════════

describe("统计接口", () => {
  it("getStats 请求正确的 URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 100, selected: 25, rejected: 60, pending: 15 }),
    });
    const stats = await getStats();
    expect(lastUrl()).toBe("/api/stats");
    expect(stats.total).toBe(100);
  });
});

// ════════════════════════════════════════════════════
// 信源管理
// ════════════════════════════════════════════════════

describe("信源接口", () => {
  it("getSources 请求 GET /api/sources", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    await getSources();
    expect(lastUrl()).toBe("/api/sources");
  });

  it("addSource 发送 POST 并携带完整 body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", id: "new-id" }),
    });
    await addSource({
      name: "New Source",
      url: "https://example.com/feed",
      source_type: "rss",
      tags: ["tech"],
      category: "科技",
      fetch_since: "2026-01-01",
    });
    expect(lastMethod()).toBe("POST");
    expect(lastBody()).toEqual({
      name: "New Source",
      url: "https://example.com/feed",
      source_type: "rss",
      tags: ["tech"],
      category: "科技",
      fetch_since: "2026-01-01",
    });
  });

  it("updateSource 发送 PATCH 到具体 sourceId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }),
    });
    await updateSource("src-001", { enabled: false, name: "Updated" });
    expect(lastUrl()).toBe("/api/sources/src-001");
    expect(lastMethod()).toBe("PATCH");
    expect(lastBody()).toEqual({ enabled: false, name: "Updated" });
  });

  it("deleteSource 发送 DELETE 并将 URL 编码", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await deleteSource("https://example.com/feed?rss=1");
    expect(lastUrl()).toContain("/api/sources?url=");
    expect(lastMethod()).toBe("DELETE");
    expect(lastUrl()).toContain(encodeURIComponent("https://example.com/feed?rss=1"));
  });
});

// ════════════════════════════════════════════════════
// 分类置顶
// ════════════════════════════════════════════════════

describe("分类置顶接口", () => {
  it("getPinnedCategories 请求正确 URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ pinned_categories: ["科技"] }),
    });
    const result = await getPinnedCategories();
    expect(lastUrl()).toBe("/api/sources/pinned-categories");
    expect(result.pinned_categories).toEqual(["科技"]);
  });

  it("updatePinnedCategories 发送 PUT", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", pinned_categories: ["科技", "AI"] }),
    });
    await updatePinnedCategories(["科技", "AI"]);
    expect(lastMethod()).toBe("PUT");
    expect(lastBody()).toEqual({ pinned_categories: ["科技", "AI"] });
  });
});

// ════════════════════════════════════════════════════
// LLM 配置管理
// ════════════════════════════════════════════════════

describe("LLM 配置接口", () => {
  it("getLlmConfigs 请求 GET /api/llm-configs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    await getLlmConfigs();
    expect(lastUrl()).toBe("/api/llm-configs");
  });

  it("createLlmConfig 发送 POST", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", id: "llm-new" }),
    });
    await createLlmConfig({
      name: "Test",
      provider: "openai",
      model: "gpt-4",
      api_key: "sk-xxx",
      base_url: "https://api.openai.com/v1",
    });
    expect(lastMethod()).toBe("POST");
    expect(lastBody().model).toBe("gpt-4");
  });

  it("activateLlmConfig 发送 POST 到 /activate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", active_id: "llm-001" }),
    });
    await activateLlmConfig("llm-001");
    expect(lastUrl()).toBe("/api/llm-configs/llm-001/activate");
    expect(lastMethod()).toBe("POST");
  });

  it("deactivateLlmConfigs 发送 POST 到 /deactivate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }),
    });
    await deactivateLlmConfigs();
    expect(lastUrl()).toBe("/api/llm-configs/deactivate");
  });

  it("deleteLlmConfig 发送 DELETE", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await deleteLlmConfig("llm-001");
    expect(lastUrl()).toBe("/api/llm-configs/llm-001");
    expect(lastMethod()).toBe("DELETE");
  });
});

// ════════════════════════════════════════════════════
// 筛选预设
// ════════════════════════════════════════════════════

describe("筛选预设接口", () => {
  it("getFilterPresets 请求 GET", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    await getFilterPresets();
    expect(lastUrl()).toBe("/api/filter-presets");
  });

  it("createFilterPreset 发送 POST 含 name 和 prompt", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", id: "preset-new" }),
    });
    await createFilterPreset("测试预设", "仅保留 AI 文章");
    expect(lastBody()).toEqual({ name: "测试预设", prompt: "仅保留 AI 文章" });
  });

  it("toggleFilterPresetActive 发送 POST 到 /toggle-active", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", is_active: true }),
    });
    await toggleFilterPresetActive("preset-001");
    expect(lastUrl()).toBe("/api/filter-presets/preset-001/toggle-active");
    expect(lastMethod()).toBe("POST");
  });

  it("deactivateFilterPresets 发送 POST", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }),
    });
    await deactivateFilterPresets();
    expect(lastUrl()).toBe("/api/filter-presets/deactivate");
  });

  it("deleteFilterPreset 发送 DELETE", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await deleteFilterPreset("preset-001");
    expect(lastMethod()).toBe("DELETE");
    expect(lastUrl()).toBe("/api/filter-presets/preset-001");
  });
});

// ════════════════════════════════════════════════════
// 兴趣标签
// ════════════════════════════════════════════════════

describe("兴趣标签接口", () => {
  it("addInterestTag 发送 POST 并返回结果", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", tag: "AI" }),
    });
    const result = await addInterestTag("AI");
    expect(lastBody()).toEqual({ tag: "AI" });
    expect(result.tag).toBe("AI");
  });

  it("deleteInterestTag 将标签名 URL 编码", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await deleteInterestTag("机器学习");
    expect(lastUrl()).toContain(encodeURIComponent("机器学习"));
    expect(lastMethod()).toBe("DELETE");
  });
});

// ════════════════════════════════════════════════════
// 关键词规则
// ════════════════════════════════════════════════════

describe("关键词规则接口", () => {
  it("addKeywordRule 默认 field=title", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", id: "rule-new" }),
    });
    await addKeywordRule("广告");
    expect(lastBody()).toEqual({ keyword: "广告", field: "title" });
  });

  it("toggleKeywordRule 发送 PATCH 到 /toggle", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ enabled: false }),
    });
    await toggleKeywordRule("rule-001");
    expect(lastUrl()).toBe("/api/rules/rule-001/toggle");
    expect(lastMethod()).toBe("PATCH");
  });
});

// ════════════════════════════════════════════════════
// Pipeline 管理
// ════════════════════════════════════════════════════

describe("Pipeline 接口", () => {
  it("triggerPipeline 发送 POST", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }),
    });
    await triggerPipeline();
    expect(lastUrl()).toBe("/api/admin/run-pipeline");
    expect(lastMethod()).toBe("POST");
  });

  it("getPipelineStatus 返回运行状态", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ running: true, logs: ["running..."], stats: null }),
    });
    const status = await getPipelineStatus();
    expect(status.running).toBe(true);
  });

  it("deletePipelineRun 发送 DELETE", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await deletePipelineRun("run-001");
    expect(lastUrl()).toBe("/api/admin/pipeline-runs/run-001");
    expect(lastMethod()).toBe("DELETE");
  });
});

// ════════════════════════════════════════════════════
// 缓存管理
// ════════════════════════════════════════════════════

describe("缓存管理接口", () => {
  it("getCacheStats 请求 GET", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ db_file_size_bytes: 0, total_articles: 0, article_total_bytes: 0, other_bytes: 0, sources: [] }),
    });
    await getCacheStats();
    expect(lastUrl()).toBe("/api/cache/stats");
  });

  it("clearCache 不传 sourceIds 时发送 null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", deleted: 100 }),
    });
    await clearCache();
    expect(lastBody()).toEqual({ source_ids: null });
  });

  it("clearCache 传入 sourceIds 数组", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", deleted: 50 }),
    });
    await clearCache(["src-001", "src-002"]);
    expect(lastBody()).toEqual({ source_ids: ["src-001", "src-002"] });
  });
});

// ════════════════════════════════════════════════════
// 错误处理
// ════════════════════════════════════════════════════

describe("API 错误处理", () => {
  it("非 2xx 响应时抛出 Error，错误信息包含状态码", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });
    await expect(getStats()).rejects.toThrow("API error: 500 Internal Server Error");
  });

  it("404 错误也被正确捕获", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({}),
    });
    await expect(getSources()).rejects.toThrow("API error: 404 Not Found");
  });

  it("网络错误（fetch 本身 reject）被透传", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(getStats()).rejects.toThrow("Failed to fetch");
  });
});
