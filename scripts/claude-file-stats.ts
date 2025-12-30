#!/usr/bin/env bun

/**
 * Claude Session File Access Statistics
 *
 * Parses Claude Code session transcripts to extract file access patterns.
 *
 * Usage:
 *   bun scripts/claude-file-stats.ts [project-path] [--days=N] [--json]
 *
 * Examples:
 *   bun scripts/claude-file-stats.ts                           # Current project, last 7 days
 *   bun scripts/claude-file-stats.ts --days=30                 # Last 30 days
 *   bun scripts/claude-file-stats.ts /path/to/project --json   # JSON output
 */

import { readdir, readFile, stat } from "fs/promises";
import { join, relative, basename } from "path";
import { homedir } from "os";

interface FileAccess {
  file: string;
  operation: "read" | "write" | "edit" | "grep" | "glob";
  timestamp: string;
  sessionId: string;
  lineRange?: { offset?: number; limit?: number };
}

interface FileStats {
  file: string;
  reads: number;
  writes: number;
  edits: number;
  greps: number;
  globs: number;
  total: number;
  sessions: Set<string>;
  lastAccess: string;
}

interface SessionStats {
  sessionId: string;
  timestamp: string;
  filesAccessed: number;
  reads: number;
  writes: number;
  edits: number;
}

async function getProjectDir(projectPath: string): Promise<string> {
  // Convert project path to Claude's format: /foo/bar -> -foo-bar
  const normalized = projectPath.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", normalized);
}

async function parseSessionFile(
  filePath: string
): Promise<{ accesses: FileAccess[]; sessionId: string; timestamp: string }> {
  const accesses: FileAccess[] = [];
  const sessionId = basename(filePath, ".jsonl");
  let timestamp = "";

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        // Capture session timestamp
        if (data.timestamp && !timestamp) {
          timestamp = data.timestamp;
        }

        const message = data.message;
        if (!message?.content) continue;

        for (const block of message.content) {
          if (block.type !== "tool_use") continue;

          const { name, input } = block;
          const ts = data.timestamp || "";

          switch (name) {
            case "Read":
              if (input?.file_path) {
                accesses.push({
                  file: input.file_path,
                  operation: "read",
                  timestamp: ts,
                  sessionId,
                  lineRange: {
                    offset: input.offset,
                    limit: input.limit,
                  },
                });
              }
              break;

            case "Write":
              if (input?.file_path) {
                accesses.push({
                  file: input.file_path,
                  operation: "write",
                  timestamp: ts,
                  sessionId,
                });
              }
              break;

            case "Edit":
              if (input?.file_path) {
                accesses.push({
                  file: input.file_path,
                  operation: "edit",
                  timestamp: ts,
                  sessionId,
                });
              }
              break;

            case "Grep":
              if (input?.path || input?.pattern) {
                accesses.push({
                  file: input.path || ".",
                  operation: "grep",
                  timestamp: ts,
                  sessionId,
                });
              }
              break;

            case "Glob":
              if (input?.pattern) {
                accesses.push({
                  file: input.pattern,
                  operation: "glob",
                  timestamp: ts,
                  sessionId,
                });
              }
              break;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Skip unreadable files
  }

  return { accesses, sessionId, timestamp };
}

async function collectStats(
  projectPath: string,
  daysBack: number
): Promise<{
  fileStats: Map<string, FileStats>;
  sessionStats: SessionStats[];
  totalAccesses: FileAccess[];
}> {
  const claudeProjectDir = await getProjectDir(projectPath);
  const fileStats = new Map<string, FileStats>();
  const sessionStats: SessionStats[] = [];
  const totalAccesses: FileAccess[] = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  try {
    const files = await readdir(claudeProjectDir);
    const jsonlFiles = files.filter(
      (f) => f.endsWith(".jsonl") && !f.startsWith("agent-")
    );

    for (const file of jsonlFiles) {
      const filePath = join(claudeProjectDir, file);

      // Check file modification time
      try {
        const fileStat = await stat(filePath);
        if (fileStat.mtime < cutoffDate) continue;
      } catch {
        continue;
      }

      const { accesses, sessionId, timestamp } =
        await parseSessionFile(filePath);

      if (accesses.length === 0) continue;

      totalAccesses.push(...accesses);

      // Session-level stats
      const sessionStat: SessionStats = {
        sessionId,
        timestamp,
        filesAccessed: new Set(accesses.map((a) => a.file)).size,
        reads: accesses.filter((a) => a.operation === "read").length,
        writes: accesses.filter((a) => a.operation === "write").length,
        edits: accesses.filter((a) => a.operation === "edit").length,
      };
      sessionStats.push(sessionStat);

      // File-level stats
      for (const access of accesses) {
        const existing = fileStats.get(access.file) || {
          file: access.file,
          reads: 0,
          writes: 0,
          edits: 0,
          greps: 0,
          globs: 0,
          total: 0,
          sessions: new Set<string>(),
          lastAccess: "",
        };

        existing[`${access.operation}s` as keyof FileStats]++;
        existing.total++;
        existing.sessions.add(access.sessionId);
        if (access.timestamp > existing.lastAccess) {
          existing.lastAccess = access.timestamp;
        }

        fileStats.set(access.file, existing);
      }
    }
  } catch (err) {
    console.error(`Error reading project directory: ${claudeProjectDir}`);
    console.error(err);
  }

  return { fileStats, sessionStats, totalAccesses };
}

function formatRelativePath(file: string, projectPath: string): string {
  if (file.startsWith(projectPath)) {
    return relative(projectPath, file);
  }
  return file;
}

function printReport(
  projectPath: string,
  fileStats: Map<string, FileStats>,
  sessionStats: SessionStats[],
  daysBack: number,
  jsonOutput: boolean
) {
  if (jsonOutput) {
    const output = {
      project: projectPath,
      daysBack,
      generatedAt: new Date().toISOString(),
      summary: {
        totalSessions: sessionStats.length,
        totalFilesAccessed: fileStats.size,
        totalOperations: Array.from(fileStats.values()).reduce(
          (sum, f) => sum + f.total,
          0
        ),
      },
      topFiles: Array.from(fileStats.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 20)
        .map((f) => ({
          file: formatRelativePath(f.file, projectPath),
          reads: f.reads,
          writes: f.writes,
          edits: f.edits,
          total: f.total,
          sessionsCount: f.sessions.size,
        })),
      recentSessions: sessionStats
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 10),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Pretty print report
  console.log("\n📊 Claude File Access Stats");
  console.log("═".repeat(50));
  console.log(`Project: ${projectPath}`);
  console.log(`Period: Last ${daysBack} days`);
  console.log(`Sessions analyzed: ${sessionStats.length}`);
  console.log(`Unique files accessed: ${fileStats.size}`);
  console.log("");

  // Most accessed files
  console.log("🔥 Most Accessed Files:");
  console.log("─".repeat(50));

  const topFiles = Array.from(fileStats.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  for (const f of topFiles) {
    const relativePath = formatRelativePath(f.file, projectPath);
    const truncated =
      relativePath.length > 45
        ? "..." + relativePath.slice(-42)
        : relativePath.padEnd(45);
    console.log(
      `  ${truncated} R:${f.reads.toString().padStart(2)} W:${f.writes.toString().padStart(2)} E:${f.edits.toString().padStart(2)} (${f.sessions.size} sessions)`
    );
  }

  // Files with most writes/edits (hot spots)
  console.log("\n✏️  Most Modified Files:");
  console.log("─".repeat(50));

  const hotSpots = Array.from(fileStats.values())
    .filter((f) => f.writes + f.edits > 0)
    .sort((a, b) => b.writes + b.edits - (a.writes + a.edits))
    .slice(0, 10);

  for (const f of hotSpots) {
    const relativePath = formatRelativePath(f.file, projectPath);
    const truncated =
      relativePath.length > 45
        ? "..." + relativePath.slice(-42)
        : relativePath.padEnd(45);
    const mods = f.writes + f.edits;
    console.log(`  ${truncated} ${mods} modifications`);
  }

  // Recent session activity
  console.log("\n📅 Recent Session Activity:");
  console.log("─".repeat(50));

  const recentSessions = sessionStats
    .filter((s) => s.timestamp)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);

  for (const s of recentSessions) {
    const date = new Date(s.timestamp).toLocaleDateString();
    console.log(
      `  ${date}: ${s.filesAccessed} files (R:${s.reads} W:${s.writes} E:${s.edits})`
    );
  }

  console.log("");
}

// Main
async function main() {
  const args = process.argv.slice(2);

  let projectPath = process.cwd();
  let daysBack = 7;
  let jsonOutput = false;

  for (const arg of args) {
    if (arg.startsWith("--days=")) {
      daysBack = parseInt(arg.split("=")[1], 10) || 7;
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (!arg.startsWith("--")) {
      projectPath = arg;
    }
  }

  const { fileStats, sessionStats } = await collectStats(projectPath, daysBack);

  if (fileStats.size === 0) {
    console.log("No session data found for this project.");
    process.exit(1);
  }

  printReport(projectPath, fileStats, sessionStats, daysBack, jsonOutput);
}

main().catch(console.error);
