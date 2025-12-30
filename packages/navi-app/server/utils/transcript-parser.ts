import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface ToolUsage {
  name: string;
  count: number;
}

export interface FileAccess {
  path: string;
  reads: number;
  writes: number;
  edits: number;
  lineRanges: Array<{ offset?: number; limit?: number }>;
}

export interface SessionStats {
  sessionId: string;
  timestamp: number;
  toolUsage: Record<string, number>;
  fileAccess: Record<string, FileAccess>;
}

export interface ProjectAnalytics {
  projectPath: string;
  totalSessions: number;
  analyzedSessions: number;
  dateRange: { start: number; end: number } | null;
  toolUsage: ToolUsage[];
  topFiles: FileAccess[];
  hotspots: Array<{ file: string; range: string; accessCount: number }>;
  totalReads: number;
  totalWrites: number;
  totalEdits: number;
}

function getClaudeProjectPath(projectPath: string): string {
  const encodedPath = projectPath.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", encodedPath);
}

interface TranscriptLine {
  type?: string;
  message?: {
    role?: string;
    content?: Array<{
      type: string;
      name?: string;
      input?: {
        file_path?: string;
        path?: string;
        command?: string;
        pattern?: string;
        offset?: number;
        limit?: number;
        old_string?: string;
        new_string?: string;
        content?: string;
      };
    }>;
  };
  timestamp?: string;
  sessionId?: string;
}

async function parseTranscriptFile(filePath: string): Promise<SessionStats | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    const toolUsage: Record<string, number> = {};
    const fileAccess: Record<string, FileAccess> = {};
    let sessionId = "";
    let timestamp = 0;

    for (const line of lines) {
      try {
        const entry: TranscriptLine = JSON.parse(line);

        if (entry.sessionId && !sessionId) {
          sessionId = entry.sessionId;
        }
        if (entry.timestamp && !timestamp) {
          timestamp = new Date(entry.timestamp).getTime();
        }

        if (entry.type === "assistant" && entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_use" && block.name) {
                const toolName = block.name;
                toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;

                // Track file access
                if (block.input) {
                  const filePath = block.input.file_path || block.input.path;
                  if (filePath && typeof filePath === "string") {
                    if (!fileAccess[filePath]) {
                      fileAccess[filePath] = {
                        path: filePath,
                        reads: 0,
                        writes: 0,
                        edits: 0,
                        lineRanges: [],
                      };
                    }

                    if (toolName === "Read") {
                      fileAccess[filePath].reads++;
                      if (block.input.offset !== undefined || block.input.limit !== undefined) {
                        fileAccess[filePath].lineRanges.push({
                          offset: block.input.offset,
                          limit: block.input.limit,
                        });
                      }
                    } else if (toolName === "Write") {
                      fileAccess[filePath].writes++;
                    } else if (toolName === "Edit" || toolName === "MultiEdit") {
                      fileAccess[filePath].edits++;
                    }
                  }
                }
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (Object.keys(toolUsage).length === 0) {
      return null;
    }

    return { sessionId, timestamp, toolUsage, fileAccess };
  } catch {
    return null;
  }
}

export async function analyzeProjectTranscripts(
  projectPath: string,
  options?: { days?: number; limit?: number }
): Promise<ProjectAnalytics> {
  const claudeProjectPath = getClaudeProjectPath(projectPath);
  const days = options?.days ?? 30;
  const limit = options?.limit ?? 100;
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

  const result: ProjectAnalytics = {
    projectPath,
    totalSessions: 0,
    analyzedSessions: 0,
    dateRange: null,
    toolUsage: [],
    topFiles: [],
    hotspots: [],
    totalReads: 0,
    totalWrites: 0,
    totalEdits: 0,
  };

  const aggregatedTools: Record<string, number> = {};
  const aggregatedFiles: Record<string, FileAccess> = {};
  let minTime = Infinity;
  let maxTime = 0;

  try {
    const entries = await readdir(claudeProjectPath);
    const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));
    result.totalSessions = jsonlFiles.length;

    // Get file stats and sort by modification time (newest first)
    const filesWithStats = await Promise.all(
      jsonlFiles.map(async (f) => {
        const fullPath = join(claudeProjectPath, f);
        try {
          const stats = await stat(fullPath);
          return { file: f, mtime: stats.mtime.getTime(), size: stats.size };
        } catch {
          return { file: f, mtime: 0, size: 0 };
        }
      })
    );

    // Filter by date and size, sort by newest, take limit
    const recentFiles = filesWithStats
      .filter((f) => f.mtime >= cutoffTime && f.size > 0)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);

    for (const { file } of recentFiles) {
      const fullPath = join(claudeProjectPath, file);
      const sessionStats = await parseTranscriptFile(fullPath);

      if (sessionStats) {
        result.analyzedSessions++;

        if (sessionStats.timestamp) {
          minTime = Math.min(minTime, sessionStats.timestamp);
          maxTime = Math.max(maxTime, sessionStats.timestamp);
        }

        // Aggregate tool usage
        for (const [tool, count] of Object.entries(sessionStats.toolUsage)) {
          aggregatedTools[tool] = (aggregatedTools[tool] || 0) + count;
        }

        // Aggregate file access
        for (const [path, access] of Object.entries(sessionStats.fileAccess)) {
          if (!aggregatedFiles[path]) {
            aggregatedFiles[path] = { ...access };
          } else {
            aggregatedFiles[path].reads += access.reads;
            aggregatedFiles[path].writes += access.writes;
            aggregatedFiles[path].edits += access.edits;
            aggregatedFiles[path].lineRanges.push(...access.lineRanges);
          }
        }
      }
    }
  } catch (e) {
    // Project transcripts not found
    console.error("Error analyzing transcripts:", e);
  }

  // Build final results
  result.toolUsage = Object.entries(aggregatedTools)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  result.topFiles = Object.values(aggregatedFiles)
    .sort((a, b) => b.reads + b.writes + b.edits - (a.reads + a.writes + a.edits))
    .slice(0, 50);

  // Calculate totals
  for (const file of Object.values(aggregatedFiles)) {
    result.totalReads += file.reads;
    result.totalWrites += file.writes;
    result.totalEdits += file.edits;
  }

  // Build hotspots (files with line range access patterns)
  const hotspotsMap: Record<string, number> = {};
  for (const file of Object.values(aggregatedFiles)) {
    for (const range of file.lineRanges) {
      if (range.offset !== undefined) {
        const rangeKey = `${file.path}:${range.offset}-${range.offset + (range.limit || 100)}`;
        hotspotsMap[rangeKey] = (hotspotsMap[rangeKey] || 0) + 1;
      }
    }
  }

  result.hotspots = Object.entries(hotspotsMap)
    .filter(([_, count]) => count > 1)
    .map(([key, count]) => {
      const lastColon = key.lastIndexOf(":");
      return {
        file: key.substring(0, lastColon),
        range: key.substring(lastColon + 1),
        accessCount: count,
      };
    })
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 20);

  if (minTime !== Infinity && maxTime !== 0) {
    result.dateRange = { start: minTime, end: maxTime };
  }

  return result;
}
