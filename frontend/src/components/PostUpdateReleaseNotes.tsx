"use client";

import { X, Sparkles, ArrowRight, Clock3 } from "lucide-react";
import type { ReleaseNotesInfo } from "@/lib/electron";

interface PostUpdateReleaseNotesProps {
  releaseNotes: ReleaseNotesInfo;
  onClose: () => void;
}

const SOURCE_LABELS: Record<ReleaseNotesInfo["source"], string> = {
  release: "GitHub Release",
  "compare-commits": "Commit 对比",
  updater: "更新元数据",
  preview: "本地预览",
};

export default function PostUpdateReleaseNotes({
  releaseNotes,
  onClose,
}: PostUpdateReleaseNotesProps) {
  const versionLine = releaseNotes.previousVersion
    ? `v${releaseNotes.previousVersion} -> v${releaseNotes.version}`
    : `v${releaseNotes.version}`;

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/35 px-4 pt-20 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-dark-border bg-dark-card shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-dark-border bg-[radial-gradient(circle_at_top_left,rgba(115,230,184,0.18),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] px-6 py-5">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
              <Sparkles size={14} />
              更新完成
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-dark-text">本次更新内容</h2>
              <p className="text-sm text-dark-muted">{releaseNotes.title}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-dark-muted">
              <span className="rounded-full border border-dark-border bg-dark-surface px-2.5 py-1">{versionLine}</span>
              <span className="rounded-full border border-dark-border bg-dark-surface px-2.5 py-1">来源: {SOURCE_LABELS[releaseNotes.source]}</span>
              {releaseNotes.publishedAt && (
                <span className="inline-flex items-center gap-1 rounded-full border border-dark-border bg-dark-surface px-2.5 py-1">
                  <Clock3 size={12} />
                  {new Date(releaseNotes.publishedAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-dark-border bg-dark-surface p-2 text-dark-muted transition-colors hover:text-dark-text"
            aria-label="关闭更新说明"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="grid gap-3">
            {releaseNotes.notes.length > 0 ? (
              releaseNotes.notes.map((note, index) => (
                <div
                  key={`${note}-${index}`}
                  className="flex items-start gap-3 rounded-2xl border border-dark-border bg-dark-surface/80 px-4 py-3"
                >
                  <div className="mt-0.5 rounded-full bg-dark-accent/15 p-1 text-dark-accent">
                    <ArrowRight size={12} />
                  </div>
                  <p className="text-sm leading-6 text-dark-text">{note}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dark-border bg-dark-surface/80 px-4 py-3 text-sm text-dark-muted">
                本次更新未提供详细说明，请前往 GitHub Release 页面查看完整信息。
              </div>
            )}
          </div>

          {releaseNotes.downloadUrl && (
            <p className="text-xs text-dark-muted">
              若需查看完整发布记录，可在 GitHub Release 页面继续查看详细内容。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}