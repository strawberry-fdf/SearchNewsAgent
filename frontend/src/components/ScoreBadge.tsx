"use client";

import clsx from "clsx";

interface ScoreBadgeProps {
  score: number;
  label?: string;
  size?: "sm" | "md";
}

/**
 * Renders a color-coded score badge.
 * - >= 88: bright emerald green with glow
 * - >= 80: standard green
 * - >= 70: dim olive
 * - < 70: grey
 */
export default function ScoreBadge({ score, label, size = "md" }: ScoreBadgeProps) {
  const colorClass =
    score >= 88
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 score-glow-high"
      : score >= 80
        ? "bg-emerald-600/15 text-emerald-500 border-emerald-600/30 score-glow-mid"
        : score >= 70
          ? "bg-yellow-600/15 text-yellow-500 border-yellow-600/30"
          : "bg-gray-600/15 text-gray-400 border-gray-600/30";

  return (
    <span
      className={clsx(
        "inline-flex items-center border rounded-md font-mono font-semibold",
        colorClass,
        size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"
      )}
    >
      {label && <span className="mr-1 opacity-70 font-normal">{label}</span>}
      {score}
    </span>
  );
}
