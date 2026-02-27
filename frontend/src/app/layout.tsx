/**
 * 根布局 —— 中文语言、全局 CSS 变量。
 * 主题由 ThemeProvider 动态控制（亮色/暗色/跟随系统）。
 */
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "AgentNews - AI 智能资讯精选",
  description: "AI Agent 驱动的技术资讯精选与降噪系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className="bg-dark-bg text-dark-text min-h-screen transition-colors duration-200">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
