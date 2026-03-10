/**
 * 更新提示 Toast 组件 —— 固定在左下角的简洁长条提示，不阻塞用户操作。
 *
 * 监听 Electron 主进程通过 IPC 发送的 update-check-result 事件，
 * 展示更新检查结果。非 Electron 环境下不渲染任何内容。
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, ArrowUpCircle, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  UPDATE_TOAST_PREVIEW_EVENT,
  type UpdateProgressPayload,
  type UpdateResult,
} from "@/lib/electron";

export default function UpdateToast() {
  const [toast, setToast] = useState<UpdateResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState<UpdateProgressPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRef = useRef<UpdateResult | null>(null);

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
      // 需要用户持续感知的状态常驻展示
      if (!["update-available", "downloading", "installing"].includes(result.type)) {
        timerRef.current = setTimeout(dismiss, 5000);
      }
    },
    [clearTimer, dismiss]
  );

  const showToast = useCallback(
    (result: UpdateResult) => {
      setToast(result);
      toastRef.current = result;
      if (!["update-available", "downloading", "installing"].includes(result.type)) {
        setUpdating(false);
      }
      if (result.type === "update-available") {
        setProgress(null);
      }
      setVisible(true);
      autoHide(result);
    },
    [autoHide]
  );

  // 注册 IPC 监听器（仅注册一次，通过 ref 获取最新回调）
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<UpdateResult>).detail;
      if (detail) {
        showToastRef.current(detail);
      }
    };

    window.addEventListener(UPDATE_TOAST_PREVIEW_EVENT, handlePreview);

    if (!api?.isElectron) {
      return () => {
        window.removeEventListener(UPDATE_TOAST_PREVIEW_EVENT, handlePreview);
      };
    }

    // 注册 IPC 监听器并保存清理函数
    const cleanupCheckResult = api.onUpdateCheckResult((data) => {
      showToastRef.current(data);
    });

    const cleanupProgress = api.onUpdateProgress((data) => {
      setUpdating(true);
      setProgress(data);
      showToastRef.current({
        type: "downloading",
        version: data.version,
        updateMode: "in-app",
        releaseNotes: toastRef.current?.releaseNotes ?? null,
      });
    });

    // 前端 mount 后主动查询是否有待处理的更新通知（弥补启动时 IPC 时序差）
    api.getPendingUpdateStatus?.()
      .then((res) => {
        if (res?.result?.type === "update-available") {
          showToastRef.current(res.result);
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener(UPDATE_TOAST_PREVIEW_EVENT, handlePreview);
      // 清理 IPC 监听器，避免内存泄漏
      if (typeof cleanupCheckResult === "function") cleanupCheckResult();
      if (typeof cleanupProgress === "function") cleanupProgress();
    };
  }, []); // 空依赖：仅 mount/unmount 时注册/清理

  const handleDownload = async () => {
    const api = window.electronAPI;
    if (!api || !toast) return;

    const isInAppUpdate =
      toast.updateMode === "in-app" ||
      (api.platform === "win32" || api.platform === "linux");

    if (isInAppUpdate && api.startUpdateInstallation) {
      setUpdating(true);
      const res = await api.startUpdateInstallation();
      if (res?.status === "error") {
        setUpdating(false);
        setProgress(null);
        showToast({ type: "error", message: res.message || "更新启动失败" });
      }
      if (res?.status === "unsupported") {
        setUpdating(false);
        setProgress(null);
        showToast({ type: "error", message: "当前平台不支持应用内静默更新" });
      }
      return;
    }

    showToast({ type: "error", message: "当前环境未启用应用内更新能力" });
  };

  if (!toast) return null;

  const progressPercent = progress ? Math.max(0, Math.min(100, Math.round(progress.percent))) : 0;
  const noteCount = toast.releaseNotes?.notes.length ?? 0;

  function getMessage(result: UpdateResult) {
    if (result.type === "update-available") {
      return `v${result.version} 新版本可用`;
    }
    if (result.type === "up-to-date") {
      return "已是最新版本";
    }
    if (result.type === "checking") {
      return result.message || "正在检查更新…";
    }
    if (result.type === "downloading") {
      return `正在下载更新 ${progressPercent}%`;
    }
    if (result.type === "installing") {
      return result.message || "更新包已就绪，正在关闭并安装…";
    }
    return result.message || "检查更新失败";
  }

  return (
    <div
      className={`fixed bottom-4 left-4 z-[9999] transition-all duration-300 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0 pointer-events-none"
      }`}
    >
      <div className="w-[min(420px,calc(100vw-2rem))] rounded-3xl border border-dark-border bg-dark-card shadow-[0_18px_48px_rgba(0,0,0,0.38)]">
        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          <div className="pt-0.5">
            {toast.type === "update-available" && (
              <ArrowUpCircle size={18} className="text-emerald-400 shrink-0" />
            )}
            {toast.type === "up-to-date" && (
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            )}
            {toast.type === "error" && (
              <AlertCircle size={18} className="text-red-400 shrink-0" />
            )}
            {["checking", "downloading", "installing"].includes(toast.type) && (
              <Loader2 size={18} className="animate-spin shrink-0 text-dark-accent" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-dark-text">{getMessage(toast)}</p>
              {toast.type === "update-available" && noteCount > 0 && (
                <p className="text-xs text-dark-muted">本次版本包含 {noteCount} 条更新说明，安装完成后会自动展示。</p>
              )}
              {toast.type === "downloading" && (
                <p className="text-xs text-dark-muted">下载完成后将自动关闭当前应用并安装更新。</p>
              )}
              {toast.type === "installing" && (
                <p className="text-xs text-dark-muted">安装完成后会自动重新打开客户端。</p>
              )}
            </div>

            {(toast.type === "downloading" || toast.type === "installing") && (
              <div className="space-y-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-dark-surface">
                  <div
                    className="h-full rounded-full bg-dark-accent transition-[width] duration-300"
                    style={{ width: `${toast.type === "installing" ? 100 : progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-dark-muted">
                  {toast.type === "installing"
                    ? "安装准备中…"
                    : `${progressPercent}% · ${Math.round((progress?.transferred ?? 0) / 1024 / 1024)}MB / ${Math.max(1, Math.round((progress?.total ?? 1) / 1024 / 1024))}MB`}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {toast.type === "update-available" && (
              <button
                onClick={handleDownload}
                disabled={updating}
                className="shrink-0 rounded-full bg-dark-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-dark-accent/80 disabled:opacity-60"
              >
                {updating ? "准备中…" : "更新"}
              </button>
            )}

            <button
              onClick={dismiss}
              className="shrink-0 rounded-full p-1 text-dark-muted transition-colors hover:bg-dark-surface hover:text-dark-text"
              aria-label="关闭更新提示"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
