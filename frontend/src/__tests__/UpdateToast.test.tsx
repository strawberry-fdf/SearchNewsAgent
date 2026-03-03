/**
 * UpdateToast 组件测试
 * 覆盖非 Electron 环境不渲染、4 种 Toast 类型渲染、自动关闭、手动关闭、下载按钮。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UpdateToast from "@/components/UpdateToast";

// 存储 IPC 回调
let updateCallback: ((data: unknown) => void) | null = null;

function createElectronAPIMock(isElectron = true) {
  return {
    isElectron,
    platform: "darwin",
    version: "1.0.0",
    checkForUpdates: vi.fn(),
    startUpdateInstallation: vi.fn(async () => ({ status: "started" })),
    openExternal: vi.fn(),
    onUpdateCheckResult: vi.fn((cb: (data: unknown) => void) => {
      updateCallback = cb;
    }),
    onUpdateProgress: vi.fn(),
    onUpdateDownloading: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  updateCallback = null;
});

afterEach(() => {
  vi.useRealTimers();
  // 清理 electronAPI
  Object.defineProperty(window, "electronAPI", {
    writable: true,
    value: undefined,
  });
});

// ── 非 Electron 环境 ──

describe("UpdateToast — 非 Electron", () => {
  it("非 Electron 环境不渲染任何内容", () => {
    const { container } = render(<UpdateToast />);
    expect(container.innerHTML).toBe("");
  });
});

// ── Electron 环境 ──

describe("UpdateToast — 有更新可用", () => {
  it("显示版本号和「更新」按钮", async () => {
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: createElectronAPIMock(),
    });

    render(<UpdateToast />);

    // 触发 IPC 事件
    act(() => {
      updateCallback?.({
        type: "update-available",
        version: "2.0.0",
        downloadUrl: "https://example.com/download",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("v2.0.0 新版本可用")).toBeInTheDocument();
      expect(screen.getByText("更新")).toBeInTheDocument();
    });
  });

  it("「update-available」Toast 不自动关闭", async () => {
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: createElectronAPIMock(),
    });

    render(<UpdateToast />);

    act(() => {
      updateCallback?.({
        type: "update-available",
        version: "2.0.0",
        downloadUrl: "https://example.com/download",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("v2.0.0 新版本可用")).toBeInTheDocument();
    });

    // 等 6 秒，仍然可见
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText("v2.0.0 新版本可用")).toBeInTheDocument();
  });

  it("macOS 平台点击「更新」显示应用内更新不可用提示", async () => {
    const mock = createElectronAPIMock();
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: mock,
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UpdateToast />);

    act(() => {
      updateCallback?.({
        type: "update-available",
        version: "2.0.0",
        downloadUrl: "https://example.com/download",
      });
    });

    await waitFor(() => expect(screen.getByText("更新")).toBeInTheDocument());

    await user.click(screen.getByText("更新"));
    await waitFor(() => {
      expect(screen.getByText("当前环境未启用应用内更新能力")).toBeInTheDocument();
    });
    expect(mock.openExternal).not.toHaveBeenCalled();
  });

  it("Windows 平台点击「更新」调用 startUpdateInstallation", async () => {
    const mock = createElectronAPIMock();
    mock.platform = "win32";
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: mock,
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UpdateToast />);

    act(() => {
      updateCallback?.({
        type: "update-available",
        version: "2.0.0",
        updateMode: "in-app",
      });
    });

    await waitFor(() => expect(screen.getByText("更新")).toBeInTheDocument());

    await user.click(screen.getByText("更新"));
    expect(mock.startUpdateInstallation).toHaveBeenCalledTimes(1);
    expect(mock.openExternal).not.toHaveBeenCalled();
  });

  it("Windows 平台不支持应用内更新时显示错误，不跳转外链", async () => {
    const mock = createElectronAPIMock();
    mock.platform = "win32";
    mock.startUpdateInstallation = vi.fn(async () => ({ status: "unsupported" }));
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: mock,
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UpdateToast />);

    act(() => {
      updateCallback?.({
        type: "update-available",
        version: "2.0.0",
        updateMode: "in-app",
      });
    });

    await waitFor(() => expect(screen.getByText("更新")).toBeInTheDocument());
    await user.click(screen.getByText("更新"));

    await waitFor(() => {
      expect(screen.getByText("当前平台不支持应用内静默更新")).toBeInTheDocument();
    });
    expect(mock.openExternal).not.toHaveBeenCalled();
  });
});

describe("UpdateToast — 已是最新", () => {
  it("显示「已是最新版本」", async () => {
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: createElectronAPIMock(),
    });

    render(<UpdateToast />);

    act(() => {
      updateCallback?.({ type: "up-to-date" });
    });

    await waitFor(() => {
      expect(screen.getByText("已是最新版本")).toBeInTheDocument();
    });
  });

  it("5 秒后自动关闭", async () => {
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: createElectronAPIMock(),
    });

    render(<UpdateToast />);

    act(() => {
      updateCallback?.({ type: "up-to-date" });
    });

    await waitFor(() => {
      expect(screen.getByText("已是最新版本")).toBeInTheDocument();
    });

    // 5 秒后 dismiss 触发 visible=false，再过 300ms toast=null
    act(() => {
      vi.advanceTimersByTime(5500);
    });

    // Toast 应该已经完全消失（toast=null，组件返回 null）
    await waitFor(() => {
      expect(screen.queryByText("已是最新版本")).not.toBeInTheDocument();
    });
  });
});

describe("UpdateToast — 错误", () => {
  it("显示错误信息", async () => {
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: createElectronAPIMock(),
    });

    render(<UpdateToast />);

    act(() => {
      updateCallback?.({ type: "error", message: "网络超时" });
    });

    await waitFor(() => {
      expect(screen.getByText("网络超时")).toBeInTheDocument();
    });
  });

  it("无 message 时显示默认文案", async () => {
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: createElectronAPIMock(),
    });

    render(<UpdateToast />);

    act(() => {
      updateCallback?.({ type: "error" });
    });

    await waitFor(() => {
      expect(screen.getByText("检查更新失败")).toBeInTheDocument();
    });
  });
});

describe("UpdateToast — 检查中", () => {
  it("显示「正在检查更新…」", async () => {
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: createElectronAPIMock(),
    });

    render(<UpdateToast />);

    act(() => {
      updateCallback?.({ type: "checking" });
    });

    await waitFor(() => {
      expect(screen.getByText("正在检查更新…")).toBeInTheDocument();
    });
  });
});

describe("UpdateToast — 手动关闭", () => {
  it("点击关闭按钮关闭 Toast", async () => {
    Object.defineProperty(window, "electronAPI", {
      writable: true,
      value: createElectronAPIMock(),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UpdateToast />);

    act(() => {
      updateCallback?.({ type: "up-to-date" });
    });

    await waitFor(() => expect(screen.getByText("已是最新版本")).toBeInTheDocument());

    // 点击 X 按钮
    const closeBtns = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector(".lucide-x") !== null
    );
    expect(closeBtns.length).toBeGreaterThan(0);
    await user.click(closeBtns[0]);

    // 进入消失动画
    await waitFor(() => {
      const toast = screen.queryByText("已是最新版本");
      if (toast) {
        const container = toast.closest("div.fixed");
        expect(container?.className).toContain("opacity-0");
      }
    });
  });
});
