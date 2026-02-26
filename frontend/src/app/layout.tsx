/**
 * 根布局 —— 设置暗色主题、中文语言、全局 CSS 变量。
 */
import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="zh-CN" className="dark">
      <body className="bg-dark-bg text-dark-text min-h-screen">
        {children}
      </body>
    </html>
  );
}
