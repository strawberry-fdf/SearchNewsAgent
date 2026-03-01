/**
 * 更新提示 Toast 组件 —— 固定在左下角的简洁长条提示，不阻塞用户操作。
 *
 * 监听 Electron 主进程通过 IPC 发送的 update-check-result 事件，
 * 展示更新检查结果。非 Electron 环境下不渲染任何内容。
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, ArrowUpCircle, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

/** 更新检查结果类型 */
interface UpdateResult {
  type: "update-available" | "up-to-date" | "error" | "checking";
  version?: string;
  currentVersion?: string;
  downloadUrl?: string;
  message?: string;
  manual?: boolean;
}

export default function UpdateToast() {
  const [toast, setToast] = useState<UpdateResult | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setToast(null), 300);
  }, []);

  const autoHide = useCallback(
    (result: UpdateResult) => {
      clearTimer();
      // "有更新"常驻，其他 5 秒后自动关闭
      if (result.type !== "update-available") {
        timerRef.current = setTimeout(dismiss, 5000);
      }
    },
    [clearTimer, dismiss]
  );

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    if (!api?.isElectron) return;

    api.onUpdateCheckResult((data) => {
      const result = data as UpdateResult;
      setToast(result);
      setVisible(true);
      autoHide(result);
    });
  }, [autoHide]);

  const handleDownload = () => {
    if (toast?.downloadUrl) {
      window.electronAPI?.openExternal?.(toast.downloadUrl);
    }
  };

  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-[9999] transition-all duration-300 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-3 bg-dark-card border border-dark-border rounded-full shadow-lg pl-4 pr-2 py-2">
        {/* 图标 */}
        {toast.type === "update-available" && (
          <ArrowUpCircle size={16} className="text-emerald-400 shrink-0" />
        )}
        {toast.type === "up-to-date" && (
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        )}
        {toast.type === "error" && (
          <AlertCircle size={16} className="text-red-400 shrink-0" />
        )}
        {toast.type === "checking" && (
          <Loader2 size={16} className="text-dark-accent animate-spin shrink-0" />
        )}

        {/* 文案 */}
        <span className="text-sm text-dark-text whitespace-nowrap">
          {toast.type === "update-available" &&
            `v${toast.version} 新版本可用`}
          {toast.type === "up-to-date" && "已是最新版本"}
          {toast.type === "error" && (toast.message || "检查更新失败")}
          {toast.type === "checking" && "正在检查更新…"}
        </span>

        {/* 更新按钮（仅有新版本时显示） */}
        {toast.type === "update-available" && (
          <button
            onClick={handleDownload}
            className="shrink-0 px-3 py-1 rounded-full bg-dark-accent text-black text-xs font-medium hover:bg-dark-accent/80 transition-colors"
          >
            更新
          </button>
        )}

        {/* 关闭 */}
        <button
          onClick={dismiss}
          className="shrink-0 p-1 rounded-full hover:bg-dark-surface text-dark-muted hover:text-dark-text transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
