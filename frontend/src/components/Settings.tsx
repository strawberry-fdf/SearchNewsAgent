/**
 * 设置页面组件 —— 管理主题切换、LLM 开关、筛选规则（预设+默认要求合并）、缓存管理。
 * 预设与手动筛选要求合并为统一的"筛选规则"区块，默认筛选要求作为兜底规则。
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Settings2,
  Plus,
  Trash2,
  Loader2,
  Brain,
  Save,
  ChevronDown,
  ChevronUp,
  Check,
  Palette,
  Filter,
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";
import {
  getSettings,
  updateSettings,
  getFilterPresets,
  createFilterPreset,
  updateFilterPreset,
  toggleFilterPresetActive,
  deactivateFilterPresets,
  deleteFilterPreset,
  getCacheStats,
  clearCache,
  type AppSettings,
  type FilterPreset,
  type CacheStats,
  type CacheSourceStat,
} from "@/lib/api";
import { useTheme } from "./ThemeProvider";

// ── Toggle switch ──

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-dark-muted mt-0.5">{description}</div>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0",
          checked ? "bg-dark-accent" : "bg-dark-border"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

// ── Section card ──

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-dark-border">
        <Icon size={18} className="text-dark-accent" />
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          {subtitle && <p className="text-xs text-dark-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPromptDraft, setFilterPromptDraft] = useState("");
  const [filterPromptSaving, setFilterPromptSaving] = useState(false);
  const [filterPromptSaved, setFilterPromptSaved] = useState(false);

  // Preset editor state
  const [expandedPresetId, setExpandedPresetId] = useState<string | null>(null);
  const [presetPromptDrafts, setPresetPromptDrafts] = useState<Record<string, string>>({});
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetPrompt, setNewPresetPrompt] = useState("");
  const [showNewPresetForm, setShowNewPresetForm] = useState(false);
  const [presetSaving, setPresetSaving] = useState<string | null>(null);
  const [showDefaultPrompt, setShowDefaultPrompt] = useState(false);

  // Cache management state
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [showCacheConfirm, setShowCacheConfirm] = useState<"all" | "selected" | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        getSettings(),
        getFilterPresets(),
      ]);
      setAppSettings(s);
      setPresets(p.items);
      setFilterPromptDraft(s.llm_filter_prompt ?? "");
      const drafts: Record<string, string> = {};
      for (const preset of p.items) {
        drafts[preset.id] = preset.prompt;
      }
      setPresetPromptDrafts(drafts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    // Load cache stats in parallel (non-blocking)
    loadCacheStats();
  }

  async function loadCacheStats() {
    setCacheLoading(true);
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (err) {
      console.error(err);
    } finally {
      setCacheLoading(false);
    }
  }

  // ── Cache management ──

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function toggleSourceSelection(sourceId: string) {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }

  async function handleClearCache(mode: "all" | "selected") {
    setCacheClearing(true);
    try {
      const ids = mode === "selected" ? Array.from(selectedSourceIds) : null;
      await clearCache(ids);
      setSelectedSourceIds(new Set());
      setShowCacheConfirm(null);
      await loadCacheStats();
    } catch (err) {
      console.error(err);
    } finally {
      setCacheClearing(false);
    }
  }

  // ── LLM setting ──

  async function handleLlmToggle(enabled: boolean) {
    try {
      const updated = await updateSettings({ llm_enabled: enabled });
      setAppSettings(updated);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleFilterPromptSave() {
    setFilterPromptSaving(true);
    try {
      const updated = await updateSettings({ llm_filter_prompt: filterPromptDraft });
      setAppSettings(updated);
      setFilterPromptSaved(true);
      setTimeout(() => setFilterPromptSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setFilterPromptSaving(false);
    }
  }

  // ── Filter Presets (multi-select) ──

  async function handleCreatePreset() {
    const name = newPresetName.trim();
    if (!name) return;
    try {
      const res = await createFilterPreset(name, newPresetPrompt);
      const newPreset: FilterPreset = {
        id: res.id,
        name,
        prompt: newPresetPrompt,
        is_active: false,
        created_at: new Date().toISOString(),
      };
      setPresets((prev) => [...prev, newPreset]);
      setPresetPromptDrafts((prev) => ({ ...prev, [res.id]: newPresetPrompt }));
      setNewPresetName("");
      setNewPresetPrompt("");
      setShowNewPresetForm(false);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSavePresetPrompt(presetId: string) {
    setPresetSaving(presetId);
    try {
      await updateFilterPreset(presetId, { prompt: presetPromptDrafts[presetId] ?? "" });
      setPresets((prev) =>
        prev.map((p) => p.id === presetId ? { ...p, prompt: presetPromptDrafts[presetId] ?? "" } : p)
      );
    } catch (err) {
      console.error(err);
    } finally {
      setPresetSaving(null);
    }
  }

  async function handleTogglePresetActive(presetId: string) {
    try {
      const res = await toggleFilterPresetActive(presetId);
      setPresets((prev) =>
        prev.map((p) => p.id === presetId ? { ...p, is_active: res.is_active } : p)
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeactivatePresets() {
    try {
      await deactivateFilterPresets();
      setPresets((prev) => prev.map((p) => ({ ...p, is_active: false })));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeletePreset(presetId: string) {
    try {
      await deleteFilterPreset(presetId);
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      setPresetPromptDrafts((prev) => { const n = { ...prev }; delete n[presetId]; return n; });
      if (expandedPresetId === presetId) setExpandedPresetId(null);
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-dark-muted" size={32} />
      </div>
    );
  }

  const activePresetCount = presets.filter((p) => p.is_active).length;

  return (
    <div className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
      <div className="flex items-center gap-3 mb-8">
        <Settings2 size={24} className="text-dark-accent" />
        <h1 className="text-2xl font-bold">设置</h1>
      </div>

      <div className="space-y-6">
        {/* ── Theme selector ── */}
        <SectionCard icon={Palette} title="主题外观" subtitle="切换界面显示主题">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium flex-1">外观模式</label>
            <select
              value={themeMode}
              onChange={(e) => setThemeMode(e.target.value as "light" | "dark" | "system")}
              className="bg-dark-surface border border-dark-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-dark-accent transition-colors"
            >
              <option value="light">亮色</option>
              <option value="dark">暗色</option>
              <option value="system">跟随系统</option>
            </select>
          </div>
        </SectionCard>

        {/* ── LLM Settings ── */}
        <SectionCard icon={Brain} title="大模型分析" subtitle="启用后 LLM 将对文章进行评分、摘要和筛选">
          {appSettings && (
            <Toggle
              checked={appSettings.llm_enabled}
              onChange={handleLlmToggle}
              label="启用 LLM 分析"
              description={appSettings.llm_enabled ? "AI 分析流水线已开启" : "仅抓取原始标题，不消耗 API"}
            />
          )}
        </SectionCard>

        {/* ── Unified Filter Rules (presets + default prompt merged) ── */}
        <SectionCard icon={Filter} title="筛选规则" subtitle="自定义筛选策略，多条规则可叠加生效">

          {/* Active status banner */}
          {activePresetCount > 0 ? (
            <div className="flex items-center justify-between rounded-lg bg-dark-accent/10 border border-dark-accent/30 px-3 py-2">
              <span className="text-xs text-dark-accent">
                当前激活：<strong>{activePresetCount} 条规则</strong>
                （{presets.filter((p) => p.is_active).map((p) => p.name).join("、")}）
              </span>
              <button
                onClick={handleDeactivatePresets}
                className="text-xs text-dark-muted hover:text-red-400 transition-colors"
              >
                全部取消
              </button>
            </div>
          ) : (
            <div className="rounded-lg bg-dark-surface border border-dark-border px-3 py-2 text-xs text-dark-muted">
              暂无激活规则，将使用默认筛选要求
            </div>
          )}

          {/* Presets list with multi-select checkboxes */}
          <div className="space-y-2">
            {presets.length === 0 && (
              <p className="text-xs text-dark-muted italic">暂无自定义规则，点击下方「新建规则」创建</p>
            )}
            {presets.map((preset) => (
              <div key={preset.id} className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {/* Multi-select checkbox */}
                  <button
                    onClick={() => handleTogglePresetActive(preset.id)}
                    title={preset.is_active ? "取消激活" : "激活此规则"}
                    className={clsx(
                      "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                      preset.is_active
                        ? "bg-dark-accent border-dark-accent"
                        : "border-dark-muted hover:border-dark-accent"
                    )}
                  >
                    {preset.is_active && <Check size={12} className="text-black" />}
                  </button>

                  <span className={clsx("flex-1 text-sm font-medium", preset.is_active && "text-dark-accent")}>
                    {preset.name}
                  </span>

                  {preset.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-dark-accent/20 text-dark-accent">激活</span>
                  )}

                  {/* Expand/collapse prompt editor */}
                  <button
                    onClick={() =>
                      setExpandedPresetId(expandedPresetId === preset.id ? null : preset.id)
                    }
                    className="p-1 rounded hover:bg-dark-card text-dark-muted hover:text-dark-text transition-colors"
                    title="编辑内容"
                  >
                    {expandedPresetId === preset.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeletePreset(preset.id)}
                    className="p-1 rounded hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors"
                    title="删除规则"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Inline prompt editor */}
                {expandedPresetId === preset.id && (
                  <div className="border-t border-dark-border px-3 py-3 space-y-2">
                    <p className="text-xs text-dark-muted">筛选要求内容（传递给 LLM）</p>
                    <textarea
                      value={presetPromptDrafts[preset.id] ?? preset.prompt}
                      onChange={(e) =>
                        setPresetPromptDrafts((prev) => ({ ...prev, [preset.id]: e.target.value }))
                      }
                      rows={4}
                      placeholder="例：只有涉及大模型发布、重大研究突破或行业动态的文章才应进入精选..."
                      className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent resize-y font-mono"
                    />
                    <button
                      onClick={() => handleSavePresetPrompt(preset.id)}
                      disabled={presetSaving === preset.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-accent text-black text-xs font-medium hover:bg-dark-accent/80 disabled:opacity-50 transition-colors"
                    >
                      {presetSaving === preset.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Save size={12} />
                      )}
                      保存内容
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* New preset form */}
          {showNewPresetForm ? (
            <div className="rounded-xl border border-dark-accent/40 bg-dark-card p-4 space-y-3">
              <p className="text-sm font-medium">新建筛选规则</p>
              <input
                autoFocus
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="规则名称，如：严格精选、宽松模式..."
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
              <textarea
                value={newPresetPrompt}
                onChange={(e) => setNewPresetPrompt(e.target.value)}
                placeholder="筛选要求内容（可为空）"
                rows={3}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent resize-y font-mono"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreatePreset}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 transition-colors"
                >
                  <Plus size={14} />
                  创建
                </button>
                <button
                  onClick={() => { setShowNewPresetForm(false); setNewPresetName(""); setNewPresetPrompt(""); }}
                  className="px-4 py-2 rounded-lg border border-dark-border text-sm text-dark-muted hover:text-dark-text transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewPresetForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dashed border-dark-border text-sm text-dark-muted hover:text-dark-text hover:border-dark-accent/50 transition-colors w-full justify-center"
            >
              <Plus size={14} />
              新建规则
            </button>
          )}

          {/* Default filter prompt (collapsible, always present) */}
          <div className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
            <button
              onClick={() => setShowDefaultPrompt((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border-2 border-dark-muted/40 flex items-center justify-center bg-dark-muted/10">
                  <span className="text-[9px] text-dark-muted font-bold">默</span>
                </div>
                <span className="text-dark-muted font-medium">默认筛选要求</span>
                {activePresetCount === 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-dark-accent/20 text-dark-accent">生效中</span>
                )}
              </div>
              {showDefaultPrompt ? <ChevronUp size={14} className="text-dark-muted" /> : <ChevronDown size={14} className="text-dark-muted" />}
            </button>
            {showDefaultPrompt && (
              <div className="border-t border-dark-border px-3 py-3 space-y-2">
                <p className="text-xs text-dark-muted">
                  当无自定义规则激活时，此默认要求将作为 LLM 的筛选标准。
                </p>
                <textarea
                  value={filterPromptDraft}
                  onChange={(e) => setFilterPromptDraft(e.target.value)}
                  placeholder={
                    "例：只有涉及大模型发布、重大研究突破或行业平台级动态的文章才应进入精选，\n" +
                    "过滤评测类小平台或低质量入门教程。"
                  }
                  rows={4}
                  className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent resize-y font-mono"
                />
                <button
                  onClick={handleFilterPromptSave}
                  disabled={filterPromptSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-accent text-black text-xs font-medium hover:bg-dark-accent/80 disabled:opacity-50 transition-colors"
                >
                  {filterPromptSaving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  {filterPromptSaved ? "已保存" : "保存"}
                </button>
              </div>
            )}
          </div>

        </SectionCard>

        {/* ── Cache Management ── */}
        <SectionCard icon={HardDrive} title="缓存管理" subtitle="查看和清理已下载的文章缓存数据">
          {cacheLoading && !cacheStats ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="animate-spin text-dark-muted" size={20} />
            </div>
          ) : cacheStats ? (
            <div className="space-y-4">
              {/* Overall stats */}
              <div className="flex items-center justify-between rounded-lg bg-dark-surface border border-dark-border px-4 py-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    数据库文件大小：<span className="text-dark-accent">{formatBytes(cacheStats.db_file_size_bytes)}</span>
                  </div>
                  <div className="text-xs text-dark-muted">
                    共 {cacheStats.total_articles} 篇文章缓存
                  </div>
                </div>
                <button
                  onClick={() => loadCacheStats()}
                  disabled={cacheLoading}
                  className="text-xs text-dark-muted hover:text-dark-text transition-colors px-2 py-1 rounded"
                >
                  {cacheLoading ? <Loader2 size={12} className="animate-spin" /> : "刷新"}
                </button>
              </div>

              {/* Per-source cache list */}
              {cacheStats.sources.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-dark-muted font-medium">按信源查看（勾选可选择性清除）：</p>
                  <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-dark-border p-2 bg-dark-surface">
                    {cacheStats.sources.map((src) => {
                      const sid = src.source_id ?? src.source_name;
                      const isSelected = selectedSourceIds.has(sid);
                      return (
                        <label
                          key={sid}
                          className={clsx(
                            "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                            isSelected ? "bg-dark-accent/10 border border-dark-accent/30" : "hover:bg-dark-card border border-transparent"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSourceSelection(sid)}
                            className="accent-[hsl(var(--accent))] w-4 h-4 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{src.source_name}</div>
                            <div className="text-xs text-dark-muted">
                              {src.article_count} 篇 · 内容约 {formatBytes(src.estimated_bytes)}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {selectedSourceIds.size > 0 && (
                  <button
                    onClick={() => setShowCacheConfirm("selected")}
                    disabled={cacheClearing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-medium hover:bg-orange-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 size={14} />
                    清除所选（{selectedSourceIds.size} 个信源）
                  </button>
                )}
                <button
                  onClick={() => setShowCacheConfirm("all")}
                  disabled={cacheClearing || cacheStats.total_articles === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={14} />
                  清除全部缓存
                </button>
              </div>

              {/* Confirm dialog */}
              {showCacheConfirm && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      {showCacheConfirm === "all" ? (
                        <span>确定要清除 <strong>全部 {cacheStats.total_articles} 篇</strong> 文章缓存吗？此操作不可撤销。</span>
                      ) : (
                        <span>确定要清除选中的 <strong>{selectedSourceIds.size} 个信源</strong> 的文章缓存吗？此操作不可撤销。</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleClearCache(showCacheConfirm)}
                      disabled={cacheClearing}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                    >
                      {cacheClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      {cacheClearing ? "清除中..." : "确认清除"}
                    </button>
                    <button
                      onClick={() => setShowCacheConfirm(null)}
                      className="px-4 py-2 rounded-lg border border-dark-border text-sm text-dark-muted hover:text-dark-text transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-dark-muted">无法加载缓存信息</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
