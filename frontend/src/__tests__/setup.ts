/**
 * Vitest 全局测试环境配置
 * - 注入 @testing-library/jest-dom 断言扩展
 * - Mock 全局 API（fetch、matchMedia、localStorage、scrollIntoView）
 * - Mock Electron API（window.electronAPI）
 *
 * 注意：vitest.config.ts 启用了 mockReset: true，会在每个测试前重置所有 mock 实现。
 * 因此全局 mock 必须放在 beforeEach 中，确保每次测试都能正确恢复。
 */
import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 每个测试结束后自动 cleanup DOM
afterEach(() => {
  cleanup();
});

// ── 每次测试前重新注入全局 mock（防止 mockReset 清除）──
beforeEach(() => {
  // Mock window.matchMedia
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();

  // Mock window.confirm
  window.confirm = vi.fn(() => true) as unknown as typeof window.confirm;

  // Mock Electron API（默认非 Electron 环境）
  Object.defineProperty(window, "electronAPI", {
    writable: true,
    configurable: true,
    value: undefined,
  });
});
