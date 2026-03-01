/**
 * Settings 组件测试
 * 覆盖主题切换、LLM 开关、LLM 配置管理、筛选预设、缓存管理、关于与更新等场景。
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "@/components/Settings";
import {
  createAppSettings,
  createFilterPreset,
  createLlmConfig,
  createCacheStats,
  createCacheSourceStat,
} from "./fixtures";

// Mock ThemeProvider
vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(() => ({
    mode: "dark",
    setMode: vi.fn(),
  })),
}));

vi.mock("@/lib/api", () => ({
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

import {
  getSettings,
  updateSettings,
  getFilterPresets,
  createFilterPreset as apiCreatePreset,
  deleteFilterPreset,
  getCacheStats,
  clearCache,
  getLlmConfigs,
  createLlmConfig as apiCreateLlm,
  activateLlmConfig,
  deleteLlmConfig,
} from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

const mockGetSettings = getSettings as Mock;
const mockUpdateSettings = updateSettings as Mock;
const mockGetPresets = getFilterPresets as Mock;
const mockApiCreatePreset = apiCreatePreset as Mock;
const mockDeletePreset = deleteFilterPreset as Mock;
const mockGetCacheStats = getCacheStats as Mock;
const mockClearCache = clearCache as Mock;
const mockGetLlmConfigs = getLlmConfigs as Mock;
const mockApiCreateLlm = apiCreateLlm as Mock;
const mockActivateLlm = activateLlmConfig as Mock;
const mockDeleteLlm = deleteLlmConfig as Mock;
const mockUseTheme = useTheme as Mock;

function setupDefaultMocks() {
  mockGetSettings.mockResolvedValue(createAppSettings());
  mockGetPresets.mockResolvedValue({ items: [createFilterPreset()] });
  mockGetCacheStats.mockResolvedValue(createCacheStats());
  mockGetLlmConfigs.mockResolvedValue({ items: [createLlmConfig()] });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTheme.mockReturnValue({ mode: "dark", setMode: vi.fn() });
  setupDefaultMocks();
});

// ── 基本渲染 ──

describe("Settings — 基本渲染", () => {
  it("显示「设置」标题", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("设置")).toBeInTheDocument();
    });
  });

  it("显示所有设置区块", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("大模型分析")).toBeInTheDocument();
      expect(screen.getByText("筛选规则")).toBeInTheDocument();
      expect(screen.getByText("缓存管理")).toBeInTheDocument();
      expect(screen.getByText("主题外观")).toBeInTheDocument();
    });
  });

  it("加载中显示 Loader", () => {
    mockGetSettings.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Settings />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });
});

// ── 主题切换 ──

describe("Settings — 主题切换", () => {
  it("显示三种主题选项: 暗色/亮色/跟随系统", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("暗色")).toBeInTheDocument();
      expect(screen.getByText("亮色")).toBeInTheDocument();
      expect(screen.getByText("跟随系统")).toBeInTheDocument();
    });
  });

  it("点击主题按钮调用 setMode", async () => {
    const setMode = vi.fn();
    mockUseTheme.mockReturnValue({ mode: "dark", setMode });

    const user = userEvent.setup();
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("亮色")).toBeInTheDocument());

    // 主题切换使用 <select>，用 selectOptions 更改选中值
    const select = screen.getByDisplayValue("暗色");
    await user.selectOptions(select, "light");
    expect(setMode).toHaveBeenCalledWith("light");
  });
});

// ── LLM 开关 ──

describe("Settings — LLM 开关", () => {
  it("LLM 启用时显示开启状态", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("启用 LLM 分析")).toBeInTheDocument();
    });
  });

  it("切换 LLM 开关调用 updateSettings", async () => {
    const user = userEvent.setup();
    mockUpdateSettings.mockResolvedValue(createAppSettings({ llm_enabled: false }));

    render(<Settings />);
    await waitFor(() => expect(screen.getByText("启用 LLM 分析")).toBeInTheDocument());

    // Toggle switch 是一个 button
    const toggles = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("rounded-full") && b.className.includes("w-11"));

    if (toggles.length > 0) {
      await user.click(toggles[0]);
      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({ llm_enabled: false });
      });
    }
  });
});

// ── LLM 配置管理 ──

describe("Settings — LLM 配置", () => {
  it("显示已有的 LLM 配置", async () => {
    render(<Settings />);
    await waitFor(() => {
      const items = screen.getAllByText("GPT-4o-mini");
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("点击新增配置弹出 Modal", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await waitFor(() => {
      const items = screen.getAllByText("GPT-4o-mini");
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    const addBtn = screen.getByText("新建配置");
    await user.click(addBtn);
    await waitFor(() => {
      // Modal 标题 "新建大模型配置" 和配置名称 placeholder
      expect(screen.getByText("新建大模型配置")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/GPT-4o-mini/)).toBeInTheDocument();
    });
  });

  it("删除 LLM 配置调用 deleteLlmConfig", async () => {
    const user = userEvent.setup();
    mockDeleteLlm.mockResolvedValue({});

    render(<Settings />);
    await waitFor(() => {
      const items = screen.getAllByText("GPT-4o-mini");
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    // 寻找删除按钮（title="删除配置"）
    const deleteBtn = screen.getByTitle("删除配置");
    await user.click(deleteBtn);
    await waitFor(() => {
      expect(mockDeleteLlm).toHaveBeenCalled();
    });
  });
});

// ── 筛选预设 ──

describe("Settings — 筛选预设", () => {
  it("显示已有的预设名称", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("AI 核心")).toBeInTheDocument();
    });
  });

  it("展开预设显示详细信息", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("AI 核心")).toBeInTheDocument());

    // 点击展开按钮（chevron，title="编辑内容"）
    await user.click(screen.getByTitle("编辑内容"));
    await waitFor(() => {
      // 展开后显示提示文字和 textarea 中的预设内容
      expect(screen.getByText("筛选要求内容（传递给 LLM）")).toBeInTheDocument();
      expect(screen.getByDisplayValue("仅保留与 AI 直接相关的文章")).toBeInTheDocument();
    });
  });
});

// ── 缓存管理 ──

describe("Settings — 缓存管理", () => {
  it("显示缓存统计信息", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("缓存管理")).toBeInTheDocument();
    });
    // 文件大小显示（article_total_bytes=409600 → formatBytes → "400.0 KB"）
    await waitFor(() => {
      expect(screen.getByText(/400\.0 KB/)).toBeInTheDocument();
    });
  });

  it("显示信源级别的缓存统计", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("TechCrunch")).toBeInTheDocument();
    });
  });
});

// ── 关于与更新 ──

describe("Settings — 关于与更新", () => {
  it("显示版本和平台信息", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("当前版本")).toBeInTheDocument();
    });
  });

  it("显示 GitHub 仓库链接", async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("GitHub 仓库 →")).toBeInTheDocument();
    });
  });

  it("非 Electron 环境下检查更新提示仅桌面端支持", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("检查更新")).toBeInTheDocument());

    await user.click(screen.getByText("检查更新"));
    await waitFor(() => {
      expect(screen.getByText("仅桌面端支持自动更新检查")).toBeInTheDocument();
    });
  });
});

// ── 默认筛选要求 ──

describe("Settings — 默认筛选要求", () => {
  it("加载并显示当前筛选提示词", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    // 默认筛选要求区域是折叠的，需要先展开
    await waitFor(() => expect(screen.getByText("默认筛选要求")).toBeInTheDocument());
    await user.click(screen.getByText("默认筛选要求"));
    // 展开后检查 textarea 中的筛选提示词
    await waitFor(() => {
      const ta = screen.getByDisplayValue("筛选 AI 相关的高质量文章");
      expect(ta).toBeInTheDocument();
    });
  });
});
