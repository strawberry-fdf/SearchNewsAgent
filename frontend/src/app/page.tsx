/**
 * 首页组件 —— 侧边栏 + 主内容区域的布局容器。
 * 根据 activeTab 切换渲染: 文章Feed / 全部文章 / 收藏 / 统计 / 信源管理 / 设置。
 */
"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ArticleFeed from "@/components/ArticleFeed";
import StatsPanel from "@/components/StatsPanel";
import SourceManager from "@/components/SourceManager";
import Settings from "@/components/Settings";
import { getStats, type Stats } from "@/lib/api";

export default function Home() {
  const [activeTab, setActiveTab] = useState("feed");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {});
  }, [activeTab]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats}
      />

      <main className="flex-1 flex">
        {activeTab === "feed" && <ArticleFeed mode="feed" />}
        {activeTab === "all" && <ArticleFeed mode="all" />}
        {activeTab === "starred" && <ArticleFeed mode="starred" />}
        {activeTab === "stats" && <StatsPanel />}
        {activeTab === "sources" && <SourceManager />}
        {activeTab === "settings" && <Settings />}
      </main>
    </div>
  );
}
