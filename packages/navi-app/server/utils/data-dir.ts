import { homedir } from "os";
import { join } from "path";

/**
 * Root data directory for all persisted state (DB, logs, skill library, …).
 *
 * NAVI_DATA_DIR overrides the default ~/.claude-code-ui so a second instance
 * (sandbox, tests, CI) can run fully isolated from the live app's data.
 */
export function getDataDir(): string {
  return process.env.NAVI_DATA_DIR || join(homedir(), ".claude-code-ui");
}
