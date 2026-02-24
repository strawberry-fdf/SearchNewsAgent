"use client";

import { Star } from "lucide-react";
import clsx from "clsx";
import ScoreBadge from "./ScoreBadge";
import type { Article } from "@/lib/api";

interface ArticleCardProps {
  article: Article;
  onToggleStar: (urlHash: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  "模型发布": "bg-purple-500/20 text-purple-400",
  "论文/研究": "bg-blue-500/20 text-blue-400",
  "评测/基准": "bg-orange-500/20 text-orange-400",
  "行业动态/政策监管/其他": "bg-amber-500/20 text-amber-400",
  "DevTool/工程向": "bg-cyan-500/20 text-cyan-400",
  "默认": "bg-gray-500/20 text-gray-400",
  "非AI/通用工具": "bg-gray-500/20 text-gray-500",
};

function formatTime(isoString: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return "刚刚";
    if (diffH < 24) return `${diffH} 小时前`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} 天前`;
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function ArticleCard({ article, onToggleStar }: ArticleCardProps) {
  const analysis = article.analysis;
  if (!analysis) return null;

  const categoryClass = CATEGORY_COLORS[analysis.category] || CATEGORY_COLORS["默认"];

  return (
    <div className="group relative bg-dark-card border border-dark-border rounded-xl p-5 hover:border-dark-accent/30 transition-all duration-200 hover:shadow-lg hover:shadow-dark-accent/5">
      {/* Top row: source + time + star */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-dark-muted">
          <span className="font-medium">{article.source_name || "Unknown"}</span>
          <span>·</span>
          <span>{formatTime(article.published_at || article.fetched_at)}</span>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            onToggleStar(article.url_hash);
          }}
          className="p-1 rounded hover:bg-dark-surface transition-colors"
        >
          <Star
            size={16}
            className={clsx(
              "transition-colors",
              article.starred
                ? "fill-yellow-400 text-yellow-400"
                : "text-dark-muted hover:text-yellow-400"
            )}
          />
        </button>
      </div>

      {/* Title */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mb-2"
      >
        <h3 className="text-base font-semibold leading-snug hover:text-dark-accent transition-colors line-clamp-2">
          {analysis.title}
        </h3>
      </a>

      {/* Summary */}
      <p className="text-sm text-dark-muted leading-relaxed mb-4 line-clamp-2">
        {analysis.summary}
      </p>

      {/* Bottom row: category + tags + scores */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category badge */}
          <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", categoryClass)}>
            {analysis.category}
          </span>
          {/* Tags */}
          {analysis.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-dark-surface text-dark-muted border border-dark-border"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge score={analysis.importance} label="IMP" size="sm" />
          <ScoreBadge score={analysis.ai_relevance} label="AI" size="sm" />
        </div>
      </div>

      {/* Selection indicator */}
      {article.status === "selected" && (
        <div className="absolute top-0 right-0 w-0 h-0 border-t-[24px] border-t-dark-accent border-l-[24px] border-l-transparent rounded-tr-xl" />
      )}
    </div>
  );
}
