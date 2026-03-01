/**
 * ThemeProvider 单元测试
 * 验证主题切换、localStorage 持久化、系统偏好跟随、CSS class 应用。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "@/components/ThemeProvider";

// 辅助消费组件：显示当前主题并提供切换按钮
function ThemeConsumer() {
  const { mode, resolved, setMode } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setMode("light")}>Light</button>
      <button onClick={() => setMode("dark")}>Dark</button>
      <button onClick={() => setMode("system")}>System</button>
    </div>
  );
}

let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => storage[key] ?? null);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, val) => {
    storage[key] = val;
  });
  // 重置 html class
  document.documentElement.className = "";
});

describe("ThemeProvider", () => {
  it("默认主题为 dark", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });

  it("从 localStorage 恢复保存的主题", () => {
    storage["agentnews-theme"] = "light";
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });

  it("切换主题时更新 localStorage", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByText("Light"));
    expect(storage["agentnews-theme"]).toBe("light");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");

    await user.click(screen.getByText("Dark"));
    expect(storage["agentnews-theme"]).toBe("dark");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });

  it("切换到 light 时 html 有 light 类，无 dark 类", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByText("Light"));
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("切换到 dark 时 html 有 dark 类，无 light 类", async () => {
    const user = userEvent.setup();
    storage["agentnews-theme"] = "light";
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByText("Dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("system 模式下 resolved 跟随系统偏好（mock dark preference）", async () => {
    const user = userEvent.setup();
    // 已在 setup.ts 中 mock matchMedia 为 dark
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByText("System"));
    expect(screen.getByTestId("mode")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(storage["agentnews-theme"]).toBe("system");
  });

  it("localStorage 中无效值回退为 dark", () => {
    storage["agentnews-theme"] = "invalid";
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
  });
});
