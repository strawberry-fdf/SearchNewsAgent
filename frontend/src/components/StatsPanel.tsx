"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3, Loader2, Zap, XCircle, Clock, Newspaper, Terminal,
  History, ChevronDown, ChevronRight, Trash2,
} from "lucide-react";
import {
  getStats, triggerPipeline, getPipelineStatus, getPipelineRuns, deletePipelineRun,
  type Stats, type PipelineStatus, type PipelineRun,
} from "@/lib/api";
import clsx from "clsx";

// ── HistoryPanel ──
function HistoryPanel() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  async function loadRuns() {
    setLoadingRuns(true);
    try {
      const res = await getPipelineRuns();
      setRuns(res.items);
    } catch {}
    finally { setLoadingRuns(false); }
  }

  async function handleDelete(runId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("确定要删除此采集记录？")) return;
    try {
      await deletePipelineRun(runId);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch {}
  }

  function formatTs(ts: string | null) {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return ts; }
  }

  if (loadingRuns) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-dark-muted" size={24} /></div>;
  }

  if (runs.length === 0) {
    return <div className="text-center py-12 text-dark-muted text-sm">暂无采集记录</div>;
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const expanded = expandedId === run.id;
        const statusColor = run.status === "done" ? "text-emerald-400" : run.status === "error" ? "text-red-400" : "text-yellow-400";
        const statusLabel = run.status === "done" ? "完成" : run.status === "error" ? "出错" : "运行中";
        return (
          <div key={run.id} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-dark-surface/30 transition-colors select-none"
              onClick={() => setExpandedId(expanded ? null : run.id)}
            >
              {expanded ? <ChevronDown size={14} className="text-dark-muted flex-shrink-0" /> : <ChevronRight size={14} className="text-dark-muted flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={clsx("text-xs font-medium", statusColor)}>{statusLabel}</span>
                  <span className="text-xs text-dark-muted">{formatTs(run.started_at)}</span>
                  {run.finished_at && (
                    <span className="text-xs text-dark-muted">→ {formatTs(run.finished_at)}</span>
                  )}
                </div>
                {run.stats && Object.keys(run.stats).length > 0 && (
                  <div className="flex gap-3 mt-1">
                    {Object.entries(run.stats).map(([k, v]) => (
                      <span key={k} className="text-xs text-dark-muted">
                        <span className="text-dark-text font-mono">{v}</span> {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => handleDelete(run.id, e)}
                className="p-1.5 rounded hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors flex-shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {expanded && run.logs.length > 0 && (
              <div className="border-t border-dark-border bg-dark-surface px-4 py-3 max-h-60 overflow-y-auto font-mono text-xs leading-5 space-y-0.5">
                {run.logs.map((line, i) => {
                  const color = line.includes("✅") || line.includes("🎉")
                    ? "text-emerald-400"
                    : line.includes("❌") || line.startsWith("__ERROR__")
                    ? "text-red-400"
                    : line.includes("⚠️") ? "text-yellow-400"
                    : line.includes("🚫") ? "text-orange-400"
                    : "text-dark-muted";
                  return <p key={i} className={color}>{line}</p>;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StatsPanel() {
  const [activeTab, setActiveTab] = useState<"stats" | "history">("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadStats();
    // Check if pipeline is already running on mount
    getPipelineStatus()
      .then((s) => {
        if (s.running) {
          setRunning(true);
          setLogs(s.logs);
          startPolling();
        }
      })
      .catch(() => {});
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function loadStats() {
    setLoading(true);
    try {
      const s = await getStats();
      setStats(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const s = await getPipelineStatus();
        setLogs(s.logs);
        if (!s.running) {
          setPipelineStatus(s);
          setRunning(false);
          stopPolling();
          await loadStats();
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 1000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleRunPipeline() {
    setRunning(true);
    setLogs([]);
    setPipelineStatus(null);
    try {
      const res = await triggerPipeline();
      if (res.status === "already_running") {
        const s = await getPipelineStatus();
        setLogs(s.logs);
      }
      startPolling();
    } catch (err) {
      console.error(err);
      setRunning(false);
      setLogs(["❌ 启动失败，请检查后端连接"]);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-dark-muted" size={32} />
      </div>
    );
  }

  const cards = [
    { label: "总文章数", value: stats?.total ?? 0, icon: Newspaper, color: "text-dark-text" },
    { label: "精选", value: stats?.selected ?? 0, icon: Zap, color: "text-emerald-400" },
    { label: "已过滤", value: stats?.rejected ?? 0, icon: XCircle, color: "text-red-400" },
    { label: "待处理", value: stats?.pending ?? 0, icon: Clock, color: "text-yellow-400" },
  ];

  return (
    <div className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-dark-accent" />
          <h1 className="text-2xl font-bold">数据面板</h1>
        </div>
        <button
          onClick={handleRunPipeline}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 transition-colors disabled:opacity-50"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {running ? "采集中..." : "手动触发采集"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-dark-border">
        {(["stats", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "flex items-center gap-1.5 px-4 py-2 text-sm transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-dark-accent text-dark-accent font-medium"
                : "border-transparent text-dark-muted hover:text-dark-text"
            )}
          >
            {tab === "stats" ? <BarChart3 size={14} /> : <History size={14} />}
            {tab === "stats" ? "统计" : "采集历史"}
          </button>
        ))}
      </div>

      {activeTab === "stats" && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="bg-dark-card border border-dark-border rounded-xl p-5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={16} className={card.color} />
                    <span className="text-xs text-dark-muted">{card.label}</span>
                  </div>
                  <p className={`text-3xl font-bold font-mono ${card.color}`}>
                    {card.value}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Real-time log panel */}
          {(running || logs.length > 0) && (
            <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden mb-6">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border bg-dark-surface">
                <Terminal size={14} className="text-dark-accent" />
                <span className="text-sm font-medium text-dark-text">采集日志</span>
                {running && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-yellow-400">
                    <Loader2 size={12} className="animate-spin" />
                    运行中
                  </span>
                )}
                {!running && logs.length > 0 && (
                  <span className="ml-auto text-xs text-emerald-400">完成</span>
                )}
              </div>
              <div className="h-72 overflow-y-auto p-4 font-mono text-xs leading-6 space-y-0.5">
                {logs.map((line, i) => {
                  const color =
                    line.includes("✅") || line.includes("🎉")
                      ? "text-emerald-400"
                      : line.includes("❌") || line.startsWith("__ERROR__")
                      ? "text-red-400"
                      : line.includes("⚠️")
                      ? "text-yellow-400"
                      : line.includes("🚫")
                      ? "text-orange-400"
                      : "text-dark-muted";
                  if (line === "__DONE__") return null;
                  return <p key={i} className={color}>{line}</p>;
                })}
                {running && logs.length === 0 && (
                  <p className="text-dark-muted animate-pulse">等待输出...</p>
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {/* Final stats summary */}
          {pipelineStatus?.stats && !running && (
            <div className="bg-dark-card border border-dark-accent/30 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-dark-accent mb-3">本次采集结果</h3>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
                {Object.entries(pipelineStatus.stats).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-2xl font-bold font-mono">{value}</p>
                    <p className="text-xs text-dark-muted mt-1">{key}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "history" && <HistoryPanel />}
    </div>
  );
}
