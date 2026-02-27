/**
 * 文章卡片组件 —— 展示单篇文章的标题、摘要、分数徽章、标签、
 * 收藏/删除操作；支持展开/收起详情、用户自定义标签编辑。
 */
"use client";

import { useState } from "react";
import { Star, Plus, X, Trash2, Check, Tag } from "lucide-react";
import clsx from "clsx";
import ScoreBadge from "./ScoreBadge";
import type { Article } from "@/lib/api";

interface ArticleCardProps {
  article: Article;
  onToggleStar: (urlHash: string) => void;
  onUpdateUserTags: (urlHash: string, tags: string[]) => void;
  onDelete?: (urlHash: string) => void;
  compact?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (urlHash: string) => void;
  /** 按信源分组时隐藏信源名称，避免冗余 */
  hideSource?: boolean;
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

// ── User tag editor (inline) ──

function UserTagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  function addTag() {
    const t = input.trim();
    if (t && !tags.includes(t)) {
      onChange([...tags, t]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Tag size={11} className="text-dark-muted" />
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-dark-accent/10 text-dark-accent border border-dark-accent/30"
        >
          {tag}
          <button
            onClick={(e) => {
              e.preventDefault();
              removeTag(tag);
            }}
            className="hover:text-red-400"
          >
            <X size={9} />
          </button>
        </span>
      ))}
      {open ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="输入标签..."
            className="text-xs bg-dark-surface border border-dark-border rounded px-1.5 py-0.5 w-20 focus:outline-none focus:border-dark-accent"
          />
          <button
            onClick={() => {
              addTag();
              setOpen(false);
            }}
            className="text-xs text-dark-muted hover:text-dark-text"
          >
            <X size={11} />
          </button>
        </span>
      ) : (
        <button
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          className="text-xs text-dark-muted hover:text-dark-accent transition-colors flex items-center gap-0.5"
          title="添加标签"
        >
          <Plus size={11} />
        </button>
      )}
    </div>
  );
}

// ── ArticleCard ──

export default function ArticleCard({
  article,
  onToggleStar,
  onUpdateUserTags,
  onDelete,
  compact = false,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  hideSource = false,
}: ArticleCardProps) {
  const analysis = article.analysis;
  const displayTitle =
    analysis?.title || article.raw_title || article.url;
  const userTags = article.user_tags || [];

  // Compact / title-only mode
  if (compact) {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all group",
          selected
            ? "bg-dark-accent/10 border-dark-accent/50"
            : "hover:bg-dark-card border-transparent hover:border-dark-border"
        )}
      >
        {/* Checkbox or star */}
        {selectionMode ? (
          <button
            onClick={() => onToggleSelect?.(article.url_hash)}
            className="flex-shrink-0"
          >
            <div className={clsx(
              "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
              selected ? "bg-dark-accent border-dark-accent" : "border-dark-border"
            )}>
              {selected && <Check size={10} className="text-black" />}
            </div>
          </button>
        ) : (
          <button
            onClick={(e) => { e.preventDefault(); onToggleStar(article.url_hash); }}
            className="flex-shrink-0"
          >
            <Star
              size={13}
              className={clsx(
                "transition-colors",
                article.starred
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-dark-muted group-hover:text-yellow-400/50"
              )}
            />
          </button>
        )}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-sm leading-snug hover:text-dark-accent transition-colors line-clamp-1"
        >
          {displayTitle}
        </a>
        <span className="text-xs text-dark-muted flex-shrink-0 hidden md:block">
          {!hideSource && article.source_name}
        </span>
        <span className="text-xs text-dark-muted flex-shrink-0">
          {formatTime(article.published_at || article.fetched_at)}
        </span>
        {!selectionMode && onDelete && (
          <button
            onClick={(e) => { e.preventDefault(); onDelete(article.url_hash); }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-dark-muted hover:text-red-400 transition-all"
            title="删除"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    );
  }

  // Full card mode
  const categoryClass = analysis
    ? CATEGORY_COLORS[analysis.category] || CATEGORY_COLORS["默认"]
    : "bg-gray-500/20 text-gray-400";

  return (
    <div
      className={clsx(
        "group relative bg-dark-card border rounded-xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-dark-accent/5",
        selected
          ? "border-dark-accent/60 bg-dark-accent/5"
          : "border-dark-border hover:border-dark-accent/30"
      )}
    >
      {/* Top row: source + time + star + delete */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Checkbox in selection mode */}
          {selectionMode && (
            <button onClick={() => onToggleSelect?.(article.url_hash)}>
              <div className={clsx(
                "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                selected ? "bg-dark-accent border-dark-accent" : "border-dark-border"
              )}>
                {selected && <Check size={10} className="text-black" />}
              </div>
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-dark-muted">
            {!hideSource && (
              <>
                <span className="font-medium">{article.source_name || "Unknown"}</span>
                <span>·</span>
              </>
            )}
            <span>{formatTime(article.published_at || article.fetched_at)}</span>
            {!analysis && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-xs">
                原始
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!selectionMode && onDelete && (
            <button
              onClick={(e) => { e.preventDefault(); onDelete(article.url_hash); }}
              className="p-1 rounded hover:bg-dark-surface transition-colors opacity-0 group-hover:opacity-100 text-dark-muted hover:text-red-400"
              title="删除"
            >
              <Trash2 size={15} />
            </button>
          )}
          {!selectionMode && (
            <button
              onClick={(e) => { e.preventDefault(); onToggleStar(article.url_hash); }}
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
          )}
        </div>
      </div>

      {/* Title */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mb-2"
      >
        <h3 className="text-base font-semibold leading-snug hover:text-dark-accent transition-colors line-clamp-2">
          {displayTitle}
        </h3>
      </a>

      {/* Summary (only when LLM analysis exists) */}
      {analysis && (
        <p className="text-sm text-dark-muted leading-relaxed mb-4 line-clamp-2">
          {analysis.summary}
        </p>
      )}

      {/* Bottom row: category + tags + scores */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {analysis && (
            <>
              <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", categoryClass)}>
                {analysis.category}
              </span>
              {(analysis.tags ?? []).slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-dark-surface text-dark-muted border border-dark-border"
                >
                  {tag}
                </span>
              ))}
            </>
          )}
        </div>
        {analysis && (
          <div className="flex items-center gap-2">
            <ScoreBadge score={analysis.importance} label="IMP" size="sm" />
            <ScoreBadge score={analysis.ai_relevance} label="AI" size="sm" />
          </div>
        )}
      </div>

      {/* User tags */}
      <UserTagEditor
        tags={userTags}
        onChange={(tags) => onUpdateUserTags(article.url_hash, tags)}
      />

      {/* Selection indicator */}
      {article.status === "selected" && analysis && (
        <div className="absolute top-0 right-0 w-0 h-0 border-t-[24px] border-t-dark-accent border-l-[24px] border-l-transparent rounded-tr-xl" />
      )}
    </div>
  );
}
