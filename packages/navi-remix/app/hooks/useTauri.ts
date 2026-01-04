import { useState, useEffect, useCallback } from "react";

// Check if running in Tauri environment
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

// Hook for Tauri detection
export function useTauri() {
  const [inTauri, setInTauri] = useState(false);

  useEffect(() => {
    setInTauri(isTauri());
  }, []);

  return inTauri;
}

// Hook for directory picker
export function useDirectoryPicker() {
  const inTauri = useTauri();

  const pickDirectory = useCallback(async (): Promise<string | null> => {
    if (inTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
        });
        if (selected && typeof selected === "string") {
          return selected;
        }
      } catch (e) {
        console.error("Failed to pick directory:", e);
      }
    } else {
      // Fallback for web mode
      const path = prompt("Enter directory path:", "/Users/");
      return path || null;
    }
    return null;
  }, [inTauri]);

  return { pickDirectory, inTauri };
}
