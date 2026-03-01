/**
 * SourcePanel 组件测试
 * 覆盖信源列表加载、分类分组、搜索过滤、编辑模式（重命名/置顶/取消订阅）、
 * 分类置顶、文章计数显示等场景。
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SourcePanel from "@/components/SourcePanel";
import { createSource, createSourceCount } from "./fixtures";

vi.mock("@/lib/api", () => ({
  getSources: vi.fn(),
  getSourceArticleCounts: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
  getPinnedCategories: vi.fn(),
  updatePinnedCategories: vi.fn(),
}));

import {
  getSources,
  getSourceArticleCounts,
  updateSource,
  deleteSource,
  getPinnedCategories,
  updatePinnedCategories,
} from "@/lib/api";

const mockGetSources = getSources as Mock;
const mockGetCounts = getSourceArticleCounts as Mock;
const mockUpdateSource = updateSource as Mock;
const mockDeleteSource = deleteSource as Mock;
const mockGetPinned = getPinnedCategories as Mock;
const mockUpdatePinned = updatePinnedCategories as Mock;

const defaultProps = {
  mode: "feed" as const,
  activeSource: null as string | null,
  onSourceChange: vi.fn(),
};

function setupMocks(sources = [
  createSource({ id: "s1", name: "TechCrunch", category: "科技媒体" }),
  createSource({ id: "s2", name: "Hacker News", category: "科技媒体" }),
  createSource({ id: "s3", name: "ArXiv", category: "学术" }),
]) {
  mockGetSources.mockResolvedValue({ items: sources });
  mockGetCounts.mockResolvedValue({
    items: [
      createSourceCount({ source_name: "TechCrunch", count: 25 }),
      createSourceCount({ source_name: "Hacker News", count: 15 }),
      createSourceCount({ source_name: "ArXiv", count: 10 }),
    ],
    total: 50,
  });
  mockGetPinned.mockResolvedValue({ pinned_categories: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

// ── 基本渲染 ──

describe("SourcePanel — 基本渲染", () => {
  it("加载并显示「全部」按钮和总文章数", async () => {
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("全部")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });
  });

  it("按分类分组显示信源", async () => {
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("科技媒体")).toBeInTheDocument();
      expect(screen.getByText("学术")).toBeInTheDocument();
    });
    expect(screen.getByText("TechCrunch")).toBeInTheDocument();
    expect(screen.getByText("Hacker News")).toBeInTheDocument();
    expect(screen.getByText("ArXiv")).toBeInTheDocument();
  });

  it("显示每个信源的文章计数", async () => {
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("TechCrunch")).toBeInTheDocument();
    });
    // 文章计数以数字形式显示在信源旁边（可能与分类汇总重复）
    // 验证三个计数值都出现在文档中（25、15、10）
    const counts = screen.getAllByText(/^(25|15|10)$/);
    expect(counts.length).toBeGreaterThanOrEqual(3);
  });

  it("未分类信源归为「未分类」分组", async () => {
    setupMocks([createSource({ id: "s1", name: "NoCategory", category: "" })]);
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("未分类")).toBeInTheDocument();
    });
  });
});

// ── 信源点击与选中 ──

describe("SourcePanel — 信源选中", () => {
  it("点击信源调用 onSourceChange", async () => {
    const user = userEvent.setup();
    const onSourceChange = vi.fn();
    render(<SourcePanel {...defaultProps} onSourceChange={onSourceChange} />);
    await waitFor(() => expect(screen.getByText("TechCrunch")).toBeInTheDocument());

    await user.click(screen.getByText("TechCrunch"));
    expect(onSourceChange).toHaveBeenCalledWith("TechCrunch");
  });

  it("点击「全部」传入 null 清除筛选", async () => {
    const user = userEvent.setup();
    const onSourceChange = vi.fn();
    render(<SourcePanel {...defaultProps} activeSource="TechCrunch" onSourceChange={onSourceChange} />);
    await waitFor(() => expect(screen.getByText("全部")).toBeInTheDocument());

    await user.click(screen.getByText("全部"));
    expect(onSourceChange).toHaveBeenCalledWith(null);
  });
});

// ── 搜索过滤 ──

describe("SourcePanel — 搜索", () => {
  it("搜索框过滤信源", async () => {
    const user = userEvent.setup();
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("TechCrunch")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("搜索订阅源...");
    await user.type(input, "ArXiv");

    await waitFor(() => {
      expect(screen.getByText("ArXiv")).toBeInTheDocument();
      // TechCrunch 应被过滤掉（不在学术分类中）
      expect(screen.queryByText("TechCrunch")).not.toBeInTheDocument();
    });
  });

  it("搜索分类名可显示该分类下所有信源", async () => {
    const user = userEvent.setup();
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("TechCrunch")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("搜索订阅源...");
    await user.type(input, "科技");

    await waitFor(() => {
      expect(screen.getByText("TechCrunch")).toBeInTheDocument();
      expect(screen.getByText("Hacker News")).toBeInTheDocument();
    });
  });

  it("无匹配结果时显示空状态", async () => {
    const user = userEvent.setup();
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("TechCrunch")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("搜索订阅源...");
    await user.type(input, "不存在的信源");

    await waitFor(() => {
      expect(screen.getByText("未找到匹配的信源")).toBeInTheDocument();
    });
  });
});

// ── 分类折叠/展开 ──

describe("SourcePanel — 分类折叠", () => {
  it("点击分类头折叠/展开信源列表", async () => {
    const user = userEvent.setup();
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("TechCrunch")).toBeInTheDocument());

    // 点击"科技媒体"分类头折叠
    await user.click(screen.getByText("科技媒体"));

    // TechCrunch 和 Hacker News 不可见
    await waitFor(() => {
      expect(screen.queryByText("TechCrunch")).not.toBeInTheDocument();
    });

    // 再次点击展开
    await user.click(screen.getByText("科技媒体"));
    await waitFor(() => {
      expect(screen.getByText("TechCrunch")).toBeInTheDocument();
    });
  });
});

// ── 编辑模式 ──

describe("SourcePanel — 编辑模式", () => {
  it("点击编辑按钮进入编辑模式", async () => {
    const user = userEvent.setup();
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByTitle("编辑信源")).toBeInTheDocument());

    await user.click(screen.getByTitle("编辑信源"));
    await waitFor(() => {
      expect(screen.getByText(/编辑模式/)).toBeInTheDocument();
    });
  });

  it("编辑模式下点击信源名称显示内联编辑输入框", async () => {
    const user = userEvent.setup();
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByTitle("编辑信源")).toBeInTheDocument());

    await user.click(screen.getByTitle("编辑信源"));
    await waitFor(() => expect(screen.getByText(/编辑模式/)).toBeInTheDocument());

    await user.click(screen.getByText("TechCrunch"));
    await waitFor(() => {
      const input = screen.getByDisplayValue("TechCrunch");
      expect(input).toBeInTheDocument();
    });
  });

  it("重命名信源调用 updateSource", async () => {
    const user = userEvent.setup();
    mockUpdateSource.mockResolvedValue({});
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByTitle("编辑信源")).toBeInTheDocument());

    await user.click(screen.getByTitle("编辑信源"));
    await waitFor(() => expect(screen.getByText(/编辑模式/)).toBeInTheDocument());

    await user.click(screen.getByText("TechCrunch"));
    const input = await screen.findByDisplayValue("TechCrunch");
    await user.clear(input);
    await user.type(input, "Tech Crunch New{enter}");

    await waitFor(() => {
      expect(mockUpdateSource).toHaveBeenCalledWith("s1", { name: "Tech Crunch New" });
    });
  });

  it("编辑模式下取消订阅调用 deleteSource", async () => {
    const user = userEvent.setup();
    mockDeleteSource.mockResolvedValue({});
    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByTitle("编辑信源")).toBeInTheDocument());

    await user.click(screen.getByTitle("编辑信源"));
    await waitFor(() => expect(screen.getByText(/编辑模式/)).toBeInTheDocument());

    // 找到取消订阅按钮（X 图标）
    const unsubBtns = screen.getAllByTitle("取消订阅");
    expect(unsubBtns.length).toBeGreaterThan(0);

    await user.click(unsubBtns[0]);
    await waitFor(() => {
      expect(mockDeleteSource).toHaveBeenCalled();
    });
  });
});

// ── 分类置顶 ──

describe("SourcePanel — 分类置顶", () => {
  it("置顶分类排在前面", async () => {
    mockGetPinned.mockResolvedValue({ pinned_categories: ["学术"] });
    render(<SourcePanel {...defaultProps} />);

    await waitFor(() => {
      const categories = screen.getAllByText(/科技媒体|学术/);
      // 学术应在科技媒体前面（因为置顶）
      const indices = categories.map((el) => el.textContent);
      const academicIdx = indices.indexOf("学术");
      const techIdx = indices.indexOf("科技媒体");
      expect(academicIdx).toBeLessThan(techIdx);
    });
  });
});

// ── 禁用信源样式 ──

describe("SourcePanel — 禁用信源", () => {
  it("禁用信源有弱化样式", async () => {
    setupMocks([
      createSource({ id: "s1", name: "DisabledSource", enabled: false, category: "测试" }),
    ]);
    mockGetCounts.mockResolvedValue({
      items: [createSourceCount({ source_name: "DisabledSource", count: 0 })],
      total: 0,
    });

    render(<SourcePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("DisabledSource")).toBeInTheDocument();
    });

    // 检查禁用状态的圆点
    const statusDot = screen.getByTitle("未启用");
    expect(statusDot).toBeInTheDocument();
  });
});
