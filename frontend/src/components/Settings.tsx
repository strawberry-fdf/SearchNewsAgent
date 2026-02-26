/**
 * 设置页面组件 —— 管理 LLM 开关、兴趣标签、关键词规则、筛选预设方案。
 * 分为四个卡片区块，每个区块独立的增删改查逻辑。
 */
"use client";

import { useEffect, useState } from "react";
import {
  Settings2,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Tag,
  Filter,
  Brain,
  X,
  Save,
  BookMarked,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import clsx from "clsx";
import {
  getSettings,
  updateSettings,
  getInterestTags,
  addInterestTag,
  deleteInterestTag,
  getKeywordRules,
  addKeywordRule,
  toggleKeywordRule,
  deleteKeywordRule,
  getFilterPresets,
  createFilterPreset,
  updateFilterPreset,
  activateFilterPreset,
  deactivateFilterPresets,
  deleteFilterPreset,
  type AppSettings,
  type KeywordRule,
  type FilterPreset,
} from "@/lib/api";

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
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [rules, setRules] = useState<KeywordRule[]>([]);
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

  // Forms
  const [newTag, setNewTag] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newRuleField, setNewRuleField] = useState("title");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, t, r, p] = await Promise.all([
        getSettings(),
        getInterestTags(),
        getKeywordRules(),
        getFilterPresets(),
      ]);
      setAppSettings(s);
      setInterestTags(t.items);
      setRules(r.items);
      setPresets(p.items);
      setFilterPromptDraft(s.llm_filter_prompt ?? "");
      // Initialise draft prompts
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

  // ── Interest tags ──

  async function handleAddTag() {
    const tag = newTag.trim();
    if (!tag) return;
    try {
      await addInterestTag(tag);
      setInterestTags((prev) => [...prev, tag]);
      setNewTag("");
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteTag(tag: string) {
    try {
      await deleteInterestTag(tag);
      setInterestTags((prev) => prev.filter((t) => t !== tag));
    } catch (err) {
      console.error(err);
    }
  }

  // ── Keyword rules ──

  async function handleAddRule() {
    const kw = newKeyword.trim();
    if (!kw) return;
    try {
      const res = await addKeywordRule(kw, newRuleField);
      setRules((prev) => [
        ...prev,
        {
          id: res.id,
          keyword: kw,
          field: newRuleField,
          enabled: true,
          created_at: new Date().toISOString(),
        },
      ]);
      setNewKeyword("");
    } catch (err) {
      console.error(err);
    }
  }

  // ── Filter Presets ──

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

  async function handleActivatePreset(presetId: string) {
    try {
      await activateFilterPreset(presetId);
      setPresets((prev) => prev.map((p) => ({ ...p, is_active: p.id === presetId })));
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

  async function handleToggleRule(id: string) {
    try {
      const res = await toggleKeywordRule(id);
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled: res.enabled } : r))
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteRule(id: string) {
    try {
      await deleteKeywordRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
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

  return (
    <div className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
      <div className="flex items-center gap-3 mb-8">
        <Settings2 size={24} className="text-dark-accent" />
        <h1 className="text-2xl font-bold">设置</h1>
      </div>

      <div className="space-y-6">
        {/* ── LLM Settings ── */}
        <SectionCard
          icon={Brain}
          title="大模型分析"
          subtitle="控制是否使用 LLM 对文章进行深度分析和智能筛选"
        >
          {appSettings && (
            <Toggle
              checked={appSettings.llm_enabled}
              onChange={handleLlmToggle}
              label="启用 LLM 分析"
              description={
                appSettings.llm_enabled
                  ? "开启：LLM 对文章进行分析、评分、摘要生成，并按规则筛选精选文章"
                  : "关闭：不调用 LLM，抓取原始标题直接入库并全部标记为已选"
              }
            />
          )}

          {/* LLM filter prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">手动筛选要求（无预设激活时使用）</div>
                <div className="text-xs text-dark-muted mt-0.5">
                  补充给 LLM 的筛选要求，影响 model_selected 判断。有激活预设时自动使用预设内容。
                </div>
              </div>
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
            <textarea
              value={filterPromptDraft}
              onChange={(e) => setFilterPromptDraft(e.target.value)}
              placeholder={
                "例：只有涉及大模型发布、重大研究突破或行业平台级动态的文章才应进入精选，\n" +
                "过滤㤊评测类小平台或低质量入门教程。"
              }
              rows={5}
              className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent resize-y font-mono"
            />
          </div>

          <div className="rounded-lg bg-dark-surface border border-dark-border p-3 text-xs text-dark-muted space-y-1">
            <p>• <strong className="text-dark-text">开启</strong>：完整 AI 分析流水线，生成摘要、分类、重要性评分，消耗 API 额度</p>
            <p>• <strong className="text-dark-text">关闭</strong>：极速模式，仅抓取原始标题，不消耗 API，配合关键词规则使用</p>
          </div>
        </SectionCard>

        {/* ── Filter Presets ── */}
        <SectionCard
          icon={BookMarked}
          title="筛选规则预设"
          subtitle="保存多个筛选指令预设，运行流水线时自动使用激活的预设"
        >
          {/* Active status banner */}
          {presets.some((p) => p.is_active) ? (
            <div className="flex items-center justify-between rounded-lg bg-dark-accent/10 border border-dark-accent/30 px-3 py-2">
              <span className="text-xs text-dark-accent">
                当前激活：<strong>{presets.find((p) => p.is_active)?.name}</strong>
              </span>
              <button
                onClick={handleDeactivatePresets}
                className="text-xs text-dark-muted hover:text-red-400 transition-colors"
              >
                取消激活
              </button>
            </div>
          ) : (
            <div className="rounded-lg bg-dark-surface border border-dark-border px-3 py-2 text-xs text-dark-muted">
              暂无激活预设，将使用上方手动筛选要求
            </div>
          )}

          {/* Presets list */}
          <div className="space-y-2">
            {presets.length === 0 && (
              <p className="text-xs text-dark-muted italic">暂无预设，点击「新建预设」创建第一个</p>
            )}
            {presets.map((preset) => (
              <div key={preset.id} className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {/* Active indicator / toggle active */}
                  <button
                    onClick={() =>
                      preset.is_active ? handleDeactivatePresets() : handleActivatePreset(preset.id)
                    }
                    title={preset.is_active ? "取消激活" : "设为激活预设"}
                    className="flex-shrink-0"
                  >
                    {preset.is_active ? (
                      <CheckCircle2 size={16} className="text-dark-accent" />
                    ) : (
                      <Circle size={16} className="text-dark-muted hover:text-dark-accent transition-colors" />
                    )}
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
                    title="删除预设"
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
              <p className="text-sm font-medium">新建预设</p>
              <input
                autoFocus
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="预设名称，如：严格精选、宽松模式..."
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
              新建预设
            </button>
          )}

          <p className="text-xs text-dark-muted">
            点击圆圈按鈕激活预设。激活预设后，每次运行流水线自动使用该预设的筛选要求。
          </p>
        </SectionCard>

        {/* ── Interest Tags ── */}
        <SectionCard
          icon={Tag}
          title="兴趣标签"
          subtitle="定义你关注的主题标签，在文章流中一键按标签过滤"
        >
          {/* Existing tags */}
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {interestTags.length === 0 ? (
              <span className="text-xs text-dark-muted italic">暂无兴趣标签</span>
            ) : (
              interestTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-dark-accent/15 text-dark-accent border border-dark-accent/30"
                >
                  #{tag}
                  <button
                    onClick={() => handleDeleteTag(tag)}
                    className="hover:text-red-400 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Add tag */}
          <div className="flex gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              placeholder="例：量子计算、安全、芯片..."
              className="flex-1 bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
            />
            <button
              onClick={handleAddTag}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 transition-colors"
            >
              <Plus size={14} />
              添加
            </button>
          </div>
          <p className="text-xs text-dark-muted">
            标签用于过滤文章 Feed——仅显示 LLM 标注标签或手动添加标签中含有所选标签的文章。
          </p>
        </SectionCard>

        {/* ── Keyword Rules ── */}
        <SectionCard
          icon={Filter}
          title="关键词规则"
          subtitle="定义标题关键词规则，在 Feed 中快速过滤感兴趣的文章（仅展示层面）"
        >
          {/* Rules list */}
          {rules.length === 0 ? (
            <p className="text-xs text-dark-muted italic">暂无关键词规则</p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
                    rule.enabled
                      ? "bg-dark-surface border-dark-border"
                      : "bg-dark-surface/50 border-dark-border/50 opacity-60"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{rule.keyword}</span>
                    <span className="text-xs text-dark-muted ml-2">
                      匹配字段：
                      {rule.field === "title"
                        ? "标题"
                        : rule.field === "tags"
                        ? "标签"
                        : "全部"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    title={rule.enabled ? "禁用规则" : "启用规则"}
                    className="text-dark-muted hover:text-dark-accent transition-colors"
                  >
                    {rule.enabled ? (
                      <ToggleRight size={20} className="text-dark-accent" />
                    ) : (
                      <ToggleLeft size={20} />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 rounded hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add rule */}
          <div className="flex gap-2">
            <input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
              placeholder="关键词，如：GPT-5、RAG、..."
              className="flex-1 bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
            />
            <select
              value={newRuleField}
              onChange={(e) => setNewRuleField(e.target.value)}
              className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
            >
              <option value="title">匹配标题</option>
              <option value="tags">匹配标签</option>
              <option value="any">全部匹配</option>
            </select>
            <button
              onClick={handleAddRule}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 transition-colors"
            >
              <Plus size={14} />
              添加
            </button>
          </div>
          <p className="text-xs text-dark-muted">
            关键词规则用于在资讯流中快速过滤标题。启用后可在 Feed 顶部的关键词搜索框使用，或作为预设规则批量显隐文章。
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
