/**
 * 文章列表组件 —— 支持三种模式: 精选Feed / 全部文章 / 收藏。
 * 包含分类筛选、关键词搜索、排序、分页、按日期/信源分组、Pipeline 触发。
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw,
  Loader2,
  Search,
  X,
  AlignJustify,
  List,
  Trash2,
  CheckSquare,
  ArrowDownUp,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ArticleCard from "./ArticleCard";
import type { Article, ArticlesResponse } from "@/lib/api";
import {
  getSelectedArticles,
  getAllArticles,
  toggleStar as apiToggleStar,
  getInterestTags,
  updateArticleUserTags,
  deleteArticle,
  deleteArticlesBatch,
} from "@/lib/api";
import clsx from "clsx";

interface ArticleFeedProps {
  mode: "feed" | "all" | "starred";
  statusFilter?: string;
  /** 按信源名称过滤（来自 SourcePanel） */
  sourceFilter?: string | null;
}

type GroupMode = "date" | "source";

const BUILTIN_CATEGORIES = [
  "全部",
  "模型发布",
  "论文/研究",
  "评测/基准",
  "行业动态/政策监管/其他",
  "DevTool/工程向",
];

function groupByDate(articles: Article[]): Record<string, Article[]> {
  const groups: Record<string, Article[]> = {};
  for (const article of articles) {
    const dateStr = article.published_at || article.fetched_at;
    let key = "未知日期";
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
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

function groupBySource(articles: Article[]): Record<string, Article[]> {
  const groups: Record<string, Article[]> = {};
  for (const article of articles) {
    const key = article.source_name || "未知信源";
    if (!groups[key]) groups[key] = [];
    groups[key].push(article);
  }
  // Sort source groups by article count (descending)
  const sorted: Record<string, Article[]> = {};
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  for (const [k, v] of entries) {
    sorted[k] = v;
  }
  return sorted;
}

export default function ArticleFeed({ mode, statusFilter, sourceFilter }: ArticleFeedProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [category, setCategory] = useState<string | undefined>(undefined);

  // Filtering state
  const [compactMode, setCompactMode] = useState(false);
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  // Sort state
  const [sortBy, setSortBy] = useState("fetched_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Grouping state
  const [groupMode, setGroupMode] = useState<GroupMode>("date");
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());

  // Selection / delete state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const LIMIT = 30;
  const keywordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getInterestTags()
      .then((res) => setInterestTags(res.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    keywordTimer.current = setTimeout(() => {
      setDebouncedKeyword(keyword);
    }, 400);
    return () => {
      if (keywordTimer.current) clearTimeout(keywordTimer.current);
    };
  }, [keyword]);

  const fetchArticles = useCallback(
    async (reset = false) => {
      const currentSkip = reset ? 0 : skip;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        let res: ArticlesResponse;
        const activeSrc = sourceFilter || undefined;
        if (mode === "feed") {
          res = await getSelectedArticles(
            currentSkip,
            LIMIT,
            category,
            activeTagFilters.length > 0 ? activeTagFilters : undefined,
            debouncedKeyword || undefined,
            sortBy,
            sortOrder,
            activeSrc,
          );
        } else {
          res = await getAllArticles(currentSkip, LIMIT, statusFilter, sortBy, sortOrder, debouncedKeyword || undefined, activeSrc);
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
    [mode, statusFilter, sourceFilter, category, activeTagFilters, debouncedKeyword, skip, sortBy, sortOrder]
  );

  useEffect(() => {
    fetchArticles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, statusFilter, sourceFilter, category, activeTagFilters, debouncedKeyword, sortBy, sortOrder]);

  const handleToggleStar = async (urlHash: string) => {
    try {
      const res = await apiToggleStar(urlHash);
      setArticles((prev) =>
        prev.map((a) =>
          a.url_hash === urlHash ? { ...a, starred: res.starred } : a
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateUserTags = async (urlHash: string, tags: string[]) => {
    try {
      await updateArticleUserTags(urlHash, tags);
      setArticles((prev) =>
        prev.map((a) => (a.url_hash === urlHash ? { ...a, user_tags: tags } : a))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSingle = async (urlHash: string) => {
    if (!confirm("确定要删除这篇文章吗？")) return;
    try {
      await deleteArticle(urlHash);
      setArticles((prev) => prev.filter((a) => a.url_hash !== urlHash));
      setTotal((t) => t - 1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedHashes.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedHashes.size} 篇文章吗？`)) return;
    setDeleting(true);
    try {
      const hashes = Array.from(selectedHashes);
      await deleteArticlesBatch(hashes);
      setArticles((prev) => prev.filter((a) => !selectedHashes.has(a.url_hash)));
      setTotal((t) => t - selectedHashes.size);
      setSelectedHashes(new Set());
      setSelectionMode(false);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (urlHash: string) => {
    setSelectedHashes((prev) => {
      const next = new Set(prev);
      if (next.has(urlHash)) next.delete(urlHash);
      else next.add(urlHash);
      return next;
    });
  };

  const handleRefresh = () => {
    setSkip(0);
    setSelectedHashes(new Set());
    fetchArticles(true);
  };

  // ── Filter helpers ──
  const selectCategory = (cat: string) => {
    setCategory(cat === "全部" ? undefined : cat);
  };

  const toggleTagFilter = (tag: string) => {
    setActiveTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setCategory(undefined);
    setActiveTagFilters([]);
    setKeyword("");
  };

  const hasActiveFilters = !!category || activeTagFilters.length > 0 || !!keyword;

  const displayArticles =
    mode === "starred" ? articles.filter((a) => a.starred) : articles;
  const grouped = groupMode === "source" ? groupBySource(displayArticles) : groupByDate(displayArticles);
  const hasMore = articles.length < total;

  const toggleSourceCollapse = (source: string) => {
    setCollapsedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  return (
    <div className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">
            {mode === "feed"
              ? "🔥 精选资讯"
              : mode === "starred"
              ? "⭐ 收藏"
              : "📰 全部文章"}
          </h1>
          <p className="text-sm text-dark-muted mt-1">
            共 {total} 篇{mode === "feed" ? "精选" : "文章"}
            {sourceFilter && (
              <span className="ml-1.5 text-dark-accent">· {sourceFilter}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort menu */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              title="排序方式"
              className={clsx(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all",
                sortBy !== "fetched_at" || sortOrder !== "desc"
                  ? "bg-dark-accent/20 border-dark-accent/50 text-dark-accent"
                  : "bg-dark-surface border-dark-border text-dark-muted hover:text-dark-text"
              )}
            >
              <ArrowDownUp size={14} />
              <span className="hidden md:inline">排序</span>
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-dark-card border border-dark-border rounded-xl shadow-xl p-3 w-56">
                <p className="text-xs text-dark-muted mb-2 font-medium">排序字段</p>
                {[
                  { value: "fetched_at", label: "采集时间" },
                  { value: "published_at", label: "发布时间" },
                  ...(mode === "feed" ? [{ value: "importance", label: "重要性评分" }] : []),
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSortBy(opt.value); setShowSortMenu(false); }}
                    className={clsx(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                      sortBy === opt.value
                        ? "bg-dark-accent text-black font-medium"
                        : "text-dark-text hover:bg-dark-surface"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
                <hr className="border-dark-border my-2" />
                <p className="text-xs text-dark-muted mb-2 font-medium">排序方向</p>
                {[
                  { value: "desc", label: "最新优先" },
                  { value: "asc", label: "最早优先" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSortOrder(opt.value); setShowSortMenu(false); }}
                    className={clsx(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                      sortOrder === opt.value
                        ? "bg-dark-accent text-black font-medium"
                        : "text-dark-text hover:bg-dark-surface"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selection mode toggle */}
          <button
            onClick={() => {
              setSelectionMode((v) => !v);
              setSelectedHashes(new Set());
            }}
            title={selectionMode ? "退出选择模式" : "进入选择模式（批量删除）"}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all",
              selectionMode
                ? "bg-red-500/20 border-red-500/50 text-red-400"
                : "bg-dark-surface border-dark-border text-dark-muted hover:text-dark-text"
            )}
          >
            <CheckSquare size={14} />
            <span className="hidden md:inline">{selectionMode ? `已选 ${selectedHashes.size}` : "选择"}</span>
          </button>

          {/* Batch delete button (only in selection mode) */}
          {selectionMode && selectedHashes.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm hover:bg-red-500/30 transition-all disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              删除 ({selectedHashes.size})
            </button>
          )}

          {/* Compact mode toggle */}
          <button
            onClick={() => setCompactMode((v) => !v)}
            title={compactMode ? "切换为卡片视图" : "切换为紧凑视图（仅标题）"}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all",
              compactMode
                ? "bg-dark-accent/20 border-dark-accent/50 text-dark-accent"
                : "bg-dark-surface border-dark-border text-dark-muted hover:text-dark-text"
            )}
          >
            {compactMode ? <List size={14} /> : <AlignJustify size={14} />}
            <span className="hidden md:inline">
              {compactMode ? "紧凑" : "卡片"}
            </span>
          </button>

          {/* Group mode toggle */}
          <button
            onClick={() => {
              setGroupMode((v) => v === "date" ? "source" : "date");
              setCollapsedSources(new Set());
            }}
            title={groupMode === "date" ? "按信源分组" : "按日期分组"}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all",
              groupMode === "source"
                ? "bg-dark-accent/20 border-dark-accent/50 text-dark-accent"
                : "bg-dark-surface border-dark-border text-dark-muted hover:text-dark-text"
            )}
          >
            <Layers size={14} />
            <span className="hidden md:inline">
              {groupMode === "source" ? "按信源" : "按日期"}
            </span>
          </button>

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
      </div>

      {/* Keyword search */}
      {(mode === "feed" || mode === "all") && (
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted"
          />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={mode === "all" ? "搜索文章（标题/摘要/全文）..." : "关键词过滤标题..."}
            className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-dark-accent transition-colors"
          />
          {keyword && (
            <button
              onClick={() => setKeyword("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Unified filter row: built-in categories + user interest tags (feed mode only) */}
      {mode === "feed" && (
        <div className="flex gap-2 mb-6 flex-wrap items-center">
          {/* Built-in category tabs */}
          {BUILTIN_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => selectCategory(cat)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                (cat === "全部" ? !category : category === cat)
                  ? "bg-dark-accent text-black font-medium"
                  : "bg-dark-surface text-dark-muted hover:text-dark-text"
              )}
            >
              {cat}
            </button>
          ))}

          {/* Divider (only if there are interest tags) */}
          {interestTags.length > 0 && (
            <span className="w-px h-5 bg-dark-border flex-shrink-0 self-center" />
          )}

          {/* User interest tag pills */}
          {interestTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTagFilter(tag)}
              className={clsx(
                "text-sm px-3 py-1.5 rounded-lg border transition-all",
                activeTagFilters.includes(tag)
                  ? "bg-dark-accent/20 border-dark-accent text-dark-accent font-medium"
                  : "bg-dark-surface border-dark-border text-dark-muted hover:text-dark-text"
              )}
            >
              #{tag}
            </button>
          ))}

          {/* Clear all filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-dark-muted hover:text-red-400 transition-colors flex items-center gap-0.5"
            >
              <X size={11} />
              清除过滤
            </button>
          )}
        </div>
      )}

      {/* Articles */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-dark-muted" size={32} />
        </div>
      ) : displayArticles.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-dark-muted">暂无文章</p>
          {(activeTagFilters.length > 0 || keyword) && (
            <p className="text-xs text-dark-muted mt-2">
              当前有过滤条件，尝试
              <button
                onClick={clearFilters}
                className="text-dark-accent ml-1 hover:underline"
              >
                清除过滤
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([groupKey, items]) => {
            const isSourceGroup = groupMode === "source";
            const isCollapsed = isSourceGroup && collapsedSources.has(groupKey);

            return (
              <section key={groupKey}>
                {isSourceGroup ? (
                  /* ── Source group header: clickable, collapsible ── */
                  <button
                    onClick={() => toggleSourceCollapse(groupKey)}
                    className="w-full flex items-center gap-2 mb-3 sticky top-0 bg-dark-surface/90 backdrop-blur-sm py-2.5 z-10 -mx-2 px-3 rounded-lg hover:bg-dark-surface transition-colors group"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={14} className="text-dark-muted flex-shrink-0" />
                    ) : (
                      <ChevronDown size={14} className="text-dark-muted flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-dark-accent truncate">
                      {groupKey}
                    </span>
                    <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs bg-dark-accent/15 text-dark-accent px-2 py-0.5 rounded-full font-medium">
                        {items.length} 篇
                      </span>
                    </span>
                  </button>
                ) : (
                  /* ── Date group header ── */
                  <h2 className="text-sm font-medium text-dark-muted mb-3 sticky top-0 bg-dark-surface/90 backdrop-blur-sm py-2 z-10 -mx-2 px-2 rounded-lg">
                    {groupKey}
                    <span className="ml-2 text-xs opacity-60">({items.length})</span>
                  </h2>
                )}
                {!isCollapsed && (
                  <div className="space-y-3">
                    {items.map((article) => (
                      <ArticleCard
                        key={article.url_hash}
                        article={article}
                        onToggleStar={handleToggleStar}
                        onUpdateUserTags={handleUpdateUserTags}
                        onDelete={handleDeleteSingle}
                        compact={compactMode}
                        selectionMode={selectionMode}
                        selected={selectedHashes.has(article.url_hash)}
                        onToggleSelect={toggleSelect}
                        hideSource={isSourceGroup}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => fetchArticles(false)}
            disabled={loadingMore}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-dark-surface border border-dark-border text-sm text-dark-muted hover:text-dark-text transition-all disabled:opacity-50"
          >
            {loadingMore ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            加载更多 ({total - articles.length} 篇)
          </button>
        </div>
      )}
    </div>
  );
}
