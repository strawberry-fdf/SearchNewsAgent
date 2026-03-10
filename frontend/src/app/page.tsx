/**
 * 首页组件 —— 侧边栏 + 信源面板 + 主内容区域的布局容器。
 * 根据 activeTab 切换渲染: 文章Feed / 全部文章 / 收藏 / 统计 / 信源管理 / 设置。
 * 文章类 Tab 左侧展示信源导航面板，支持按信源筛选文章。
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import ArticleFeed from "@/components/ArticleFeed";
import SourcePanel from "@/components/SourcePanel";
import StatsPanel from "@/components/StatsPanel";
import SourceManager from "@/components/SourceManager";
import Settings from "@/components/Settings";
import PostUpdateReleaseNotes from "@/components/PostUpdateReleaseNotes";
import UpdateToast from "@/components/UpdateToast";
import { getStats, type Stats } from "@/lib/api";
import {
  POST_UPDATE_RELEASE_NOTES_PREVIEW_EVENT,
  type ReleaseNotesInfo,
} from "@/lib/electron";

/** 需要展示信源面板的 Tab */
const ARTICLE_TABS = new Set(["feed", "all", "starred"]);

export default function Home() {
  const [activeTab, setActiveTab] = useState("feed");
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [sourcePanelRefreshKey, setSourcePanelRefreshKey] = useState(0);
  const [postUpdateReleaseNotes, setPostUpdateReleaseNotes] = useState<ReleaseNotesInfo | null>(null);
  const [postUpdateIsPreview, setPostUpdateIsPreview] = useState(false);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<ReleaseNotesInfo>).detail;
      if (!detail) return;
      setPostUpdateIsPreview(true);
      setPostUpdateReleaseNotes(detail);
    };

    window.addEventListener(POST_UPDATE_RELEASE_NOTES_PREVIEW_EVENT, handlePreview);

    if (!api?.isElectron || !api.getPostUpdateReleaseNotes) {
      return () => {
        window.removeEventListener(POST_UPDATE_RELEASE_NOTES_PREVIEW_EVENT, handlePreview);
      };
    }

    api.getPostUpdateReleaseNotes()
      .then((result) => {
        if (result?.releaseNotes) {
          setPostUpdateIsPreview(false);
          setPostUpdateReleaseNotes(result.releaseNotes);
        }
      })
      .catch((err) => {
        console.warn("[PostUpdateReleaseNotes] IPC 获取失败:", err);
      });

    return () => {
      window.removeEventListener(POST_UPDATE_RELEASE_NOTES_PREVIEW_EVENT, handlePreview);
    };
  }, []);

  const handleClosePostUpdateReleaseNotes = useCallback(async () => {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    setPostUpdateReleaseNotes(null);
    if (!postUpdateIsPreview) {
      await api?.dismissPostUpdateReleaseNotes?.();
    }
    setPostUpdateIsPreview(false);
  }, [postUpdateIsPreview]);

  // 切换 Tab 时重置信源筛选
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setActiveSource(null);
  };

  const showSourcePanel = ARTICLE_TABS.has(activeTab);
  const feedMode = activeTab === "feed" ? "feed" : activeTab === "starred" ? "starred" : "all";

  return (
    <div className="flex min-h-screen">
      {/* 全局更新提示 Toast（左下角） */}
      <UpdateToast />
      {postUpdateReleaseNotes && (
        <PostUpdateReleaseNotes
          releaseNotes={postUpdateReleaseNotes}
          onClose={handleClosePostUpdateReleaseNotes}
        />
      )}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        stats={stats}
      />

      <main className="flex-1 flex overflow-hidden">
        {/* 信源面板：仅在文章类 Tab 显示 */}
        {showSourcePanel && (
          <SourcePanel
            mode={feedMode}
            activeSource={activeSource}
            onSourceChange={setActiveSource}
            refreshKey={sourcePanelRefreshKey}
          />
        )}

        {/* 内容区 */}
        {activeTab === "feed" && <ArticleFeed mode="feed" sourceFilter={activeSource} onStarChange={() => setSourcePanelRefreshKey((k) => k + 1)} />}
        {activeTab === "all" && <ArticleFeed mode="all" sourceFilter={activeSource} onStarChange={() => setSourcePanelRefreshKey((k) => k + 1)} />}
        {activeTab === "starred" && <ArticleFeed mode="starred" sourceFilter={activeSource} onStarChange={() => setSourcePanelRefreshKey((k) => k + 1)} />}
        {activeTab === "stats" && <StatsPanel />}
        {activeTab === "sources" && <SourceManager />}
        {activeTab === "settings" && <Settings />}
      </main>
    </div>
  );
}
