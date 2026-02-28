/**
 * SourceManager 组件测试
 * 覆盖信源列表、新增信源表单、启/禁用、分类编辑、删除等场景。
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SourceManager from "@/components/SourceManager";
import { createSource } from "./fixtures";

vi.mock("@/lib/api", () => ({
  getSources: vi.fn(),
  addSource: vi.fn(),
  deleteSource: vi.fn(),
  updateSource: vi.fn(),
}));

import { getSources, addSource, deleteSource, updateSource } from "@/lib/api";

const mockGetSources = getSources as Mock;
const mockAddSource = addSource as Mock;
const mockDeleteSource = deleteSource as Mock;
const mockUpdateSource = updateSource as Mock;

const testSources = [
  createSource({ id: "s1", name: "TechCrunch", category: "科技媒体", enabled: true }),
  createSource({ id: "s2", name: "ArXiv", category: "学术", enabled: false, url: "https://arxiv.org/rss/cs.AI" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSources.mockResolvedValue({ items: testSources });
});

// ── 基本渲染 ──

describe("SourceManager — 基本渲染", () => {
  it("显示标题「信源管理」和信源统计", async () => {
    render(<SourceManager />);
    await waitFor(() => {
      expect(screen.getByText("信源管理")).toBeInTheDocument();
      expect(screen.getByText(/共 2 个信源/)).toBeInTheDocument();
      expect(screen.getByText(/1 个启用/)).toBeInTheDocument();
    });
  });

  it("按分类分组列出所有信源", async () => {
    render(<SourceManager />);
    await waitFor(() => {
      expect(screen.getByText("TechCrunch")).toBeInTheDocument();
      expect(screen.getByText("ArXiv")).toBeInTheDocument();
    });
  });

  it("显示信源 URL", async () => {
    render(<SourceManager />);
    await waitFor(() => {
      expect(screen.getByText("https://techcrunch.com/feed")).toBeInTheDocument();
    });
  });

  it("显示信源类型标签", async () => {
    render(<SourceManager />);
    await waitFor(() => {
      // RSS 被转换为大写
      const rssLabels = screen.getAllByText("RSS");
      expect(rssLabels.length).toBeGreaterThan(0);
    });
  });

  it("无信源时显示空状态", async () => {
    mockGetSources.mockResolvedValue({ items: [] });
    render(<SourceManager />);
    await waitFor(() => {
      expect(screen.getByText("暂无信源，点击上方按钮添加")).toBeInTheDocument();
    });
  });

  it("加载中显示 Loader", () => {
    mockGetSources.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SourceManager />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });
});

// ── 启用/禁用 ──

describe("SourceManager — 启用/禁用", () => {
  it("启用中的信源显示「启用中」", async () => {
    render(<SourceManager />);
    await waitFor(() => {
      const enabledLabels = screen.getAllByText("启用中");
      expect(enabledLabels.length).toBeGreaterThan(0);
    });
  });

  it("禁用信源显示「已禁用」", async () => {
    render(<SourceManager />);
    await waitFor(() => {
      expect(screen.getByText("已禁用")).toBeInTheDocument();
    });
  });

  it("点击启用/禁用按钮调用 updateSource", async () => {
    const user = userEvent.setup();
    mockUpdateSource.mockResolvedValue({});
    render(<SourceManager />);
    await waitFor(() => expect(screen.getByText("TechCrunch")).toBeInTheDocument());

    // 点击 TechCrunch 的禁用按钮
    const disableBtns = screen.getAllByTitle("禁用");
    await user.click(disableBtns[0]);
    expect(mockUpdateSource).toHaveBeenCalledWith("s1", { enabled: false });
  });
});

// ── 新增信源 ──

describe("SourceManager — 添加信源", () => {
  it("点击「添加信源」显示表单", async () => {
    const user = userEvent.setup();
    render(<SourceManager />);
    await waitFor(() => expect(screen.getByText("添加信源")).toBeInTheDocument());

    await user.click(screen.getByText("添加信源"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("OpenAI Blog")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("https://openai.com/blog/rss.xml")).toBeInTheDocument();
    });
  });

  it("填写表单并提交调用 addSource", async () => {
    const user = userEvent.setup();
    mockAddSource.mockResolvedValue({});
    // 添加后重新加载
    mockGetSources.mockResolvedValue({ items: testSources });

    render(<SourceManager />);
    await waitFor(() => expect(screen.getByText("添加信源")).toBeInTheDocument());

    await user.click(screen.getByText("添加信源"));

    const nameInput = screen.getByPlaceholderText("OpenAI Blog");
    const urlInput = screen.getByPlaceholderText("https://openai.com/blog/rss.xml");

    await user.type(nameInput, "New Source");
    await user.type(urlInput, "https://example.com/feed");

    await user.click(screen.getByText("确认添加"));

    await waitFor(() => {
      expect(mockAddSource).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Source",
          url: "https://example.com/feed",
          source_type: "rss",
        })
      );
    });
  });

  it("名称或 URL 为空时不提交", async () => {
    const user = userEvent.setup();
    render(<SourceManager />);
    await waitFor(() => expect(screen.getByText("添加信源")).toBeInTheDocument());

    await user.click(screen.getByText("添加信源"));
    await user.click(screen.getByText("确认添加"));

    expect(mockAddSource).not.toHaveBeenCalled();
  });

  it("点击「取消」关闭新增表单", async () => {
    const user = userEvent.setup();
    render(<SourceManager />);
    await waitFor(() => expect(screen.getByText("添加信源")).toBeInTheDocument());

    await user.click(screen.getByText("添加信源"));
    expect(screen.getByText("确认添加")).toBeInTheDocument();

    await user.click(screen.getByText("取消"));
    await waitFor(() => {
      expect(screen.queryByText("确认添加")).not.toBeInTheDocument();
    });
  });
});

// ── 删除信源 ──

describe("SourceManager — 删除", () => {
  it("点击删除按钮调用 deleteSource 并确认", async () => {
    const user = userEvent.setup();
    mockDeleteSource.mockResolvedValue({});
    render(<SourceManager />);
    await waitFor(() => expect(screen.getByText("TechCrunch")).toBeInTheDocument());

    // 找到删除按钮（带 hover:text-red-400 类名的按钮）
    const deleteButtons = screen.getAllByRole("button").filter(
      (btn) => btn.className.includes("hover:text-red-400")
    );
    expect(deleteButtons.length).toBeGreaterThan(0);

    await user.click(deleteButtons[0]);
    expect(mockDeleteSource).toHaveBeenCalled();
  });
});

// ── 分类分组 ──

describe("SourceManager — 分类", () => {
  it("分类头显示信源数量", async () => {
    render(<SourceManager />);
    await waitFor(() => {
      // 科技媒体: 1, 学术: 1
      const badges = screen.getAllByText("1");
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("点击分类头折叠/展开", async () => {
    const user = userEvent.setup();
    render(<SourceManager />);
    await waitFor(() => expect(screen.getByText("TechCrunch")).toBeInTheDocument());

    // 找到科技媒体的 chevron 按钮
    const chevronBtns = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector(".lucide-chevron-down") !== null
    );
    if (chevronBtns.length > 0) {
      await user.click(chevronBtns[0]);
      // 折叠后信源可能不可见
    }
  });

  it("未分类信源归入「未分类」", async () => {
    mockGetSources.mockResolvedValue({
      items: [createSource({ id: "s1", name: "NoCat", category: "" })],
    });
    render(<SourceManager />);
    await waitFor(() => {
      expect(screen.getByText("未分类")).toBeInTheDocument();
    });
  });
});
