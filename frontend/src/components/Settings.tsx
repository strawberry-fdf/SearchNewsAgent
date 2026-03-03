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
  Key,
  Eye,
  EyeOff,
  X,
  Pencil,
  Info,
  RefreshCw,
  MonitorSmartphone,
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
  getLlmConfigs,
  getLlmProviders,
  discoverProviderModels,
  createLlmConfig,
  updateLlmConfig,
  activateLlmConfig,
  deactivateLlmConfigs,
  deleteLlmConfig,
  type AppSettings,
  type FilterPreset,
  type CacheStats,
  type CacheSourceStat,
  type LlmConfig,
  type LlmProvider,
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

// ── 关于与更新组件 ──

/** 声明 window.electronAPI 类型 */
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      version: string;
      checkForUpdates: () => Promise<{ status: string; version?: string; message?: string }>;
      startUpdateInstallation?: () => Promise<{ status: string; message?: string }>;
      openExternal: (url: string) => void;
      getAutoLaunch: () => Promise<{ enabled: boolean }>;
      setAutoLaunch: (enabled: boolean) => Promise<{ enabled: boolean }>;
      onUpdateCheckResult: (cb: (data: { type: string; version?: string; currentVersion?: string; downloadUrl?: string; updateMode?: string; message?: string; manual?: boolean }) => void) => void;
      onUpdateProgress: (cb: (data: { percent: number }) => void) => void;
      onUpdateDownloading: (cb: (data: { version: string }) => void) => void;
    };
  }
}

function AboutAndUpdate() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;
  const appVersion = (typeof window !== "undefined" && window.electronAPI?.version) || "dev";
  const platform = (typeof window !== "undefined" && window.electronAPI?.platform) || "web";

  const platformLabel: Record<string, string> = {
    win32: "Windows",
    darwin: "macOS",
    linux: "Linux",
    web: "Web",
  };

  // 监听主进程返回的检查结果，更新按钮状态
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    if (!api?.isElectron) return;
    api.onUpdateCheckResult((data) => {
      if (data.manual) {
        setChecking(false);
      }
    });
  }, []);

  const handleCheckUpdate = async () => {
    if (!isElectron || !window.electronAPI) {
      setResult("仅桌面端支持自动更新检查");
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res.status === "dev") {
        setResult("开发模式下不支持更新检查");
        setChecking(false);
      }
      // 检查结果由 IPC 事件触发左下角 Toast 展示
    } catch {
      setResult("检查更新失败，请稍后重试");
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">当前版本</span>
            <span className="text-xs bg-dark-surface border border-dark-border rounded px-2 py-0.5 font-mono">
              v{appVersion}
            </span>
          </div>
          <p className="text-xs text-dark-muted">
            平台: {platformLabel[platform] || platform}
          </p>
        </div>

        <button
          onClick={handleCheckUpdate}
          disabled={checking}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 disabled:opacity-50 transition-colors"
        >
          {checking ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          检查更新
        </button>
      </div>

      {result && (
        <p className="text-xs text-dark-muted bg-dark-surface rounded-lg px-3 py-2">
          {result}
        </p>
      )}

      <div className="pt-2 border-t border-dark-border">
        <p className="text-xs text-dark-muted">
          AgentNews 是一款 AI 智能资讯精选系统，帮助你从噪声中发现真正有价值的信息。
        </p>
        <a
          href="https://github.com/strawberry-fdf/SearchNewsAgent"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-dark-accent hover:underline mt-1"
        >
          GitHub 仓库 →
        </a>
      </div>
    </div>
  );
}

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

  // LLM 配置状态（多配置单激活）
  const [llmConfigs, setLlmConfigs] = useState<LlmConfig[]>([]);
  const [llmProviders, setLlmProviders] = useState<LlmProvider[]>([]);
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [showLlmConfigModal, setShowLlmConfigModal] = useState(false);
  const [editingLlmConfig, setEditingLlmConfig] = useState<LlmConfig | null>(null);
  const [llmConfigForm, setLlmConfigForm] = useState({ name: "", provider: "openai", model: "", api_key: "", base_url: "" });
  const [llmConfigSaving, setLlmConfigSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // 折叠/展开非激活配置和规则
  const [showInactiveLlmConfigs, setShowInactiveLlmConfigs] = useState(false);
  const [showInactivePresets, setShowInactivePresets] = useState(false);

  // 开机自启动状态
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  // 加载开机自启动状态
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    if (api?.isElectron && api.getAutoLaunch) {
      api.getAutoLaunch().then((res) => setAutoLaunch(res.enabled)).catch(() => {});
    }
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
    // Load cache stats, LLM configs and providers in parallel (non-blocking)
    loadCacheStats();
    loadLlmConfigs();
    loadLlmProviders();
  }

  async function loadLlmConfigs() {
    try {
      const lc = await getLlmConfigs();
      setLlmConfigs(lc.items);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadLlmProviders() {
    try {
      const res = await getLlmProviders();
      setLlmProviders(res.items);
    } catch (err) {
      console.error(err);
    }
  }

  const handleProviderChange = useCallback((providerKey: string) => {
    const spec = llmProviders.find((p) => p.provider === providerKey);
    setLlmConfigForm((f) => ({
      ...f,
      provider: providerKey,
      base_url: spec?.default_base_url ?? "",
      model: "",
    }));
    // 自动填充静态模型列表
    setProviderModels(spec?.static_models ?? []);
    setDiscoverError(null);
  }, [llmProviders]);

  async function handleDiscoverModels() {
    const provider = llmConfigForm.provider;
    const apiKey = llmConfigForm.api_key.trim();
    if (!provider) return;
    setDiscoveringModels(true);
    setDiscoverError(null);
    try {
      const res = await discoverProviderModels(provider, {
        api_key: apiKey,
        base_url: llmConfigForm.base_url.trim() || undefined,
      });
      if (res.error) {
        setDiscoverError(res.error);
      }
      if (res.models.length > 0) {
        setProviderModels(res.models);
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : "模型发现失败");
    } finally {
      setDiscoveringModels(false);
    }
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

  // ── 开机自启动 ──

  async function handleAutoLaunchToggle(enabled: boolean) {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    if (!api?.isElectron || !api.setAutoLaunch) return;
    setAutoLaunchLoading(true);
    try {
      const res = await api.setAutoLaunch(enabled);
      setAutoLaunch(res.enabled);
    } catch (err) {
      console.error(err);
    } finally {
      setAutoLaunchLoading(false);
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

  async function handleLlmConfigSave() {
    const name = llmConfigForm.name.trim();
    if (!name) return;
    setLlmConfigSaving(true);
    try {
      if (editingLlmConfig) {
        // 编辑现有配置
        await updateLlmConfig(editingLlmConfig.id, {
          name,
          provider: llmConfigForm.provider,
          model: llmConfigForm.model.trim(),
          api_key: llmConfigForm.api_key.trim(),
          base_url: llmConfigForm.base_url.trim(),
        });
        setLlmConfigs((prev) =>
          prev.map((c) =>
            c.id === editingLlmConfig.id
              ? { ...c, name, provider: llmConfigForm.provider, model: llmConfigForm.model.trim(), api_key: llmConfigForm.api_key.trim(), base_url: llmConfigForm.base_url.trim() }
              : c
          )
        );
      } else {
        // 创建新配置
        const res = await createLlmConfig({
          name,
          provider: llmConfigForm.provider,
          model: llmConfigForm.model.trim(),
          api_key: llmConfigForm.api_key.trim(),
          base_url: llmConfigForm.base_url.trim(),
        });
        const newConfig: LlmConfig = {
          id: res.id,
          name,
          provider: llmConfigForm.provider,
          model: llmConfigForm.model.trim(),
          api_key: llmConfigForm.api_key.trim(),
          base_url: llmConfigForm.base_url.trim(),
          is_active: false,
          created_at: new Date().toISOString(),
        };
        setLlmConfigs((prev) => [...prev, newConfig]);
      }
      setShowLlmConfigModal(false);
      setEditingLlmConfig(null);
      setLlmConfigForm({ name: "", provider: "openai", model: "", api_key: "", base_url: "" });
      setShowApiKey(false);
      setProviderModels([]);
      setDiscoverError(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLlmConfigSaving(false);
    }
  }

  function openLlmConfigModal(config?: LlmConfig) {
    if (config) {
      setEditingLlmConfig(config);
      const providerKey = config.provider || "openai";
      setLlmConfigForm({
        name: config.name,
        provider: providerKey,
        model: config.model,
        api_key: config.api_key,
        base_url: config.base_url,
      });
      // 加载该 provider 的静态模型作为初始选项
      const spec = llmProviders.find((p) => p.provider === providerKey);
      setProviderModels(spec?.static_models ?? []);
    } else {
      setEditingLlmConfig(null);
      const defaultProvider = llmProviders.length > 0 ? llmProviders[0] : null;
      setLlmConfigForm({
        name: "",
        provider: defaultProvider?.provider ?? "openai",
        model: "",
        api_key: "",
        base_url: defaultProvider?.default_base_url ?? "",
      });
      setProviderModels(defaultProvider?.static_models ?? []);
    }
    setShowApiKey(false);
    setDiscoverError(null);
    setShowLlmConfigModal(true);
  }

  async function handleActivateLlmConfig(configId: string) {
    try {
      await activateLlmConfig(configId);
      setLlmConfigs((prev) =>
        prev.map((c) => ({ ...c, is_active: c.id === configId }))
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeactivateLlmConfigs() {
    try {
      await deactivateLlmConfigs();
      setLlmConfigs((prev) => prev.map((c) => ({ ...c, is_active: false })));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteLlmConfig(configId: string) {
    try {
      await deleteLlmConfig(configId);
      setLlmConfigs((prev) => prev.filter((c) => c.id !== configId));
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

        {/* ── 开机自启动（仅 Electron 桌面端显示） ── */}
        {typeof window !== "undefined" && window.electronAPI?.isElectron && (
          <SectionCard icon={MonitorSmartphone} title="系统集成" subtitle="桌面端系统级功能设置">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium">开机自启动</div>
                <div className="text-xs text-dark-muted mt-0.5">
                  {autoLaunch
                    ? "系统启动后将自动运行 AgentNews"
                    : "关闭后需要手动启动应用"}
                </div>
              </div>
              <button
                onClick={() => handleAutoLaunchToggle(!autoLaunch)}
                disabled={autoLaunchLoading}
                className={clsx(
                  "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0",
                  autoLaunch ? "bg-dark-accent" : "bg-dark-border",
                  autoLaunchLoading && "opacity-50"
                )}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200",
                    autoLaunch ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </SectionCard>
        )}

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

        {/* ── LLM Config (multi-preset, single active) ── */}
        <SectionCard icon={Key} title="大模型配置" subtitle="管理 LLM API 配置，每次仅激活一个">
          {/* Active config display */}
          {llmConfigs.some((c) => c.is_active) && (
            <>
              {llmConfigs.filter((c) => c.is_active).map((config) => (
                <div key={config.id} className="rounded-xl border border-dark-accent/30 bg-dark-accent/5 overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      onClick={() => handleActivateLlmConfig(config.id)}
                      title="当前已激活"
                      className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-dark-accent flex items-center justify-center"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-dark-accent" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-dark-accent">{config.name}</span>
                      {config.model && <span className="text-xs text-dark-muted ml-2">{config.model}</span>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-dark-accent/20 text-dark-accent">生效中</span>
                    <button onClick={() => openLlmConfigModal(config)} className="p-1 rounded hover:bg-dark-card text-dark-muted hover:text-dark-text transition-colors" title="编辑配置"><Pencil size={14} /></button>
                    <button onClick={() => handleDeactivateLlmConfigs()} className="p-1 rounded hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors" title="取消激活"><X size={14} /></button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Inactive configs (hidden by default) */}
          {llmConfigs.filter((c) => !c.is_active).length > 0 && (
            <>
              <button
                onClick={() => setShowInactiveLlmConfigs((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-dark-muted hover:text-dark-text transition-colors"
              >
                {showInactiveLlmConfigs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showInactiveLlmConfigs ? "收起" : "展开"} 其他配置（{llmConfigs.filter((c) => !c.is_active).length}）
              </button>
              {showInactiveLlmConfigs && (
                <div className="space-y-2">
                  {llmConfigs.filter((c) => !c.is_active).map((config) => (
                    <div key={config.id} className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <button
                          onClick={() => handleActivateLlmConfig(config.id)}
                          title="点击激活此配置"
                          className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-dark-muted hover:border-dark-accent flex items-center justify-center transition-all"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{config.name}</span>
                          {config.model && <span className="text-xs text-dark-muted ml-2">{config.model}</span>}
                        </div>
                        <button onClick={() => openLlmConfigModal(config)} className="p-1 rounded hover:bg-dark-card text-dark-muted hover:text-dark-text transition-colors" title="编辑配置"><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteLlmConfig(config.id)} className="p-1 rounded hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors" title="删除配置"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* New config button */}
          <button
            onClick={() => openLlmConfigModal()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dashed border-dark-border text-sm text-dark-muted hover:text-dark-text hover:border-dark-accent/50 transition-colors w-full justify-center"
          >
            <Plus size={14} />
            新建配置
          </button>
        </SectionCard>

        {/* ── Unified Filter Rules (presets + default prompt merged) ── */}
        <SectionCard icon={Filter} title="筛选规则" subtitle="自定义筛选策略，多条规则可叠加生效">

          {/* Active presets display */}
          {presets.filter((p) => p.is_active).length > 0 && (
            <div className="space-y-2">
              {presets.filter((p) => p.is_active).map((preset) => (
                <div key={preset.id} className="rounded-xl border border-dark-accent/30 bg-dark-accent/5 overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      onClick={() => handleTogglePresetActive(preset.id)}
                      title="取消激活"
                      className="flex-shrink-0 w-5 h-5 rounded border-2 bg-dark-accent border-dark-accent flex items-center justify-center"
                    >
                      <Check size={12} className="text-black" />
                    </button>
                    <span className="flex-1 text-sm font-medium text-dark-accent">{preset.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-dark-accent/20 text-dark-accent">生效中</span>
                    <button onClick={() => setExpandedPresetId(expandedPresetId === preset.id ? null : preset.id)} className="p-1 rounded hover:bg-dark-card text-dark-muted hover:text-dark-text transition-colors" title="编辑内容">
                      {expandedPresetId === preset.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => handleDeletePreset(preset.id)} className="p-1 rounded hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors" title="删除规则"><Trash2 size={14} /></button>
                  </div>
                  {expandedPresetId === preset.id && (
                    <div className="border-t border-dark-border px-3 py-3 space-y-2">
                      <textarea
                        value={presetPromptDrafts[preset.id] ?? preset.prompt}
                        onChange={(e) => setPresetPromptDrafts((prev) => ({ ...prev, [preset.id]: e.target.value }))}
                        rows={4}
                        placeholder="例：只有涉及大模型发布、重大研究突破或行业动态的文章才应进入精选..."
                        className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent resize-y font-mono"
                      />
                      <button
                        onClick={() => handleSavePresetPrompt(preset.id)}
                        disabled={presetSaving === preset.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-accent text-black text-xs font-medium hover:bg-dark-accent/80 disabled:opacity-50 transition-colors"
                      >
                        {presetSaving === preset.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        保存内容
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inactive presets (hidden by default) */}
          {presets.filter((p) => !p.is_active).length > 0 && (
            <>
              <button
                onClick={() => setShowInactivePresets((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-dark-muted hover:text-dark-text transition-colors"
              >
                {showInactivePresets ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showInactivePresets ? "收起" : "展开"} 未激活规则（{presets.filter((p) => !p.is_active).length}）
              </button>
              {showInactivePresets && (
                <div className="space-y-2">
                  {presets.filter((p) => !p.is_active).map((preset) => (
                    <div key={preset.id} className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <button
                          onClick={() => handleTogglePresetActive(preset.id)}
                          title="激活此规则"
                          className="flex-shrink-0 w-5 h-5 rounded border-2 border-dark-muted hover:border-dark-accent flex items-center justify-center transition-all"
                        />
                        <span className="flex-1 text-sm font-medium">{preset.name}</span>
                        <button onClick={() => setExpandedPresetId(expandedPresetId === preset.id ? null : preset.id)} className="p-1 rounded hover:bg-dark-card text-dark-muted hover:text-dark-text transition-colors" title="编辑内容">
                          {expandedPresetId === preset.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <button onClick={() => handleDeletePreset(preset.id)} className="p-1 rounded hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors" title="删除规则"><Trash2 size={14} /></button>
                      </div>
                      {expandedPresetId === preset.id && (
                        <div className="border-t border-dark-border px-3 py-3 space-y-2">
                          <textarea
                            value={presetPromptDrafts[preset.id] ?? preset.prompt}
                            onChange={(e) => setPresetPromptDrafts((prev) => ({ ...prev, [preset.id]: e.target.value }))}
                            rows={4}
                            placeholder="例：只有涉及大模型发布、重大研究突破或行业动态的文章才应进入精选..."
                            className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent resize-y font-mono"
                          />
                          <button
                            onClick={() => handleSavePresetPrompt(preset.id)}
                            disabled={presetSaving === preset.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-accent text-black text-xs font-medium hover:bg-dark-accent/80 disabled:opacity-50 transition-colors"
                          >
                            {presetSaving === preset.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            保存内容
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

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

          {/* Default filter prompt (only shown when no presets are active) */}
          {activePresetCount === 0 && (
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
                  <span className="text-xs px-2 py-0.5 rounded-full bg-dark-accent/20 text-dark-accent">生效中</span>
                </div>
                {showDefaultPrompt ? <ChevronUp size={14} className="text-dark-muted" /> : <ChevronDown size={14} className="text-dark-muted" />}
              </button>
              {showDefaultPrompt && (
                <div className="border-t border-dark-border px-3 py-3 space-y-2">
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
                    {filterPromptSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {filterPromptSaved ? "已保存" : "保存"}
                  </button>
                </div>
              )}
            </div>
          )}

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
                    文章数据大小：<span className="text-dark-accent">{formatBytes(cacheStats.article_total_bytes)}</span>
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

        {/* ── 关于与更新 ── */}
        <SectionCard icon={Info} title="关于与更新" subtitle="查看版本信息和检查更新">
          <AboutAndUpdate />
        </SectionCard>
      </div>

      {/* ── LLM Config Modal (provider-aware) ── */}
      {showLlmConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-dark-card border border-dark-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingLlmConfig ? "编辑大模型配置" : "新建大模型配置"}
              </h3>
              <button
                onClick={() => { setShowLlmConfigModal(false); setEditingLlmConfig(null); setShowApiKey(false); setProviderModels([]); setDiscoverError(null); }}
                className="p-1 rounded-lg hover:bg-dark-surface text-dark-muted hover:text-dark-text transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* 厂商选择 */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">厂商</label>
                <select
                  value={llmConfigForm.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent transition-colors"
                >
                  {llmProviders.map((p) => (
                    <option key={p.provider} value={p.provider}>
                      {p.label}
                    </option>
                  ))}
                  {llmProviders.length === 0 && (
                    <option value="openai">OpenAI</option>
                  )}
                </select>
              </div>

              {/* 配置名称 */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">配置名称</label>
                <input
                  autoFocus
                  type="text"
                  value={llmConfigForm.name}
                  onChange={(e) => setLlmConfigForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={`例: ${llmProviders.find(p => p.provider === llmConfigForm.provider)?.label ?? 'My'} 配置`}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent transition-colors"
                />
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={llmConfigForm.api_key}
                    onChange={(e) => setLlmConfigForm((f) => ({ ...f, api_key: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:border-dark-accent transition-colors placeholder:text-dark-muted/60 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark-text transition-colors"
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* API Base URL */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">API Base URL</label>
                <input
                  type="text"
                  value={llmConfigForm.base_url}
                  onChange={(e) => setLlmConfigForm((f) => ({ ...f, base_url: e.target.value }))}
                  placeholder={llmProviders.find(p => p.provider === llmConfigForm.provider)?.default_base_url ?? "https://api.openai.com/v1"}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent transition-colors placeholder:text-dark-muted/60 font-mono"
                />
                <p className="text-xs text-dark-muted">切换厂商自动填充默认地址，也可手动修改</p>
              </div>

              {/* 模型选择 + 发现 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">模型</label>
                  <button
                    onClick={handleDiscoverModels}
                    disabled={discoveringModels}
                    className="flex items-center gap-1 text-xs text-dark-accent hover:text-dark-accent/80 disabled:opacity-50 transition-colors"
                    title="从 API 拉取可用模型列表"
                  >
                    {discoveringModels ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    {discoveringModels ? "发现中..." : "发现模型"}
                  </button>
                </div>

                {/* 模型下拉 + 手动输入 */}
                <div className="relative">
                  <input
                    type="text"
                    list="provider-models-list"
                    value={llmConfigForm.model}
                    onChange={(e) => setLlmConfigForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="选择或输入模型名称..."
                    className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent transition-colors placeholder:text-dark-muted/60 font-mono"
                  />
                  <datalist id="provider-models-list">
                    {providerModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                {/* 快捷模型标签 */}
                {providerModels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {providerModels.slice(0, 8).map((m) => (
                      <button
                        key={m}
                        onClick={() => setLlmConfigForm((f) => ({ ...f, model: m }))}
                        className={clsx(
                          "px-2 py-0.5 rounded-md text-xs border transition-colors",
                          llmConfigForm.model === m
                            ? "bg-dark-accent/20 border-dark-accent/40 text-dark-accent"
                            : "bg-dark-surface border-dark-border text-dark-muted hover:text-dark-text hover:border-dark-accent/30"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                    {providerModels.length > 8 && (
                      <span className="px-2 py-0.5 text-xs text-dark-muted">+{providerModels.length - 8} 更多</span>
                    )}
                  </div>
                )}

                {/* 发现错误提示 */}
                {discoverError && (
                  <p className="text-xs text-orange-400 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {discoverError}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleLlmConfigSave}
                disabled={llmConfigSaving || !llmConfigForm.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 disabled:opacity-50 transition-colors"
              >
                {llmConfigSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {editingLlmConfig ? "保存修改" : "创建"}
              </button>
              <button
                onClick={() => { setShowLlmConfigModal(false); setEditingLlmConfig(null); setShowApiKey(false); setProviderModels([]); setDiscoverError(null); }}
                className="px-4 py-2 rounded-lg border border-dark-border text-sm text-dark-muted hover:text-dark-text transition-colors"
              >
                取消
              </button>
              {/* 文档链接 */}
              {(() => {
                const spec = llmProviders.find(p => p.provider === llmConfigForm.provider);
                return spec?.docs_url ? (
                  <a
                    href={spec.docs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-xs text-dark-muted hover:text-dark-accent transition-colors"
                  >
                    <Info size={12} />
                    API 文档
                  </a>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
