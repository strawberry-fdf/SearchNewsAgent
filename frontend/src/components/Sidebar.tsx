/**
 * 侧边栏导航组件 —— 图标导航 + 统计数字徽章，支持移动端收起/展开。
 */
"use client";

import { useState } from "react";
import {
  Newspaper,
  Star,
  BarChart3,
  Settings2,
  Zap,
  ChevronLeft,
  ChevronRight,
  Database,
} from "lucide-react";
import clsx from "clsx";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  stats: { total: number; selected: number; rejected: number; pending: number } | null;
}

const NAV_ITEMS = [
  { id: "feed", label: "精选资讯", icon: Zap },
  { id: "all", label: "全部文章", icon: Newspaper },
  { id: "starred", label: "收藏", icon: Star },
  { id: "stats", label: "数据面板", icon: BarChart3 },
  { id: "sources", label: "信源管理", icon: Database },
  { id: "settings", label: "设置", icon: Settings2 },
];

export default function Sidebar({ activeTab, onTabChange, stats }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={clsx(
        "sticky top-0 h-screen flex flex-col border-r border-dark-border bg-dark-card transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-dark-border">
        <div className="w-8 h-8 rounded-lg bg-dark-accent flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
          AN
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm tracking-wide whitespace-nowrap">
            AgentNews
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-dark-surface text-dark-accent"
                  : "text-dark-muted hover:text-dark-text hover:bg-dark-surface/50"
              )}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.id === "feed" && stats && (
                <span className="ml-auto bg-dark-accent/20 text-dark-accent text-xs px-2 py-0.5 rounded-full">
                  {stats.selected}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-12 border-t border-dark-border text-dark-muted hover:text-dark-text transition-colors"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
