import { writable, derived, get } from "svelte/store";

export interface UpdateInfo {
  version: string;
  notes: string;
  date: string;
}

export interface UpdateState {
  available: UpdateInfo | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
  showBanner: boolean;
  dismissed: boolean;
  lastChecked: Date | null;
  currentVersion: string | null;
}

const initialState: UpdateState = {
  available: null,
  isChecking: false,
  isDownloading: false,
  downloadProgress: 0,
  error: null,
  showBanner: false,
  dismissed: false,
  lastChecked: null,
  currentVersion: null,
};

function createUpdateStore() {
  const { subscribe, set, update } = writable<UpdateState>(initialState);

  return {
    subscribe,

    setChecking: (checking: boolean) => update(s => ({ ...s, isChecking: checking, error: null })),

    setDownloading: (downloading: boolean) => update(s => ({ ...s, isDownloading: downloading })),

    setProgress: (progress: number) => update(s => ({ ...s, downloadProgress: progress })),

    setError: (error: string | null) => update(s => ({ ...s, error })),

    setAvailable: (info: UpdateInfo | null) => update(s => ({
      ...s,
      available: info,
      showBanner: info !== null,
      dismissed: false,
      lastChecked: new Date(),
    })),

    setCurrentVersion: (version: string) => update(s => ({ ...s, currentVersion: version })),

    dismiss: () => update(s => ({ ...s, dismissed: true, showBanner: false })),

    reset: () => set(initialState),

    async checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string; error?: string }> {
      // Only run in Tauri environment
      if (typeof window === "undefined" || !("__TAURI__" in window)) {
        return { hasUpdate: false, error: "Not in Tauri environment" };
      }

      update(s => ({ ...s, isChecking: true, error: null }));

      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const updateResult = await check();

        if (updateResult) {
          const info: UpdateInfo = {
            version: updateResult.version,
            notes: updateResult.body || "No release notes available",
            date: updateResult.date || new Date().toISOString(),
          };
          update(s => ({
            ...s,
            available: info,
            showBanner: true,
            dismissed: false,
            lastChecked: new Date(),
            isChecking: false,
          }));
          return { hasUpdate: true, version: updateResult.version };
        } else {
          update(s => ({
            ...s,
            available: null,
            lastChecked: new Date(),
            isChecking: false,
          }));
          return { hasUpdate: false };
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to check for updates";
        console.error("Failed to check for updates:", e);
        update(s => ({ ...s, isChecking: false, error: errorMsg }));
        return { hasUpdate: false, error: errorMsg };
      }
    },

    async downloadAndInstall(): Promise<{ success: boolean; error?: string }> {
      if (typeof window === "undefined" || !("__TAURI__" in window)) {
        return { success: false, error: "Not in Tauri environment" };
      }

      update(s => ({ ...s, isDownloading: true, error: null, downloadProgress: 0 }));

      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const { relaunch } = await import("@tauri-apps/plugin-process");

        const updateResult = await check();
        if (!updateResult) {
          update(s => ({ ...s, isDownloading: false, error: "Update no longer available" }));
          return { success: false, error: "Update no longer available" };
        }

        let downloaded = 0;
        let contentLength = 0;

        await updateResult.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started":
              contentLength = event.data.contentLength || 0;
              console.log(`Download started, size: ${contentLength} bytes`);
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                const progress = Math.round((downloaded / contentLength) * 100);
                update(s => ({ ...s, downloadProgress: progress }));
              }
              break;
            case "Finished":
              console.log("Download finished");
              update(s => ({ ...s, downloadProgress: 100 }));
              break;
          }
        });

        // Relaunch the app to apply the update
        await relaunch();
        return { success: true };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to install update";
        console.error("Failed to download/install update:", e);
        update(s => ({ ...s, isDownloading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },

    async getCurrentVersion(): Promise<string | null> {
      if (typeof window === "undefined" || !("__TAURI__" in window)) {
        return null;
      }

      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        update(s => ({ ...s, currentVersion: version }));
        return version;
      } catch (e) {
        console.error("Failed to get app version:", e);
        return null;
      }
    },
  };
}

export const updateStore = createUpdateStore();

// Derived stores for convenience
export const updateAvailable = derived(updateStore, $s => $s.available);
export const isCheckingUpdate = derived(updateStore, $s => $s.isChecking);
export const isDownloadingUpdate = derived(updateStore, $s => $s.isDownloading);
export const updateDownloadProgress = derived(updateStore, $s => $s.downloadProgress);
export const updateError = derived(updateStore, $s => $s.error);
export const showUpdateBanner = derived(updateStore, $s => $s.showBanner && $s.available && !$s.dismissed);
export const currentAppVersion = derived(updateStore, $s => $s.currentVersion);
