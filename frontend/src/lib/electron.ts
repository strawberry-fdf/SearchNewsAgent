export interface ReleaseNotesInfo {
  title: string;
  version: string;
  previousVersion?: string;
  currentVersion?: string;
  publishedAt?: string | null;
  downloadUrl?: string | null;
  notes: string[];
  body?: string;
  source: "release" | "compare-commits" | "updater" | "preview";
}

export interface UpdateProgressPayload {
  version?: string;
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond?: number;
}

export interface UpdateResult {
  type: "update-available" | "up-to-date" | "error" | "checking" | "downloading" | "installing";
  version?: string;
  currentVersion?: string;
  downloadUrl?: string;
  updateMode?: "in-app" | "external";
  message?: string;
  manual?: boolean;
  releaseNotes?: ReleaseNotesInfo | null;
}

export const UPDATE_TOAST_PREVIEW_EVENT = "agentnews:update-toast-preview";
export const POST_UPDATE_RELEASE_NOTES_PREVIEW_EVENT = "agentnews:post-update-release-notes-preview";

export function createPreviewReleaseNotes(): ReleaseNotesInfo {
  return {
    title: "AgentNews v9.9.9-preview",
    version: "9.9.9-preview",
    previousVersion: "9.9.8",
    currentVersion: "9.9.9-preview",
    publishedAt: "2026-03-10T10:00:00.000Z",
    notes: [
      "发版命令支持录入更新要点，并自动同步到 GitHub Release。",
      "桌面端更新提示新增下载进度反馈，安装完成后会自动重新打开应用。",
      "应用启动后会以内嵌说明面板展示本次版本的更新内容。",
    ],
    body: "",
    source: "preview",
  };
}

export function createPreviewUpdateResult(): UpdateResult {
  const releaseNotes = createPreviewReleaseNotes();
  return {
    type: "update-available",
    version: releaseNotes.version,
    currentVersion: releaseNotes.previousVersion,
    updateMode: "in-app",
    manual: true,
    releaseNotes,
  };
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      version: string;
      checkForUpdates: () => Promise<{ status: string; version?: string; message?: string }>;
      startUpdateInstallation?: () => Promise<{ status: string; message?: string }>;
      openExternal: (url: string) => Promise<void> | void;
      getAutoLaunch: () => Promise<{ enabled: boolean }>;
      setAutoLaunch: (enabled: boolean) => Promise<{ enabled: boolean }>;
      getPostUpdateReleaseNotes?: () => Promise<{ releaseNotes: ReleaseNotesInfo | null }>;
      dismissPostUpdateReleaseNotes?: () => Promise<{ status: string }>;
      onUpdateCheckResult: (cb: (data: UpdateResult) => void) => void;
      onUpdateProgress: (cb: (data: UpdateProgressPayload) => void) => void;
      onUpdateDownloading: (cb: (data: { version: string }) => void) => void;
    };
  }
}

export {};