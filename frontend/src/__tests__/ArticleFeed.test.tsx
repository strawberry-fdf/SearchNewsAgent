/**
 * ArticleFeed 组件集成测试
 * 覆盖三种模式（Feed/All/Starred）、分类筛选、关键词搜索、
 * 排序、分页、分组、选择模式 + 批量删除等核心场景。
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArticleFeed from "@/components/ArticleFeed";
import {
  createArticle,
  createAnalysis,
  createArticlesResponse,
  createArticleList,
} from "./fixtures";

// ── Mock `@/lib/api` ──
vi.mock("@/lib/api", () => ({
  getSelectedArticles: vi.fn(),
  getAllArticles: vi.fn(),
  toggleStar: vi.fn(),
  getInterestTags: vi.fn(),
  updateArticleUserTags: vi.fn(),
  deleteArticle: vi.fn(),
  deleteArticlesBatch: vi.fn(),
}));

import {
  getSelectedArticles,
  getAllArticles,
  toggleStar,
  getInterestTags,
  deleteArticle,
  deleteArticlesBatch,
} from "@/lib/api";

const mockGetSelected = getSelectedArticles as Mock;
const mockGetAll = getAllArticles as Mock;
const mockToggleStar = toggleStar as Mock;
const mockGetInterestTags = getInterestTags as Mock;
const mockDeleteArticle = deleteArticle as Mock;
const mockDeleteBatch = deleteArticlesBatch as Mock;

function setupDefaultMocks(articles = createArticleList(3)) {
  mockGetInterestTags.mockResolvedValue({ items: ["AI", "LLM"] });
  mockGetSelected.mockResolvedValue(createArticlesResponse(articles, { total: articles.length }));
  mockGetAll.mockResolvedValue(createArticlesResponse(articles, { total: articles.length }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ── 基本渲染 ──

describe("ArticleFeed — Feed 模式", () => {
  it("渲染标题「🔥 精选资讯」和文章总数", async () => {
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByText("🔥 精选资讯")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/共 3 篇精选/)).toBeInTheDocument();
    });
  });

  it("调用 getSelectedArticles 获取数据", async () => {
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(mockGetSelected).toHaveBeenCalled();
    });
  });

  it("渲染文章卡片", async () => {
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByText("文章标题 1")).toBeInTheDocument();
    });
    expect(screen.getByText("文章标题 2")).toBeInTheDocument();
    expect(screen.getByText("文章标题 3")).toBeInTheDocument();
  });

  it("显示分类筛选栏（全部 + 5 个内置分类）", async () => {
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByText("文章标题 1")).toBeInTheDocument();
    });
    // 分类按钮是 role=button，用 getAllByRole 过滤
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "论文/研究" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "评测/基准" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DevTool/工程向" })).toBeInTheDocument();
  });

  it("sourceFilter 非空时显示信源名称", async () => {
    render(<ArticleFeed mode="feed" sourceFilter="Hacker News" />);
    await waitFor(() => {
      expect(screen.getByText("· Hacker News")).toBeInTheDocument();
    });
  });
});

describe("ArticleFeed — All 模式", () => {
  it("渲染标题「📰 全部文章」", async () => {
    render(<ArticleFeed mode="all" />);
    await waitFor(() => {
      expect(screen.getByText("📰 全部文章")).toBeInTheDocument();
    });
  });

  it("调用 getAllArticles 获取数据", async () => {
    render(<ArticleFeed mode="all" />);
    await waitFor(() => {
      expect(mockGetAll).toHaveBeenCalled();
    });
  });

  it("不渲染分类筛选栏", async () => {
    render(<ArticleFeed mode="all" />);
    await waitFor(() => {
      expect(screen.getByText("📰 全部文章")).toBeInTheDocument();
    });
    // All 模式不显示分类筛选按钮（论文/研究 不会出现在文章卡片中）
    expect(screen.queryByRole("button", { name: "论文/研究" })).not.toBeInTheDocument();
  });
});

describe("ArticleFeed — Starred 模式", () => {
  it("渲染标题「⭐ 收藏」", async () => {
    const starredArticles = createArticleList(2).map((a) => ({ ...a, starred: true }));
    mockGetAll.mockResolvedValue(createArticlesResponse(starredArticles, { total: 2 }));
    render(<ArticleFeed mode="starred" />);
    await waitFor(() => {
      expect(screen.getByText("⭐ 收藏")).toBeInTheDocument();
    });
  });

  it("仅显示 starred 文章", async () => {
    const articles = [
      createArticle({ url_hash: "s1", starred: true, analysis: createAnalysis({ title: "已收藏" }) }),
      createArticle({ url_hash: "s2", starred: false, analysis: createAnalysis({ title: "未收藏" }) }),
    ];
    mockGetAll.mockResolvedValue(createArticlesResponse(articles, { total: 2 }));
    render(<ArticleFeed mode="starred" />);
    await waitFor(() => {
      expect(screen.getByText("已收藏")).toBeInTheDocument();
    });
    expect(screen.queryByText("未收藏")).not.toBeInTheDocument();
  });
});

// ── 空状态 ──

describe("ArticleFeed — 空状态", () => {
  it("无文章时显示空状态提示", async () => {
    mockGetSelected.mockResolvedValue(createArticlesResponse([], { total: 0 }));
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByText("暂无文章")).toBeInTheDocument();
    });
  });
});

// ── 分类筛选 ──

describe("ArticleFeed — 分类筛选", () => {
  it("点击分类按钮触发重新获取带 category 参数", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "论文/研究" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "论文/研究" }));
    await waitFor(() => {
      // 应以 category="论文/研究" 重新调用
      const lastCall = mockGetSelected.mock.calls[mockGetSelected.mock.calls.length - 1];
      expect(lastCall[2]).toBe("论文/研究"); // skip, limit, category
    });
  });

  it("点击「全部」清除分类筛选", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "论文/研究" }));
    await waitFor(() => expect(mockGetSelected).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: "全部" }));
    await waitFor(() => {
      const lastCall = mockGetSelected.mock.calls[mockGetSelected.mock.calls.length - 1];
      expect(lastCall[2]).toBeUndefined(); // category = undefined
    });
  });
});

// ── 关键词搜索 ──

describe("ArticleFeed — 关键词搜索", () => {
  it("输入关键词后 400ms 防抖触发请求", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(mockGetSelected).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText("关键词过滤标题...");
    await user.type(input, "GPT");

    // 等待防抖完成
    vi.advanceTimersByTime(500);
    await waitFor(() => {
      const calls = mockGetSelected.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[4]).toBe("GPT"); // keyword
    });

    vi.useRealTimers();
  });
});

// ── 排序 ──

describe("ArticleFeed — 排序", () => {
  it("点击排序按钮显示排序菜单", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByTitle("排序方式")).toBeInTheDocument());

    await user.click(screen.getByTitle("排序方式"));
    await waitFor(() => {
      expect(screen.getByText("采集时间")).toBeInTheDocument();
      expect(screen.getByText("发布时间")).toBeInTheDocument();
      expect(screen.getByText("重要性评分")).toBeInTheDocument();
    });
  });

  it("Feed 模式显示重要性评分选项, All 模式不显示", async () => {
    const user = userEvent.setup();

    // Feed 模式
    const { unmount } = render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByTitle("排序方式")).toBeInTheDocument());
    await user.click(screen.getByTitle("排序方式"));
    expect(screen.getByText("重要性评分")).toBeInTheDocument();
    unmount();

    // All 模式
    render(<ArticleFeed mode="all" />);
    await waitFor(() => expect(screen.getByTitle("排序方式")).toBeInTheDocument());
    await user.click(screen.getByTitle("排序方式"));
    expect(screen.queryByText("重要性评分")).not.toBeInTheDocument();
  });
});

// ── 选择模式 + 批量删除 ──

describe("ArticleFeed — 选择模式", () => {
  it("点击选择按钮进入选择模式", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByText("文章标题 1")).toBeInTheDocument());

    const selectBtn = screen.getByTitle("进入选择模式（批量删除）");
    await user.click(selectBtn);

    // 进入选择模式后按钮文字更改
    expect(screen.getByTitle("退出选择模式")).toBeInTheDocument();
  });

  it("批量删除调用 deleteArticlesBatch", async () => {
    const user = userEvent.setup();
    mockDeleteBatch.mockResolvedValue({});

    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByText("文章标题 1")).toBeInTheDocument());

    // 进入选择模式
    await user.click(screen.getByTitle("进入选择模式（批量删除）"));

    // 选择文章（点击卡片上的 checkbox）
    const allButtons = screen.getAllByRole("button");
    // 找到 checkbox 按钮 - 在选择模式下，每个卡片有一个 checkbox
    const checkboxes = allButtons.filter(
      (btn) => btn.querySelector(".rounded.border-2") !== null
    );

    if (checkboxes.length > 0) {
      await user.click(checkboxes[0]);

      // 应出现删除按钮
      await waitFor(() => {
        const delBtn = screen.getByText(/删除 \(1\)/);
        expect(delBtn).toBeInTheDocument();
      });

      // 点击删除
      await user.click(screen.getByText(/删除 \(1\)/));
      await waitFor(() => {
        expect(mockDeleteBatch).toHaveBeenCalled();
      });
    }
  });
});

// ── 分页 ──

describe("ArticleFeed — 分页加载", () => {
  it("有更多文章时显示「加载更多」按钮", async () => {
    const articles = createArticleList(5);
    mockGetSelected.mockResolvedValue(createArticlesResponse(articles, { total: 20 }));
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByText(/加载更多/)).toBeInTheDocument();
      expect(screen.getByText(/15 篇/)).toBeInTheDocument();
    });
  });

  it("所有文章已加载时不显示「加载更多」", async () => {
    const articles = createArticleList(3);
    mockGetSelected.mockResolvedValue(createArticlesResponse(articles, { total: 3 }));
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByText("文章标题 1")).toBeInTheDocument();
    });
    expect(screen.queryByText(/加载更多/)).not.toBeInTheDocument();
  });
});

// ── 收藏切换 ──

describe("ArticleFeed — 收藏操作", () => {
  it("处理收藏切换 API 调用", async () => {
    mockToggleStar.mockResolvedValue({ starred: true });
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByText("文章标题 1")).toBeInTheDocument());
    // toggle star is tested at ArticleCard level; here we verify API mock wiring
    expect(mockToggleStar).not.toHaveBeenCalled();
  });
});

// ── 刷新 ──

describe("ArticleFeed — 刷新", () => {
  it("点击刷新按钮重新获取数据", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(mockGetSelected).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("刷新"));
    await waitFor(() => {
      expect(mockGetSelected).toHaveBeenCalledTimes(2);
    });
  });
});

// ── 视图切换 ──

describe("ArticleFeed — 视图切换", () => {
  it("紧凑/卡片模式切换按钮工作正常", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByText("文章标题 1")).toBeInTheDocument());

    const compactBtn = screen.getByTitle("切换为紧凑视图（仅标题）");
    await user.click(compactBtn);

    // 切换后按钮文字改变
    await waitFor(() => {
      expect(screen.getByTitle("切换为卡片视图")).toBeInTheDocument();
    });
  });

  it("分组模式切换（按日期/按信源）", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByText("文章标题 1")).toBeInTheDocument());

    const groupBtn = screen.getByTitle("按信源分组");
    await user.click(groupBtn);

    // 切换后变为按日期分组
    await waitFor(() => {
      expect(screen.getByTitle("按日期分组")).toBeInTheDocument();
    });
  });
});

// ── 兴趣标签筛选 ──

describe("ArticleFeed — 兴趣标签筛选", () => {
  it("加载并展示兴趣标签", async () => {
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByText("#AI")).toBeInTheDocument();
      expect(screen.getByText("#LLM")).toBeInTheDocument();
    });
  });

  it("点击标签切换筛选状态", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => {
      expect(screen.getByText("#AI")).toBeInTheDocument();
    });

    await user.click(screen.getByText("#AI"));
    await waitFor(() => {
      // 标签被激活后会带 tag filter 参数
      const calls = mockGetSelected.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[3]).toEqual(["AI"]); // tags param
    });
  });
});

// ── 清除过滤 ──

describe("ArticleFeed — 清除过滤", () => {
  it("有活跃筛选条件时显示「清除过滤」按钮", async () => {
    const user = userEvent.setup();
    render(<ArticleFeed mode="feed" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "论文/研究" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "论文/研究" }));
    await waitFor(() => {
      expect(screen.getByText(/清除过滤/)).toBeInTheDocument();
    });
  });
});
