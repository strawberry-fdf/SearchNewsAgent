/**
 * ArticleCard 组件单元测试
 * 验证卡片/紧凑模式渲染、收藏操作、标签编辑、删除、选择模式等功能。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArticleCard from "@/components/ArticleCard";
import { createArticle, createAnalysis } from "./fixtures";

const defaultHandlers = {
  onToggleStar: vi.fn(),
  onUpdateUserTags: vi.fn(),
  onDelete: vi.fn(),
};

describe("ArticleCard — 完整卡片模式", () => {
  it("渲染 LLM 分析标题和摘要", () => {
    const article = createArticle({
      analysis: createAnalysis({ title: "重磅模型发布", summary: "突破性进展" }),
    });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("重磅模型发布")).toBeInTheDocument();
    expect(screen.getByText("突破性进展")).toBeInTheDocument();
  });

  it("无 analysis 时回退到 raw_title", () => {
    const article = createArticle({ analysis: null, raw_title: "原始标题" });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("原始标题")).toBeInTheDocument();
  });

  it("无 analysis 也无 raw_title 时回退到 URL", () => {
    const article = createArticle({
      analysis: null,
      raw_title: null,
      url: "https://example.com/fallback",
    });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("https://example.com/fallback")).toBeInTheDocument();
  });

  it("渲染分类标签", () => {
    const article = createArticle({
      analysis: createAnalysis({ category: "论文/研究" }),
    });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("论文/研究")).toBeInTheDocument();
  });

  it("渲染 AI 标签（最多 3 个）", () => {
    const article = createArticle({
      analysis: createAnalysis({ tags: ["tag1", "tag2", "tag3", "tag4"] }),
    });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("tag1")).toBeInTheDocument();
    expect(screen.getByText("tag2")).toBeInTheDocument();
    expect(screen.getByText("tag3")).toBeInTheDocument();
    expect(screen.queryByText("tag4")).not.toBeInTheDocument();
  });

  it("渲染双分数徽章 (IMP + AI)", () => {
    const article = createArticle({
      analysis: createAnalysis({ importance: 90, ai_relevance: 85 }),
    });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("IMP")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("渲染信源名称", () => {
    const article = createArticle({ source_name: "Hacker News" });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("Hacker News")).toBeInTheDocument();
  });

  it("hideSource 为 true 时不渲染信源名称", () => {
    const article = createArticle({ source_name: "Hacker News" });
    render(<ArticleCard article={article} {...defaultHandlers} hideSource />);
    expect(screen.queryByText("Hacker News")).not.toBeInTheDocument();
  });

  it("标题链接指向文章 URL 并在新窗口打开", () => {
    const article = createArticle({ url: "https://example.com/test" });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/test");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("点击收藏按钮调用 onToggleStar", async () => {
    const user = userEvent.setup();
    const onToggleStar = vi.fn();
    const article = createArticle({ url_hash: "test-hash" });
    render(<ArticleCard article={article} {...defaultHandlers} onToggleStar={onToggleStar} />);

    // 找到 Star 按钮
    const starButtons = screen.getAllByRole("button");
    const starBtn = starButtons.find((btn) => btn.querySelector("svg.lucide-star") !== null);
    if (starBtn) {
      await user.click(starBtn);
      expect(onToggleStar).toHaveBeenCalledWith("test-hash");
    }
  });

  it("已收藏文章的 Star 图标有填充样式", () => {
    const article = createArticle({ starred: true });
    const { container } = render(<ArticleCard article={article} {...defaultHandlers} />);
    const starIcon = container.querySelector(".fill-yellow-400");
    expect(starIcon).not.toBeNull();
  });

  it("selected 状态文章显示右上角三角标识", () => {
    const article = createArticle({ status: "selected" });
    const { container } = render(<ArticleCard article={article} {...defaultHandlers} />);
    // 检查 absolute 定位的三角标识
    const indicator = container.querySelector(".border-t-dark-accent");
    expect(indicator).not.toBeNull();
  });

  it("无 analysis 时显示「原始」标签", () => {
    const article = createArticle({ analysis: null });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("原始")).toBeInTheDocument();
  });
});

describe("ArticleCard — 紧凑模式", () => {
  it("只显示标题、时间，不显示摘要和分数", () => {
    const article = createArticle({
      analysis: createAnalysis({ title: "紧凑标题", summary: "摘要内容" }),
    });
    render(<ArticleCard article={article} {...defaultHandlers} compact />);
    expect(screen.getByText("紧凑标题")).toBeInTheDocument();
    expect(screen.queryByText("摘要内容")).not.toBeInTheDocument();
    expect(screen.queryByText("IMP")).not.toBeInTheDocument();
  });

  it("紧凑模式下标题可点击跳转", () => {
    const article = createArticle({ url: "https://example.com/compact" });
    render(<ArticleCard article={article} {...defaultHandlers} compact />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/compact");
  });
});

describe("ArticleCard — 选择模式", () => {
  it("selectionMode 时显示复选框而非收藏按钮", () => {
    const article = createArticle();
    const { container } = render(
      <ArticleCard article={article} {...defaultHandlers} selectionMode />,
    );
    // 复选框元素存在
    const checkbox = container.querySelector(".rounded.border-2");
    expect(checkbox).not.toBeNull();
  });

  it("selected 时复选框高亮", () => {
    const article = createArticle();
    const { container } = render(
      <ArticleCard article={article} {...defaultHandlers} selectionMode selected />,
    );
    const checkbox = container.querySelector(".bg-dark-accent.border-dark-accent");
    expect(checkbox).not.toBeNull();
  });

  it("点击复选框调用 onToggleSelect", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const article = createArticle({ url_hash: "sel-hash" });
    render(
      <ArticleCard
        article={article}
        {...defaultHandlers}
        selectionMode
        onToggleSelect={onToggleSelect}
      />,
    );

    // 在卡片模式下找到复选框按钮
    const buttons = screen.getAllByRole("button");
    // 第一个按钮是 checkbox
    await user.click(buttons[0]);
    expect(onToggleSelect).toHaveBeenCalledWith("sel-hash");
  });
});

describe("ArticleCard — 用户标签编辑", () => {
  it("已有标签正确渲染", () => {
    const article = createArticle({ user_tags: ["重要", "跟进"] });
    render(<ArticleCard article={article} {...defaultHandlers} />);
    expect(screen.getByText("重要")).toBeInTheDocument();
    expect(screen.getByText("跟进")).toBeInTheDocument();
  });

  it("点击添加按钮显示输入框", async () => {
    const user = userEvent.setup();
    const article = createArticle({ user_tags: [] });
    render(<ArticleCard article={article} {...defaultHandlers} />);

    // 找到 Plus 按钮
    const addButton = screen.getByTitle("添加标签");
    await user.click(addButton);

    const input = screen.getByPlaceholderText("输入标签...");
    expect(input).toBeInTheDocument();
  });

  it("输入标签后回车触发 onUpdateUserTags", async () => {
    const user = userEvent.setup();
    const onUpdateUserTags = vi.fn();
    const article = createArticle({ url_hash: "tag-hash", user_tags: ["旧标签"] });
    render(
      <ArticleCard article={article} {...defaultHandlers} onUpdateUserTags={onUpdateUserTags} />,
    );

    await user.click(screen.getByTitle("添加标签"));
    const input = screen.getByPlaceholderText("输入标签...");
    await user.type(input, "新标签{enter}");

    expect(onUpdateUserTags).toHaveBeenCalledWith("tag-hash", ["旧标签", "新标签"]);
  });

  it("删除已有标签触发 onUpdateUserTags（移除该标签）", async () => {
    const user = userEvent.setup();
    const onUpdateUserTags = vi.fn();
    const article = createArticle({ url_hash: "tag-hash", user_tags: ["标签A", "标签B"] });
    render(
      <ArticleCard article={article} {...defaultHandlers} onUpdateUserTags={onUpdateUserTags} />,
    );

    // 点击第一个标签的删除按钮（X）
    const tag = screen.getByText("标签A");
    const removeBtn = tag.parentElement!.querySelector("button")!;
    await user.click(removeBtn);

    expect(onUpdateUserTags).toHaveBeenCalledWith("tag-hash", ["标签B"]);
  });

  it("不重复添加已有标签", async () => {
    const user = userEvent.setup();
    const onUpdateUserTags = vi.fn();
    const article = createArticle({ url_hash: "tag-hash", user_tags: ["已有"] });
    render(
      <ArticleCard article={article} {...defaultHandlers} onUpdateUserTags={onUpdateUserTags} />,
    );

    await user.click(screen.getByTitle("添加标签"));
    const input = screen.getByPlaceholderText("输入标签...");
    await user.type(input, "已有{enter}");

    // 不应触发更新，因为标签已存在
    expect(onUpdateUserTags).not.toHaveBeenCalled();
  });
});
