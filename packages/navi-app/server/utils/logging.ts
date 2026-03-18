import { accessSync, appendFileSync, constants, existsSync, mkdirSync, renameSync, rmSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

const DEFAULT_LOG_DIR = join(homedir(), ".claude-code-ui", "logs");
const LOG_DIR = process.env.NAVI_LOG_DIR ? expandHome(process.env.NAVI_LOG_DIR) : DEFAULT_LOG_DIR;
const LOG_FILE = process.env.NAVI_LOG_FILE ? expandHome(process.env.NAVI_LOG_FILE) : join(LOG_DIR, "navi-server.log");
const MAX_LOG_BYTES = parseInt(process.env.NAVI_MAX_LOG_BYTES || String(5 * 1024 * 1024), 10);

function rotateLogIfNeeded() {
  try {
    if (!existsSync(LOG_FILE)) return;
    const stats = statSync(LOG_FILE);
    if (stats.size < MAX_LOG_BYTES) return;

    const rotatedPath = `${LOG_FILE}.1`;
    if (existsSync(rotatedPath)) {
      rmSync(rotatedPath, { force: true });
    }
    renameSync(LOG_FILE, rotatedPath);
  } catch {}
}

export function writeDebugLog(message: string) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    rotateLogIfNeeded();
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`);
  } catch {}
}

export function describePath(path: string | null | undefined) {
  const info: {
    path: string | null;
    exists: boolean;
    executable: boolean;
    mode: string | null;
    size: number | null;
    error: string | null;
  } = {
    path: path ?? null,
    exists: false,
    executable: false,
    mode: null,
    size: null,
    error: null,
  };

  if (!path) {
    info.error = "path-not-set";
    return info;
  }

  try {
    const stats = statSync(path);
    info.exists = true;
    info.size = stats.size;
    info.mode = (stats.mode & 0o777).toString(8);
    try {
      accessSync(path, constants.X_OK);
      info.executable = true;
    } catch (error) {
      info.error = `xok:${error instanceof Error ? error.message : String(error)}`;
    }
  } catch (error) {
    info.error = error instanceof Error ? error.message : String(error);
  }

  return info;
}
