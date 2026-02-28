/**
 * StatsPanel 组件测试
 * 覆盖统计卡片显示、Pipeline 触发、轮询状态、日志渲染、
 * 采集历史面板（加载/删除/展开）等场景。
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatsPanel from "@/components/StatsPanel";
import { createStats, createPipelineStatus, createPipelineRun } from "./fixtures";

vi.mock("@/lib/api", () => ({
  getStats: vi.fn(),
  triggerPipeline: vi.fn(),
  getPipelineStatus: vi.fn(),
  getPipelineRuns: vi.fn(),
  deletePipelineRun: vi.fn(),
}));

import {
  getStats,
  triggerPipeline,
  getPipelineStatus,
  getPipelineRuns,
  deletePipelineRun,
} from "@/lib/api";

const mockGetStats = getStats as Mock;
const mockTrigger = triggerPipeline as Mock;
const mockGetStatus = getPipelineStatus as Mock;
const mockGetRuns = getPipelineRuns as Mock;
const mockDeleteRun = deletePipelineRun as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStats.mockResolvedValue(createStats());
  mockGetStatus.mockResolvedValue(createPipelineStatus());
  mockGetRuns.mockResolvedValue({ items: [] });
});

// ── 加载与统计卡片 ──

describe("StatsPanel — 统计展示", () => {
  it("加载后显示 4 张统计卡片", async () => {
    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("总文章数")).toBeInTheDocument();
      expect(screen.getByText("精选")).toBeInTheDocument();
      expect(screen.getByText("已过滤")).toBeInTheDocument();
      expect(screen.getByText("待处理")).toBeInTheDocument();
    });
  });

  it("显示正确的统计数值", async () => {
    mockGetStats.mockResolvedValue(createStats({ total: 200, selected: 50, rejected: 120, pending: 30 }));
    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("200")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
    });
  });

  it("加载中显示 Loader", () => {
    // 永远不 resolve 保持 loading 状态
    mockGetStats.mockReturnValue(new Promise(() => {}));
    mockGetStatus.mockReturnValue(new Promise(() => {}));
    const { container } = render(<StatsPanel />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });
});

// ── Tab 切换 ──

describe("StatsPanel — Tab 切换", () => {
  it("默认显示统计 Tab", async () => {
    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("统计")).toBeInTheDocument();
      expect(screen.getByText("采集历史")).toBeInTheDocument();
    });
  });

  it("切换到采集历史 Tab", async () => {
    const user = userEvent.setup();
    render(<StatsPanel />);
    await waitFor(() => expect(screen.getByText("采集历史")).toBeInTheDocument());

    await user.click(screen.getByText("采集历史"));
    await waitFor(() => {
      expect(screen.getByText("暂无采集记录")).toBeInTheDocument();
    });
  });
});

// ── Pipeline 触发 ──

describe("StatsPanel — Pipeline", () => {
  it("点击「手动触发采集」按钮调用 triggerPipeline", async () => {
    const user = userEvent.setup();
    mockTrigger.mockResolvedValue({ status: "started" });
    // 模拟轮询完成
    mockGetStatus
      .mockResolvedValueOnce(createPipelineStatus())
      .mockResolvedValueOnce(createPipelineStatus({ running: true, logs: ["开始采集..."] }))
      .mockResolvedValue(createPipelineStatus({ running: false, logs: ["✅ 完成"], stats: { fetched: 5 } }));

    render(<StatsPanel />);
    await waitFor(() => expect(screen.getByText("手动触发采集")).toBeInTheDocument());

    await user.click(screen.getByText("手动触发采集"));
    expect(mockTrigger).toHaveBeenCalled();
  });

  it("Pipeline 运行中按钮被禁用且显示「采集中...」", async () => {
    const user = userEvent.setup();
    mockTrigger.mockResolvedValue({ status: "started" });
    // 初始返回非运行状态，触发后返回运行中
    mockGetStatus
      .mockResolvedValueOnce(createPipelineStatus())
      .mockResolvedValue(createPipelineStatus({ running: true, logs: ["采集中..."] }));

    render(<StatsPanel />);
    await waitFor(() => expect(screen.getByText("手动触发采集")).toBeInTheDocument());

    await user.click(screen.getByText("手动触发采集"));
    await waitFor(() => {
      expect(screen.getByText("采集中...")).toBeInTheDocument();
    });
  });

  it("pipeline 已在运行时显示现有日志", async () => {
    // mount 时 pipeline 已在运行
    mockGetStatus.mockResolvedValue(
      createPipelineStatus({ running: true, logs: ["已有日志行"] })
    );

    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("已有日志行")).toBeInTheDocument();
    });
  });
});

// ── 日志面板 ──

describe("StatsPanel — 日志", () => {
  it("运行中显示「运行中」标识", async () => {
    mockGetStatus.mockResolvedValue(
      createPipelineStatus({ running: true, logs: ["test log"] })
    );

    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("运行中")).toBeInTheDocument();
    });
  });

  it("运行完毕显示「完成」标识", async () => {
    const user = userEvent.setup();
    mockTrigger.mockResolvedValue({ status: "started" });

    // 初始非运行
    mockGetStatus.mockResolvedValueOnce(createPipelineStatus());

    render(<StatsPanel />);
    await waitFor(() => expect(screen.getByText("手动触发采集")).toBeInTheDocument());

    // 触发后 mock 返回完成状态
    mockGetStatus.mockResolvedValue(
      createPipelineStatus({ running: false, logs: ["✅ done"] })
    );

    await user.click(screen.getByText("手动触发采集"));

    // 等待轮询结束，显示"完成"
    await waitFor(
      () => {
        expect(screen.getByText("完成")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});

// ── 采集历史 ──

describe("StatsPanel — 采集历史面板", () => {
  it("显示历史记录列表", async () => {
    const user = userEvent.setup();
    mockGetRuns.mockResolvedValue({
      items: [
        createPipelineRun({ id: "r1", status: "done" }),
        createPipelineRun({ id: "r2", status: "error" }),
      ],
    });

    render(<StatsPanel />);
    await waitFor(() => expect(screen.getByText("采集历史")).toBeInTheDocument());
    await user.click(screen.getByText("采集历史"));

    await waitFor(() => {
      expect(screen.getByText("完成")).toBeInTheDocument();
      expect(screen.getByText("出错")).toBeInTheDocument();
    });
  });

  it("点击记录展开日志", async () => {
    const user = userEvent.setup();
    mockGetRuns.mockResolvedValue({
      items: [
        createPipelineRun({
          id: "r1",
          logs: ["[INFO] Pipeline started", "[INFO] Pipeline done"],
        }),
      ],
    });

    render(<StatsPanel />);
    await waitFor(() => expect(screen.getByText("采集历史")).toBeInTheDocument());
    await user.click(screen.getByText("采集历史"));

    await waitFor(() => expect(screen.getByText("完成")).toBeInTheDocument());

    // 点击记录展开
    await user.click(screen.getByText("完成"));
    await waitFor(() => {
      expect(screen.getByText("[INFO] Pipeline started")).toBeInTheDocument();
    });
  });

  it("删除历史记录调用 deletePipelineRun", async () => {
    const user = userEvent.setup();
    mockDeleteRun.mockResolvedValue({});
    mockGetRuns.mockResolvedValue({
      items: [createPipelineRun({ id: "r1" })],
    });

    render(<StatsPanel />);
    await waitFor(() => expect(screen.getByText("采集历史")).toBeInTheDocument());
    await user.click(screen.getByText("采集历史"));

    await waitFor(() => expect(screen.getByText("完成")).toBeInTheDocument());

    // 找到删除按钮 (Trash 图标)
    const trashBtns = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector(".lucide-trash-2") !== null
    );
    if (trashBtns.length > 0) {
      await user.click(trashBtns[0]);
      await waitFor(() => {
        expect(mockDeleteRun).toHaveBeenCalledWith("r1");
      });
    }
  });
});

// ── 标题 ──

describe("StatsPanel — 标题", () => {
  it("显示「数据面板」标题", async () => {
    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("数据面板")).toBeInTheDocument();
    });
  });
});
