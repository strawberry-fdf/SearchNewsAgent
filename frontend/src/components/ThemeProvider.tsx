/**
 * 主题提供者 —— 管理亮色/暗色/跟随系统三种主题模式。
 * 通过 Context 向子组件暴露当前主题和切换方法。
 * 主题偏好持久化到 localStorage。
 */
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  /** 用户选择的主题模式 */
  mode: ThemeMode;
  /** 实际生效的主题 (light | dark) */
  resolved: "light" | "dark";
  /** 切换主题模式 */
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  resolved: "dark",
  setMode: () => {},
});

const STORAGE_KEY = "agentnews-theme";

function getSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return getSystemPreference();
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  // 初始化：从 localStorage 读取
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const initial = stored && ["light", "dark", "system"].includes(stored) ? stored : "dark";
    setModeState(initial);
    setResolved(resolveTheme(initial));
  }, []);

  // 应用主题到 <html> 元素
  useEffect(() => {
    const root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
  }, [resolved]);

  // 监听系统主题变化（仅 system 模式下）
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolved(getSystemPreference());
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    setResolved(resolveTheme(newMode));
    localStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** 获取当前主题上下文 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
