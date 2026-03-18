import { compactStoredMessages, globalSettings, sessions } from "../db";
import { pruneClaudeSessionArtifacts } from "./claude-session-storage";

const STORAGE_MAINTENANCE_LAST_RUN_KEY = "storage_maintenance_last_run_at";
const STORAGE_MAINTENANCE_INTERVAL_MS = 12 * 60 * 60 * 1000;

let maintenancePromise: Promise<StorageMaintenanceResult> | null = null;

export interface StorageMaintenanceResult {
  skipped: boolean;
  db: {
    scanned: number;
    compacted: number;
    bytesSaved: number;
    vacuumed: boolean;
  };
  claudeArtifacts: {
    sessionsScanned: number;
    sessionsPruned: number;
    charsSaved: number;
  };
}

export async function pruneArchivedSessionArtifacts(sessionIds: string[]): Promise<StorageMaintenanceResult["claudeArtifacts"]> {
  const candidates = sessions.listStoragePruneCandidates(sessionIds);

  let sessionsScanned = 0;
  let sessionsPruned = 0;
  let charsSaved = 0;

  for (const candidate of candidates) {
    if (!candidate.claude_session_id) continue;
    sessionsScanned += 1;

    try {
      const result = await pruneClaudeSessionArtifacts({
        claudeSessionId: candidate.claude_session_id,
        candidateProjectPaths: [candidate.worktree_path, candidate.project_path],
        preserveRecentCount: 3,
        maxPrunedLength: 200,
      });

      if (result.prunedCount > 0) {
        sessionsPruned += 1;
        charsSaved += result.charsSaved;
      }
    } catch (error) {
      console.warn(
        `[StorageMaintenance] Failed to prune Claude artifacts for session ${candidate.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return {
    sessionsScanned,
    sessionsPruned,
    charsSaved,
  };
}

export async function runStorageMaintenance(options: { force?: boolean } = {}): Promise<StorageMaintenanceResult> {
  if (maintenancePromise) {
    return maintenancePromise;
  }

  maintenancePromise = (async () => {
    const lastRunAt = Number(globalSettings.get(STORAGE_MAINTENANCE_LAST_RUN_KEY) || "0");
    const shouldSkip =
      !options.force &&
      Number.isFinite(lastRunAt) &&
      lastRunAt > 0 &&
      Date.now() - lastRunAt < STORAGE_MAINTENANCE_INTERVAL_MS;

    if (shouldSkip) {
      return {
        skipped: true,
        db: { scanned: 0, compacted: 0, bytesSaved: 0, vacuumed: false },
        claudeArtifacts: { sessionsScanned: 0, sessionsPruned: 0, charsSaved: 0 },
      };
    }

    const dbResult = compactStoredMessages();
    const archivedCandidates = sessions.listStoragePruneCandidates();

    let sessionsScanned = 0;
    let sessionsPruned = 0;
    let charsSaved = 0;

    for (const candidate of archivedCandidates) {
      if (!candidate.claude_session_id) continue;
      sessionsScanned += 1;

      try {
        const result = await pruneClaudeSessionArtifacts({
          claudeSessionId: candidate.claude_session_id,
          candidateProjectPaths: [candidate.worktree_path, candidate.project_path],
          preserveRecentCount: 3,
          maxPrunedLength: 200,
        });

        if (result.prunedCount > 0) {
          sessionsPruned += 1;
          charsSaved += result.charsSaved;
        }
      } catch (error) {
        console.warn(
          `[StorageMaintenance] Failed to prune archived Claude artifacts for session ${candidate.id}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    globalSettings.set(STORAGE_MAINTENANCE_LAST_RUN_KEY, String(Date.now()));

    return {
      skipped: false,
      db: dbResult,
      claudeArtifacts: {
        sessionsScanned,
        sessionsPruned,
        charsSaved,
      },
    };
  })();

  try {
    return await maintenancePromise;
  } finally {
    maintenancePromise = null;
  }
}

export function scheduleStorageMaintenance(options: { force?: boolean } = {}) {
  void runStorageMaintenance(options).catch((error) => {
    console.warn(
      "[StorageMaintenance] Background maintenance failed:",
      error instanceof Error ? error.message : String(error)
    );
  });
}
