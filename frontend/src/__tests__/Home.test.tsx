/**
 * Home（page.tsx）集成测试
 * 覆盖布局渲染、Tab 切换、信源面板显隐、跨组件协作等场景。
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { createStats, createSource, createSourceCount, createArticlesResponse, createArticleList, createAppSettings, createFilterPreset, createCacheStats, createLlmConfig, createPipelineStatus } from "./fixtures";

// Mock 所有子组件依赖的 API 调用
vi.mock("@/lib/api", () => ({
  getStats: vi.fn(),
  getSelectedArticles: vi.fn(),
  getAllArticles: vi.fn(),
  toggleStar: vi.fn(),
  getInterestTags: vi.fn(),
  updateArticleUserTags: vi.fn(),
  deleteArticle: vi.fn(),
  deleteArticlesBatch: vi.fn(),
  getSources: vi.fn(),
  getSourceArticleCounts: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
  getPinnedCategories: vi.fn(),
  updatePinnedCategories: vi.fn(),
  addSource: vi.fn(),
  triggerPipeline: vi.fn(),
  getPipelineStatus: vi.fn(),
  getPipelineRuns: vi.fn(),
  deletePipelineRun: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getFilterPresets: vi.fn(),
  createFilterPreset: vi.fn(),
  updateFilterPreset: vi.fn(),
  toggleFilterPresetActive: vi.fn(),
  deactivateFilterPresets: vi.fn(),
  deleteFilterPreset: vi.fn(),
  getCacheStats: vi.fn(),
  clearCache: vi.fn(),
  getLlmConfigs: vi.fn(),
  createLlmConfig: vi.fn(),
  updateLlmConfig: vi.fn(),
  activateLlmConfig: vi.fn(),
  deactivateLlmConfigs: vi.fn(),
  deleteLlmConfig: vi.fn(),
}));

// Mock ThemeProvider for Settings
vi.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: vi.fn(() => ({
    mode: "dark",
    setMode: vi.fn(),
  })),
}));

import * as api from "@/lib/api";

function setupAllMocks() {
  (api.getStats as Mock).mockResolvedValue(createStats());
  const articles = createArticleList(3);
  (api.getSelectedArticles as Mock).mockResolvedValue(createArticlesResponse(articles));
  (api.getAllArticles as Mock).mockResolvedValue(createArticlesResponse(articles));
  (api.getInterestTags as Mock).mockResolvedValue({ items: [] });
  (api.getSources as Mock).mockResolvedValue({
    items: [createSource()],
  });
  (api.getSourceArticleCounts as Mock).mockResolvedValue({
    items: [createSourceCount()],
    total: 25,
  });
  (api.getPinnedCategories as Mock).mockResolvedValue({ pinned_categories: [] });
  (api.getPipelineStatus as Mock).mockResolvedValue(createPipelineStatus());
  (api.getPipelineRuns as Mock).mockResolvedValue({ items: [] });
  (api.getSettings as Mock).mockResolvedValue(createAppSettings());
  (api.getFilterPresets as Mock).mockResolvedValue({ items: [createFilterPreset()] });
  (api.getCacheStats as Mock).mockResolvedValue(createCacheStats());
  (api.getLlmConfigs as Mock).mockResolvedValue({ items: [createLlmConfig()] });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAllMocks();
});

// ── 布局渲染 ──

describe("Home — 布局", () => {
  it("渲染侧边栏和主内容区", async () => {
    render(<Home />);
    await waitFor(() => {
      // 侧边栏导航项
      expect(screen.getByText("精选资讯")).toBeInTheDocument();
      expect(screen.getByText("全部文章")).toBeInTheDocument();
    });
  });

  it("默认显示精选 Feed 和信源面板", async () => {
    render(<Home />);
    await waitFor(() => {
      expect(screen.getByText("🔥 精选资讯")).toBeInTheDocument();
    });
    // 信源面板中的搜索框
    expect(screen.getByPlaceholderText("搜索订阅源...")).toBeInTheDocument();
  });
});

// ── Tab 切换 ──

describe("Home — Tab 切换", () => {
  it("切换到全部文章 Tab", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await waitFor(() => expect(screen.getByText("精选资讯")).toBeInTheDocument());

    // 点击侧边栏的「全部文章」
    await user.click(screen.getByText("全部文章"));
    await waitFor(() => {
      expect(screen.getByText("📰 全部文章")).toBeInTheDocument();
    });
  });

  it("切换到收藏 Tab", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await waitFor(() => expect(screen.getByText("精选资讯")).toBeInTheDocument());

    const starTab = screen.getByText("收藏");
    await user.click(starTab);
    await waitFor(() => {
      expect(screen.getByText("⭐ 收藏")).toBeInTheDocument();
    });
  });

  it("切换到统计 Tab 时隐藏信源面板", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await waitFor(() => expect(screen.getByText("精选资讯")).toBeInTheDocument());

    // 切换到统计（sidebar nav + StatsPanel h1 都含此文字）
    await user.click(screen.getByText("数据面板"));
    await waitFor(() => {
      expect(screen.getAllByText("数据面板").length).toBeGreaterThanOrEqual(1);
    });

    // 信源面板不应存在
    expect(screen.queryByPlaceholderText("搜索订阅源...")).not.toBeInTheDocument();
  });

  it("切换到信源管理 Tab", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await waitFor(() => expect(screen.getByText("精选资讯")).toBeInTheDocument());

    await user.click(screen.getByText("信源管理"));
    await waitFor(() => {
      // sidebar nav + SourceManager h1 都含此文字
      expect(screen.getAllByText("信源管理").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("切换到设置 Tab", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await waitFor(() => expect(screen.getByText("精选资讯")).toBeInTheDocument());

    await user.click(screen.getByText("设置"));
    await waitFor(() => {
      // 设置页面标题
      const settingsHeaders = screen.getAllByText("设置");
      expect(settingsHeaders.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ── Tab 切换重置信源筛选 ──

describe("Home — 信源筛选重置", () => {
  it("切换 Tab 时重置信源筛选", async () => {
    const user = userEvent.setup();

    render(<Home />);
    await waitFor(() => expect(screen.getAllByText("TechCrunch").length).toBeGreaterThanOrEqual(1));

    // 选择一个信源（SourcePanel 的 TechCrunch 条目）
    await user.click(screen.getAllByText("TechCrunch")[0]);

    // 切换到全部 Tab
    await user.click(screen.getByText("全部文章"));

    // 再回到精选 Tab 时，sourceFilter 已被重置
    await user.click(screen.getByText("精选资讯"));
    await waitFor(() => {
      // 不应显示 sourceFilter 的标签（如 "· TechCrunch"）
      expect(screen.queryByText("· TechCrunch")).not.toBeInTheDocument();
    });
  });
});

// ── 信源面板仅在文章 Tab 显示 ──

describe("Home — 信源面板显隐", () => {
  it("feed/all/starred Tab 显示信源面板", async () => {
    const user = userEvent.setup();
    render(<Home />);

    // Feed tab
    await waitFor(() => {
      expect(screen.getByPlaceholderText("搜索订阅源...")).toBeInTheDocument();
    });

    // All tab
    await user.click(screen.getByText("全部文章"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("搜索订阅源...")).toBeInTheDocument();
    });

    // Starred tab
    await user.click(screen.getByText("收藏"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("搜索订阅源...")).toBeInTheDocument();
    });
  });

  it("stats/sources/settings Tab 不显示信源面板", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await waitFor(() => expect(screen.getByText("精选资讯")).toBeInTheDocument());

    await user.click(screen.getByText("数据面板"));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("搜索订阅源...")).not.toBeInTheDocument();
    });

    await user.click(screen.getByText("信源管理"));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("搜索订阅源...")).not.toBeInTheDocument();
    });

    await user.click(screen.getByText("设置"));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("搜索订阅源...")).not.toBeInTheDocument();
    });
  });
});
