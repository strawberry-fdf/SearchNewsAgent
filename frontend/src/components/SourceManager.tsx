/**
 * 信源管理页面 —— 列表展示所有信源，支持启用/禁用、新增、删除、编辑属性。
 * 支持按分类筛选、设置 fetch_since 日期範围。
 */
"use client";

import { useEffect, useState } from "react";
import {
  Database,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  Power,
  PowerOff,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
  FolderPlus,
} from "lucide-react";
import clsx from "clsx";
import {
  getSources,
  addSource,
  deleteSource,
  updateSource,
  type Source,
} from "@/lib/api";

// ── Category grouping helpers ──

const UNCATEGORIZED = "未分类";

function groupByCategory(sources: Source[]): Record<string, Source[]> {
  const groups: Record<string, Source[]> = {};
  for (const s of sources) {
    const cat = s.category?.trim() || UNCATEGORIZED;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }
  return groups;
}

// ── Inline editable field ──

function InlineEdit({
  value,
  onSave,
  className = "",
  placeholder = "",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function start() {
    setDraft(value);
    setEditing(true);
  }
  function save() {
    onSave(draft.trim());
    setEditing(false);
  }
  function cancel() {
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          className={clsx(
            "bg-dark-surface border border-dark-accent rounded px-2 py-0.5 text-sm focus:outline-none",
            className
          )}
          placeholder={placeholder}
        />
        <button onClick={save} className="text-emerald-400 hover:text-emerald-300">
          <Check size={14} />
        </button>
        <button onClick={cancel} className="text-dark-muted hover:text-dark-text">
          <X size={14} />
        </button>
      </span>
    );
  }

  return (
    <span
      onClick={start}
      className={clsx(
        "cursor-pointer hover:text-dark-accent transition-colors flex items-center gap-1",
        className
      )}
      title="点击编辑"
    >
      {value || <span className="text-dark-muted italic">{placeholder}</span>}
      <Pencil size={11} className="opacity-40" />
    </span>
  );
}

// ── Source row ──

function SourceRow({
  source,
  onToggleEnabled,
  onUpdateCategory,
  onUpdateFetchSince,
  onUpdateUrl,
  onDelete,
}: {
  source: Source;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onUpdateCategory: (id: string, category: string) => void;
  onUpdateFetchSince: (id: string, fetchSince: string | null) => void;
  onUpdateUrl: (id: string, url: string) => void;
  onDelete: (url: string) => void;
}) {
  const [editingSince, setEditingSince] = useState(false);
  const [sinceDraft, setSinceDraft] = useState(source.fetch_since?.split("T")[0] ?? "");

  function saveFetchSince() {
    onUpdateFetchSince(source.id, sinceDraft.trim() || null);
    setEditingSince(false);
  }
  return (
    <div
      className={clsx(
        "flex items-center gap-4 px-4 py-3 rounded-xl border transition-all",
        source.enabled
          ? "bg-dark-card border-dark-border"
          : "bg-dark-surface/50 border-dark-border/50 opacity-60"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-medium text-sm truncate">{source.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-dark-surface text-dark-muted">
            {source.source_type.toUpperCase()}
          </span>
          {source.tags.length > 0 &&
            source.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-dark-surface text-dark-muted border border-dark-border"
              >
                {tag}
              </span>
            ))}
        </div>
        <p className="text-xs text-dark-muted truncate flex items-center gap-1">
          <span>链接：</span>
          <InlineEdit
            value={source.url}
            placeholder="点击编辑 URL"
            onSave={(v) => { if (v) onUpdateUrl(source.id, v); }}
            className="text-xs font-mono"
          />
        </p>
        <div className="mt-1 flex items-center gap-1 text-xs text-dark-muted">
          <span>分类：</span>
          <InlineEdit
            value={source.category}
            placeholder="点击设置..."
            onSave={(v) => onUpdateCategory(source.id, v)}
            className="text-xs"
          />
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-dark-muted">
          <span>采集起始日：</span>
          {editingSince ? (
            <span className="flex items-center gap-1">
              <input
                type="date"
                value={sinceDraft}
                onChange={(e) => setSinceDraft(e.target.value)}
                className="bg-dark-surface border border-dark-accent rounded px-2 py-0.5 text-xs focus:outline-none"
              />
              <button onClick={saveFetchSince} className="text-emerald-400 hover:text-emerald-300">
                <Check size={12} />
              </button>
              <button onClick={() => setEditingSince(false)} className="text-dark-muted hover:text-dark-text">
                <X size={12} />
              </button>
            </span>
          ) : (
            <button
              onClick={() => { setSinceDraft(source.fetch_since?.split("T")[0] ?? ""); setEditingSince(true); }}
              className="cursor-pointer hover:text-dark-accent transition-colors flex items-center gap-1"
              title="点击设置采集起始日"
            >
              {source.fetch_since
                ? source.fetch_since.split("T")[0]
                : <span className="text-dark-muted italic">全部接收（点击设置）</span>
              }
              <Pencil size={11} className="opacity-40" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Toggle enabled */}
        <button
          onClick={() => onToggleEnabled(source.id, !source.enabled)}
          title={source.enabled ? "禁用" : "启用"}
          className={clsx(
            "p-2 rounded-lg transition-colors text-sm flex items-center gap-1",
            source.enabled
              ? "hover:bg-red-500/10 text-emerald-400 hover:text-red-400"
              : "hover:bg-emerald-500/10 text-dark-muted hover:text-emerald-400"
          )}
        >
          {source.enabled ? <Power size={14} /> : <PowerOff size={14} />}
          <span className="text-xs hidden md:inline">
            {source.enabled ? "启用中" : "已禁用"}
          </span>
        </button>

        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg hover:bg-dark-surface text-dark-muted hover:text-dark-text transition-colors"
        >
          <ExternalLink size={14} />
        </a>

        <button
          onClick={() => onDelete(source.url)}
          className="p-2 rounded-lg hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Category group ──

function CategoryGroup({
  name,
  sources,
  defaultOpen = true,
  onToggleEnabled,
  onUpdateCategory,
  onUpdateFetchSince,
  onUpdateUrl,
  onDelete,
  onRenameCategory,
}: {
  name: string;
  sources: Source[];
  defaultOpen?: boolean;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onUpdateCategory: (id: string, category: string) => void;
  onUpdateFetchSince: (id: string, fetchSince: string | null) => void;
  onUpdateUrl: (id: string, url: string) => void;
  onDelete: (url: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      {/* Category header */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-dark-text/80 hover:text-dark-text transition-colors"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {name === UNCATEGORIZED ? (
            <span className="text-dark-muted">{name}</span>
          ) : (
            <InlineEdit
              value={name}
              onSave={(newName) => {
                if (newName && newName !== name) onRenameCategory(name, newName);
              }}
              className="text-sm font-semibold"
            />
          )}
        </button>
        <span className="text-xs text-dark-muted bg-dark-surface px-1.5 py-0.5 rounded-full">
          {sources.length}
        </span>
      </div>

      {open && (
        <div className="space-y-2 pl-5 border-l border-dark-border/50">
          {sources.map((s) => (
            <SourceRow
              key={s.url}
              source={s}
              onToggleEnabled={onToggleEnabled}
              onUpdateCategory={onUpdateCategory}
              onUpdateFetchSince={onUpdateFetchSince}
              onUpdateUrl={onUpdateUrl}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ──

export default function SourceManager() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState("rss");
  const [newTags, setNewTags] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newFetchSince, setNewFetchSince] = useState("");

  useEffect(() => {
    loadSources();
  }, []);

  async function loadSources() {
    setLoading(true);
    try {
      const res = await getSources();
      setSources(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newName || !newUrl) return;
    try {
      await addSource({
        name: newName,
        url: newUrl,
        source_type: newType,
        tags: newTags.split(",").map((t) => t.trim()).filter(Boolean),
        category: newCategory.trim(),
        fetch_since: newFetchSince.trim() || null,
      });
      setNewName(""); setNewUrl(""); setNewTags(""); setNewCategory(""); setNewFetchSince("");
      setShowAdd(false);
      await loadSources();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleToggleEnabled(id: string, enabled: boolean) {
    try {
      await updateSource(id, { enabled });
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled } : s))
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpdateCategory(id: string, category: string) {
    try {
      await updateSource(id, { category });
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, category } : s))
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpdateFetchSince(id: string, fetchSince: string | null) {
    try {
      await updateSource(id, { fetch_since: fetchSince });
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, fetch_since: fetchSince } : s))
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpdateUrl(id: string, url: string) {
    try {
      await updateSource(id, { url });
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, url } : s))
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRenameCategory(oldName: string, newName: string) {
    // Batch update all sources in this category
    const targets = sources.filter(
      (s) => (s.category?.trim() || UNCATEGORIZED) === oldName
    );
    try {
      await Promise.all(
        targets.map((s) => updateSource(s.id, { category: newName }))
      );
      setSources((prev) =>
        prev.map((s) =>
          (s.category?.trim() || UNCATEGORIZED) === oldName
            ? { ...s, category: newName }
            : s
        )
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(url: string) {
    if (!confirm("确认删除此信源？")) return;
    try {
      await deleteSource(url);
      await loadSources();
    } catch (err) {
      console.error(err);
    }
  }

  const grouped = groupByCategory(sources);
  // Sort: categorized first, UNCATEGORIZED last
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });

  // Existing categories (for autocomplete)
  const existingCategories = Array.from(
    new Set(sources.map((s) => s.category?.trim()).filter(Boolean))
  );

  return (
    <div className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Database size={24} className="text-dark-accent" />
          <div>
            <h1 className="text-2xl font-bold">信源管理</h1>
            <p className="text-xs text-dark-muted mt-0.5">
              共 {sources.length} 个信源 · {sources.filter((s) => s.enabled).length} 个启用
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 transition-colors"
        >
          <Plus size={14} />
          添加信源
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-dark-muted mb-1 block">名称</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="OpenAI Blog"
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
            </div>
            <div>
              <label className="text-xs text-dark-muted mb-1 block">URL</label>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://openai.com/blog/rss.xml"
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
            </div>
            <div>
              <label className="text-xs text-dark-muted mb-1 block">类型</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              >
                <option value="rss">RSS Feed</option>
                <option value="web">网页爬取</option>
                <option value="api">API</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-muted mb-1 block">分类</label>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                list="category-suggestions"
                placeholder="AI / 量子计算 / ..."
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
              <datalist id="category-suggestions">
                {existingCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-dark-muted mb-1 block">
                标签（逗号分隔）
              </label>
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="大佬blog, 官方"
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
            </div>
            <div>
              <label className="text-xs text-dark-muted mb-1 block">
                采集起始日期（留空=全部接收）
              </label>
              <input
                type="date"
                value={newFetchSince}
                onChange={(e) => setNewFetchSince(e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
              <p className="text-xs text-dark-muted mt-1">仅处理该日期之后发布的文章</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-lg border border-dark-border text-sm text-dark-muted hover:text-dark-text transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 transition-colors"
            >
              确认添加
            </button>
          </div>
        </div>
      )}

      {/* Sources list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-dark-muted" size={32} />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">📡</div>
          <p className="text-dark-muted">暂无信源，点击上方按钮添加</p>
        </div>
      ) : (
        <div>
          {sortedKeys.map((cat) => (
            <CategoryGroup
              key={cat}
              name={cat}
              sources={grouped[cat]}
              defaultOpen={true}
              onToggleEnabled={handleToggleEnabled}
              onUpdateCategory={handleUpdateCategory}
              onUpdateFetchSince={handleUpdateFetchSince}
              onUpdateUrl={handleUpdateUrl}
              onDelete={handleDelete}
              onRenameCategory={handleRenameCategory}
            />
          ))}
        </div>
      )}
    </div>
  );
}
