"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, Zap, XCircle, Clock, Newspaper } from "lucide-react";
import { getStats, triggerPipeline, type Stats } from "@/lib/api";

export default function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

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

  async function handleRunPipeline() {
    setRunning(true);
    setPipelineResult(null);
    try {
      const res = await triggerPipeline();
      setPipelineResult(res.stats);
      await loadStats(); // refresh stats after pipeline
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
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
      <div className="flex items-center justify-between mb-8">
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
          {running ? "运行中..." : "手动触发采集"}
        </button>
      </div>

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

      {/* Pipeline result */}
      {pipelineResult && (
        <div className="bg-dark-card border border-dark-accent/30 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-dark-accent mb-3">最近一次采集结果</h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 text-center">
            {Object.entries(pipelineResult).map(([key, value]) => (
              <div key={key}>
                <p className="text-2xl font-bold font-mono">{value}</p>
                <p className="text-xs text-dark-muted mt-1">{key}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
