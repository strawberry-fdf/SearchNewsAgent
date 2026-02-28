/**
 * 信源导航面板 —— 位于文章列表左侧，按分类展示所有信源（含禁用）及其文章数量。
 * 支持搜索、全部/单源筛选、分类折叠/展开。
 * 编辑模式：分类/信源重命名、置顶、取消订阅。
 */
"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Rss,
  FolderOpen,
  Pencil,
  Pin,
  X,
  Check,
} from "lucide-react";
import clsx from "clsx";
import {
  getSources,
  getSourceArticleCounts,
  updateSource,
  deleteSource,
  getPinnedCategories,
  updatePinnedCategories,
  type Source,
  type SourceCount,
} from "@/lib/api";

interface SourcePanelProps {
  mode: "feed" | "all" | "starred";
  activeSource: string | null;
  onSourceChange: (sourceName: string | null) => void;
}

const UNCATEGORIZED = "未分类";

/** 按 category 分组，置顶信源按 pin_order 排在前面，再按名称排序 */
function groupByCategory(sources: Source[]): Record<string, Source[]> {
  const groups: Record<string, Source[]> = {};
  for (const s of sources) {
    const cat = s.category?.trim() || UNCATEGORIZED;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }
  // 每个分类内：置顶信源按 pin_order 升序排前面，非置顶按 name 排序
  for (const cat of Object.keys(groups)) {
    groups[cat].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.pinned && b.pinned) return (a.pin_order ?? 0) - (b.pin_order ?? 0);
      return a.name.localeCompare(b.name);
    });
  }
  return groups;
}

// ── Inline edit input ──

function InlineInput({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave(draft.trim());
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onSave(draft.trim())}
      className="w-full bg-dark-card border border-dark-accent rounded px-1.5 py-0.5 text-xs focus:outline-none"
    />
  );
}

export default function SourcePanel({
  mode,
  activeSource,
  onSourceChange,
}: SourcePanelProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [counts, setCounts] = useState<SourceCount[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // 编辑模式
  const [editMode, setEditMode] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  // 分类置顶列表（有序）
  const [pinnedCategories, setPinnedCategories] = useState<string[]>([]);

  // 加载信源列表和计数：精选模式按 selected 过滤，其它模式取全部
  useEffect(() => {
    const status = mode === "feed" ? "selected" : undefined;
    Promise.all([
      getSources(),
      getSourceArticleCounts(status),
      getPinnedCategories(),
    ]).then(([srcRes, countRes, pinCatRes]) => {
      setSources(srcRes.items);
      setCounts(countRes.items);
      setTotalCount(countRes.total);
      setPinnedCategories(pinCatRes.pinned_categories || []);
    }).catch(console.error);
  }, [mode]);

  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of counts) {
      map.set(c.source_name, c.count);
    }
    return map;
  }, [counts]);

  const grouped = useMemo(() => groupByCategory(sources), [sources]);

  // 分类排序：置顶分类按置顶顺序优先 → 非置顶按文章数降序 → 未分类最后
  const sortedCategories = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      if (a === UNCATEGORIZED && b !== UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED && a !== UNCATEGORIZED) return -1;
      const pinIdxA = pinnedCategories.indexOf(a);
      const pinIdxB = pinnedCategories.indexOf(b);
      const isPinnedA = pinIdxA !== -1;
      const isPinnedB = pinIdxB !== -1;
      // 置顶分类优先
      if (isPinnedA && !isPinnedB) return -1;
      if (!isPinnedA && isPinnedB) return 1;
      // 都置顶时按置顶顺序
      if (isPinnedA && isPinnedB) return pinIdxA - pinIdxB;
      // 都未置顶时按文章数降序
      const countA = grouped[a].reduce((sum, s) => sum + (countMap.get(s.name) || 0), 0);
      const countB = grouped[b].reduce((sum, s) => sum + (countMap.get(s.name) || 0), 0);
      return countB - countA;
    });
  }, [grouped, countMap, pinnedCategories]);

  // 搜索过滤
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return sortedCategories;
    const q = searchQuery.trim().toLowerCase();
    return sortedCategories.filter((cat) => {
      if (cat.toLowerCase().includes(q)) return true;
      return grouped[cat].some((s) => s.name.toLowerCase().includes(q));
    });
  }, [sortedCategories, grouped, searchQuery]);

  const filterSourcesInCategory = (cat: string): Source[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return grouped[cat];
    if (cat.toLowerCase().includes(q)) return grouped[cat];
    return grouped[cat].filter((s) => s.name.toLowerCase().includes(q));
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // ── 编辑操作 ──

  const handleRenameSource = async (id: string, newName: string) => {
    setEditingSourceId(null);
    if (!newName) return;
    const src = sources.find((s) => s.id === id);
    if (!src || src.name === newName) return;
    try {
      await updateSource(id, { name: newName });
      setSources((prev) => prev.map((s) => s.id === id ? { ...s, name: newName } : s));
    } catch (err) { console.error(err); }
  };

  const handleRenameCategory = async (oldCat: string, newCat: string) => {
    setEditingCategory(null);
    if (!newCat || newCat === oldCat) return;
    const targets = sources.filter((s) => (s.category?.trim() || UNCATEGORIZED) === oldCat);
    try {
      await Promise.all(targets.map((s) => updateSource(s.id, { category: newCat })));
      setSources((prev) =>
        prev.map((s) =>
          (s.category?.trim() || UNCATEGORIZED) === oldCat ? { ...s, category: newCat } : s
        )
      );
    } catch (err) { console.error(err); }
  };

  const handleTogglePin = async (id: string) => {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    const newVal = !src.pinned;
    try {
      // 置顶时设置 pin_order 为当前分类内最大 pin_order + 1
      let pinOrder = 0;
      if (newVal) {
        const cat = src.category?.trim() || UNCATEGORIZED;
        const siblings = sources.filter(
          (s) => (s.category?.trim() || UNCATEGORIZED) === cat && s.pinned
        );
        pinOrder = siblings.length > 0
          ? Math.max(...siblings.map((s) => s.pin_order ?? 0)) + 1
          : 1;
      }
      await updateSource(id, { pinned: newVal, pin_order: newVal ? pinOrder : 0 });
      setSources((prev) =>
        prev.map((s) => s.id === id ? { ...s, pinned: newVal, pin_order: newVal ? pinOrder : 0 } : s)
      );
    } catch (err) { console.error(err); }
  };

  const handleToggleCategoryPin = async (cat: string) => {
    const isPinned = pinnedCategories.includes(cat);
    let newList: string[];
    if (isPinned) {
      newList = pinnedCategories.filter((c) => c !== cat);
    } else {
      newList = [...pinnedCategories, cat];
    }
    try {
      await updatePinnedCategories(newList);
      setPinnedCategories(newList);
    } catch (err) { console.error(err); }
  };

  const handleUnsubscribe = async (source: Source) => {
    if (!confirm(`确定要取消订阅「${source.name}」吗？`)) return;
    try {
      await deleteSource(source.url);
      setSources((prev) => prev.filter((s) => s.id !== source.id));
      if (activeSource === source.name) onSourceChange(null);
    } catch (err) { console.error(err); }
  };

  return (
    <div
      className={clsx(
        "w-64 flex-shrink-0 border-r bg-dark-card flex flex-col h-full overflow-hidden transition-colors",
        editMode ? "border-dark-accent/40" : "border-dark-border"
      )}
    >
      {/* 搜索栏 + 编辑按钮 */}
      <div className="px-3 pt-4 pb-2 border-b border-dark-border space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-muted"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索订阅源..."
              className="w-full bg-dark-surface border border-dark-border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-dark-accent transition-colors placeholder:text-dark-muted/60"
            />
          </div>
          <button
            onClick={() => {
              setEditMode((v) => !v);
              setEditingSourceId(null);
              setEditingCategory(null);
            }}
            title={editMode ? "完成编辑" : "编辑信源"}
            className={clsx(
              "p-1.5 rounded-lg transition-colors flex-shrink-0",
              editMode
                ? "bg-dark-accent text-black"
                : "text-dark-muted hover:text-dark-accent hover:bg-dark-surface"
            )}
          >
            {editMode ? <Check size={14} /> : <Pencil size={14} />}
          </button>
        </div>
        {editMode && (
          <div className="text-[10px] text-dark-accent font-medium tracking-wide">
            编辑模式 · 点击名称重命名
          </div>
        )}
      </div>

      {/* 信源列表 */}
      <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
        {/* 全部 */}
        <button
          onClick={() => onSourceChange(null)}
          className={clsx(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
            activeSource === null
              ? "bg-dark-accent/15 text-dark-accent font-medium"
              : "text-dark-text hover:bg-dark-surface/70"
          )}
        >
          <FolderOpen size={15} className="flex-shrink-0 opacity-70" />
          <span className="truncate">全部</span>
          <span
            className={clsx(
              "ml-auto text-xs px-1.5 py-0.5 rounded-full flex-shrink-0",
              activeSource === null
                ? "bg-dark-accent/20 text-dark-accent"
                : "bg-dark-surface text-dark-muted"
            )}
          >
            {totalCount}
          </span>
        </button>

        {/* 分类 + 信源 */}
        {filteredCategories.map((cat) => {
          const isCollapsed = collapsedCategories.has(cat);
          const sourcesInCat = filterSourcesInCategory(cat);
          const catCount = grouped[cat].reduce(
            (sum, s) => sum + (countMap.get(s.name) || 0),
            0
          );

          return (
            <div key={cat} className="mt-1">
              {/* 分类头 */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-dark-muted hover:text-dark-text hover:bg-dark-surface/50 transition-colors min-w-0"
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="flex-shrink-0 opacity-60" />
                  ) : (
                    <ChevronDown size={12} className="flex-shrink-0 opacity-60" />
                  )}
                  {editMode && editingCategory === cat && cat !== UNCATEGORIZED ? (
                    <InlineInput
                      value={cat}
                      onSave={(v) => handleRenameCategory(cat, v)}
                      onCancel={() => setEditingCategory(null)}
                    />
                  ) : (
                    <span
                      className={clsx("truncate", editMode && cat !== UNCATEGORIZED && "cursor-text hover:text-dark-accent")}
                      onClick={(e) => {
                        if (editMode && cat !== UNCATEGORIZED) {
                          e.stopPropagation();
                          setEditingCategory(cat);
                        }
                      }}
                    >
                      {cat}
                    </span>
                  )}
                  {/* 正常模式下显示置顶标记 */}
                  {!editMode && pinnedCategories.includes(cat) && (
                    <Pin size={10} className="text-dark-accent/60 flex-shrink-0" />
                  )}
                  <span className="ml-auto text-[10px] bg-dark-surface px-1.5 py-0.5 rounded-full text-dark-muted flex-shrink-0">
                    {catCount}
                  </span>
                </button>
                {/* 编辑模式：分类置顶按钮 */}
                {editMode && cat !== UNCATEGORIZED && (
                  <button
                    onClick={() => handleToggleCategoryPin(cat)}
                    title={pinnedCategories.includes(cat) ? "取消置顶分类" : "置顶分类"}
                    className={clsx(
                      "p-1 rounded transition-colors flex-shrink-0",
                      pinnedCategories.includes(cat)
                        ? "text-dark-accent"
                        : "text-dark-muted hover:text-dark-accent"
                    )}
                  >
                    <Pin size={12} />
                  </button>
                )}
              </div>

              {/* 信源列表 */}
              {!isCollapsed && (
                <div className="ml-1 space-y-0.5">
                  {sourcesInCat.map((source) => {
                    const articleCount = countMap.get(source.name) || 0;
                    const isActive = activeSource === source.name;
                    const isDisabled = !source.enabled;

                    return (
                      <div
                        key={source.id}
                        className={clsx(
                          "w-full flex items-center gap-1.5 pl-5 pr-2 py-1.5 rounded-lg text-xs transition-colors group",
                          isActive
                            ? "bg-dark-accent/15 text-dark-accent font-medium"
                            : isDisabled
                            ? "text-dark-muted/50 hover:bg-dark-surface/40"
                            : "text-dark-text/80 hover:bg-dark-surface/70 hover:text-dark-text"
                        )}
                      >
                        {/* 状态圆点 */}
                        <span
                          className={clsx(
                            "w-1.5 h-1.5 rounded-full flex-shrink-0",
                            isDisabled ? "bg-dark-muted/30" : "bg-emerald-400"
                          )}
                          title={isDisabled ? "未启用" : "已启用"}
                        />

                        {/* 名称 / 内联编辑 */}
                        {editMode && editingSourceId === source.id ? (
                          <InlineInput
                            value={source.name}
                            onSave={(v) => handleRenameSource(source.id, v)}
                            onCancel={() => setEditingSourceId(null)}
                          />
                        ) : (
                          <button
                            onClick={() => {
                              if (editMode) {
                                setEditingSourceId(source.id);
                              } else {
                                onSourceChange(source.name);
                              }
                            }}
                            className={clsx(
                              "flex-1 text-left truncate min-w-0",
                              isDisabled && !isActive && "opacity-50"
                            )}
                          >
                            {source.name}
                          </button>
                        )}

                        {/* 编辑模式操作按钮 */}
                        {editMode && editingSourceId !== source.id ? (
                          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleTogglePin(source.id)}
                              title={source.pinned ? "取消置顶" : "置顶"}
                              className={clsx(
                                "p-0.5 rounded transition-colors",
                                source.pinned
                                  ? "text-dark-accent"
                                  : "text-dark-muted hover:text-dark-accent"
                              )}
                            >
                              <Pin size={11} />
                            </button>
                            <button
                              onClick={() => handleUnsubscribe(source)}
                              title="取消订阅"
                              className="p-0.5 rounded text-dark-muted hover:text-red-400 transition-colors"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : !editMode ? (
                          /* 正常模式：显示置顶图标（如有）+ 计数 */
                          <>
                            {!!source.pinned && (
                              <Pin size={10} className="text-dark-accent/60 flex-shrink-0" />
                            )}
                            <span
                              className={clsx(
                                "ml-auto text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0",
                                isActive
                                  ? "bg-dark-accent/20 text-dark-accent"
                                  : "bg-dark-surface text-dark-muted"
                              )}
                            >
                              {articleCount}
                            </span>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* 空状态 */}
        {filteredCategories.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-dark-muted">未找到匹配的信源</p>
          </div>
        )}
      </div>
    </div>
  );
}
