"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Loader2, ChevronDown } from "lucide-react";
import ArticleCard from "./ArticleCard";
import type { Article, ArticlesResponse } from "@/lib/api";
import {
  getSelectedArticles,
  getAllArticles,
  toggleStar as apiToggleStar,
} from "@/lib/api";

interface ArticleFeedProps {
  mode: "feed" | "all" | "starred";
  statusFilter?: string;
}

const CATEGORIES = [
  "全部",
  "模型发布",
  "论文/研究",
  "评测/基准",
  "行业动态/政策监管/其他",
  "DevTool/工程向",
];

/**
 * Groups articles by date for the timeline view.
 */
function groupByDate(articles: Article[]): Record<string, Article[]> {
  const groups: Record<string, Article[]> = {};
  for (const article of articles) {
    const dateStr = article.published_at || article.fetched_at;
    let key = "未知日期";
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor(
          (now.getTime() - d.getTime()) / 86400000
        );
        if (diffDays === 0) key = "今天";
        else if (diffDays === 1) key = "昨天";
        else
          key = d.toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "short",
          });
      } catch {
        key = "未知日期";
      }
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(article);
  }
  return groups;
}

export default function ArticleFeed({ mode, statusFilter }: ArticleFeedProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const LIMIT = 30;

  const fetchArticles = useCallback(
    async (reset = false) => {
      const currentSkip = reset ? 0 : skip;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        let res: ArticlesResponse;
        if (mode === "feed") {
          res = await getSelectedArticles(currentSkip, LIMIT, category);
        } else {
          res = await getAllArticles(currentSkip, LIMIT, statusFilter);
        }

        if (reset) {
          setArticles(res.items);
        } else {
          setArticles((prev) => [...prev, ...res.items]);
        }
        setTotal(res.total);
        setSkip(currentSkip + res.items.length);
      } catch (err) {
        console.error("Failed to fetch articles:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mode, statusFilter, category, skip]
  );

  useEffect(() => {
    fetchArticles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, statusFilter, category]);

  const handleToggleStar = async (urlHash: string) => {
    try {
      const res = await apiToggleStar(urlHash);
      setArticles((prev) =>
        prev.map((a) =>
          a.url_hash === urlHash ? { ...a, starred: res.starred } : a
        )
      );
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  };

  const handleRefresh = () => {
    setSkip(0);
    fetchArticles(true);
  };

  const displayArticles =
    mode === "starred" ? articles.filter((a) => a.starred) : articles;

  const grouped = groupByDate(displayArticles);
  const hasMore = articles.length < total;

  return (
    <div className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {mode === "feed" ? "🔥 精选资讯" : mode === "starred" ? "⭐ 收藏" : "📰 全部文章"}
          </h1>
          <p className="text-sm text-dark-muted mt-1">
            共 {total} 篇{mode === "feed" ? "精选" : "文章"}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-surface border border-dark-border text-sm text-dark-muted hover:text-dark-text hover:border-dark-accent/30 transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          刷新
        </button>
      </div>

      {/* Category filter (feed mode only) */}
      {mode === "feed" && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {CATEGORIES.map((cat) => {
            const isActive =
              (cat === "全部" && !category) || cat === category;
            return (
              <button
                key={cat}
                onClick={() =>
                  setCategory(cat === "全部" ? undefined : cat)
                }
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-dark-accent/20 text-dark-accent border border-dark-accent/40"
                    : "bg-dark-surface text-dark-muted border border-dark-border hover:border-dark-accent/20"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-dark-card border border-dark-border rounded-xl p-5 animate-pulse"
            >
              <div className="h-3 bg-dark-surface rounded w-1/4 mb-3" />
              <div className="h-5 bg-dark-surface rounded w-3/4 mb-2" />
              <div className="h-3 bg-dark-surface rounded w-full mb-4" />
              <div className="flex gap-2">
                <div className="h-5 bg-dark-surface rounded w-16" />
                <div className="h-5 bg-dark-surface rounded w-12" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline grouped feed */}
      {!loading && (
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-dark-accent pulse-dot" />
                <h2 className="text-sm font-semibold text-dark-muted uppercase tracking-wider">
                  {date}
                </h2>
                <div className="flex-1 h-px bg-dark-border" />
                <span className="text-xs text-dark-muted">{items.length} 篇</span>
              </div>

              {/* Cards */}
              <div className="space-y-3 ml-5 pl-5 border-l-2 border-dark-border">
                {items.map((article) => (
                  <ArticleCard
                    key={article.url_hash}
                    article={article}
                    onToggleStar={handleToggleStar}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Empty state */}
          {displayArticles.length === 0 && (
            <div className="text-center py-20">
              <div className="text-4xl mb-4">📭</div>
              <p className="text-dark-muted">暂无内容</p>
            </div>
          )}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="flex justify-center pt-4 pb-8">
              <button
                onClick={() => fetchArticles(false)}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-dark-surface border border-dark-border text-sm text-dark-muted hover:text-dark-text hover:border-dark-accent/30 transition-all"
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                加载更多
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
