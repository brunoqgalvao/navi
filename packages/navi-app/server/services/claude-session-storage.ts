import { homedir } from "os";
import { join, dirname, basename } from "path";
import { readdir, readFile, stat, writeFile } from "fs/promises";
import type { Dirent } from "fs";

function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

function encodeClaudeProjectPath(projectPath: string): string {
  return projectPath.replace(/[\\/]/g, "-");
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

export function buildPrunedSummary(originalContent: string, maxPrunedLength: number): string {
  const contentLines = originalContent.split("\n");
  const lineCount = contentLines.length;

  if (lineCount > 3) {
    return contentLines.slice(0, 2).join("\n") + `\n... [${lineCount - 2} lines, ${originalContent.length} chars pruned]`;
  }

  return originalContent.slice(0, Math.max(0, maxPrunedLength - 30)) + `... [${originalContent.length} chars pruned]`;
}

function isPrunedSummaryContent(content: string): boolean {
  return content.includes("chars pruned]");
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function scanToolResultsDirs(sessionDir: string, maxDepth: number = 4): Promise<string[]> {
  const found: string[] = [];

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth < 0) return;

    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(currentDir, entry.name);
      if (entry.name === "tool-results") {
        found.push(fullPath);
        continue;
      }
      await walk(fullPath, depth - 1);
    }
  }

  await walk(sessionDir, maxDepth);
  return found;
}

interface ClaudeSessionArtifacts {
  sessionFile: string | null;
  toolResultsDirs: string[];
}

async function resolveClaudeSessionArtifacts(
  claudeSessionId: string,
  candidateProjectPaths: Array<string | null | undefined>
): Promise<ClaudeSessionArtifacts> {
  const claudeConfigDir = getClaudeConfigDir();
  const projectDirs = dedupeStrings(
    candidateProjectPaths
      .filter((value): value is string => !!value)
      .map((projectPath) => join(claudeConfigDir, "projects", encodeClaudeProjectPath(projectPath)))
  );

  const sessionsDir = join(claudeConfigDir, "sessions");

  const sessionFileCandidates: string[] = [];
  for (const projectDir of projectDirs) {
    sessionFileCandidates.push(join(projectDir, `${claudeSessionId}.jsonl`));
    sessionFileCandidates.push(join(projectDir, claudeSessionId, "session.jsonl"));
    sessionFileCandidates.push(join(projectDir, claudeSessionId, "conversation.jsonl"));
    sessionFileCandidates.push(join(projectDir, claudeSessionId, "transcript.jsonl"));
  }
  sessionFileCandidates.push(join(sessionsDir, `${claudeSessionId}.jsonl`));
  sessionFileCandidates.push(join(sessionsDir, claudeSessionId, "session.jsonl"));
  sessionFileCandidates.push(join(sessionsDir, claudeSessionId, "conversation.jsonl"));
  sessionFileCandidates.push(join(sessionsDir, claudeSessionId, "transcript.jsonl"));

  let sessionFile: string | null = null;
  for (const candidate of sessionFileCandidates) {
    if (await isFile(candidate)) {
      sessionFile = candidate;
      break;
    }
  }

  if (!sessionFile) {
    const projectsRoot = join(claudeConfigDir, "projects");
    if (await isDirectory(projectsRoot)) {
      const projectEntries = await readdir(projectsRoot, { withFileTypes: true });
      for (const entry of projectEntries) {
        if (!entry.isDirectory()) continue;
        const projectDir = join(projectsRoot, entry.name);
        const direct = join(projectDir, `${claudeSessionId}.jsonl`);
        if (await isFile(direct)) {
          sessionFile = direct;
          break;
        }
        const nestedCandidates = [
          join(projectDir, claudeSessionId, "session.jsonl"),
          join(projectDir, claudeSessionId, "conversation.jsonl"),
          join(projectDir, claudeSessionId, "transcript.jsonl"),
        ];
        for (const nested of nestedCandidates) {
          if (await isFile(nested)) {
            sessionFile = nested;
            break;
          }
        }
        if (sessionFile) break;
      }
    }
  }

  if (!sessionFile && await isDirectory(sessionsDir)) {
    const direct = join(sessionsDir, `${claudeSessionId}.jsonl`);
    if (await isFile(direct)) {
      sessionFile = direct;
    }
  }

  const sessionDirs = dedupeStrings([
    ...projectDirs.map((projectDir) => join(projectDir, claudeSessionId)),
    join(sessionsDir, claudeSessionId),
    ...(sessionFile
      ? [
          basename(dirname(sessionFile)) === claudeSessionId
            ? dirname(sessionFile)
            : join(dirname(sessionFile), claudeSessionId),
        ]
      : []),
  ]);

  const toolResultsDirs = dedupeStrings(
    (
      await Promise.all(
        sessionDirs.map(async (sessionDir) => {
          if (!(await isDirectory(sessionDir))) return [];
          return scanToolResultsDirs(sessionDir);
        })
      )
    ).flat()
  );

  return { sessionFile, toolResultsDirs };
}

interface PruneCounters {
  prunedCount: number;
  charsSaved: number;
  prunedToolUseIds: Set<string>;
}

function pruneToolResultBlocks(
  blocks: any[],
  maxPrunedLength: number,
  counters: PruneCounters
): { modified: boolean; blocks: any[] } {
  let modified = false;
  const prunedBlocks = blocks.map((block) => {
    if (!block || block.type !== "tool_result") {
      return block;
    }

    const originalContent = typeof block.content === "string"
      ? block.content
      : JSON.stringify(block.content);

    if (block.pruned === true || isPrunedSummaryContent(originalContent)) {
      return block;
    }

    if (originalContent.length <= maxPrunedLength) {
      return block;
    }

    modified = true;
    const summary = buildPrunedSummary(originalContent, maxPrunedLength);
    counters.prunedCount++;
    counters.charsSaved += Math.max(0, originalContent.length - summary.length);
    if (typeof block.tool_use_id === "string" && block.tool_use_id.length > 0) {
      counters.prunedToolUseIds.add(block.tool_use_id);
    }

    return {
      ...block,
      content: summary,
      pruned: true,
      original_chars: originalContent.length,
    };
  });

  return { modified, blocks: prunedBlocks };
}

function pruneToolUseResultPayload(
  payload: unknown,
  maxPrunedLength: number,
  counters: PruneCounters
): { changed: boolean; value: unknown } {
  if (payload == null) {
    return { changed: false, value: payload };
  }

  if (payload && typeof payload === "object" && (payload as Record<string, unknown>).pruned === true) {
    return { changed: false, value: payload };
  }

  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (isPrunedSummaryContent(serialized)) {
    return { changed: false, value: payload };
  }

  if (serialized.length <= maxPrunedLength) {
    return { changed: false, value: payload };
  }

  const summary = buildPrunedSummary(serialized, maxPrunedLength);
  const originalChars = serialized.length;
  const nextValue: Record<string, unknown> = {
    pruned: true,
    summary,
    originalChars,
  };

  if (payload && typeof payload === "object") {
    const payloadObject = payload as Record<string, unknown>;
    if (typeof payloadObject.filePath === "string") nextValue.filePath = payloadObject.filePath;
    if (typeof payloadObject.path === "string") nextValue.path = payloadObject.path;
    if (typeof payloadObject.command === "string") nextValue.command = payloadObject.command;
  }

  counters.prunedCount++;
  counters.charsSaved += Math.max(0, originalChars - JSON.stringify(nextValue).length);
  return { changed: true, value: nextValue };
}

function pruneToolUseResultFields(
  container: Record<string, unknown> | null | undefined,
  maxPrunedLength: number,
  counters: PruneCounters
): boolean {
  if (!container || typeof container !== "object") {
    return false;
  }

  let modified = false;
  for (const key of ["toolUseResult", "tool_use_result"]) {
    if (!Object.prototype.hasOwnProperty.call(container, key)) continue;
    const result = pruneToolUseResultPayload(container[key], maxPrunedLength, counters);
    if (result.changed) {
      container[key] = result.value;
      modified = true;
    }
  }
  return modified;
}

async function pruneToolResultFiles(
  toolResultsDirs: string[],
  prunedToolUseIds: Set<string>,
  preserveRecentCount: number,
  maxPrunedLength: number
): Promise<{ prunedCount: number; charsSaved: number }> {
  let prunedCount = 0;
  let charsSaved = 0;

  const pruneFile = async (filePath: string): Promise<void> => {
    if (!(await isFile(filePath))) return;
    const originalContent = await readFile(filePath, "utf-8");
    if (originalContent.length <= maxPrunedLength || isPrunedSummaryContent(originalContent)) return;
    const summary = buildPrunedSummary(originalContent, maxPrunedLength);
    await writeFile(filePath, summary + "\n");
    prunedCount++;
    charsSaved += Math.max(0, originalContent.length - summary.length);
  };

  if (prunedToolUseIds.size > 0) {
    const targetFiles = dedupeStrings(
      toolResultsDirs.flatMap((toolResultsDir) =>
        Array.from(prunedToolUseIds).map((toolUseId) => join(toolResultsDir, `${toolUseId}.txt`))
      )
    );
    for (const filePath of targetFiles) {
      await pruneFile(filePath);
    }
    return { prunedCount, charsSaved };
  }

  const txtFilesWithMtime: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const toolResultsDir of toolResultsDirs) {
    let entries: Dirent[];
    try {
      entries = await readdir(toolResultsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
      const filePath = join(toolResultsDir, entry.name);
      try {
        const fileStat = await stat(filePath);
        txtFilesWithMtime.push({ filePath, mtimeMs: fileStat.mtimeMs });
      } catch {}
    }
  }

  txtFilesWithMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const filesToPrune = txtFilesWithMtime
    .slice(Math.max(0, preserveRecentCount))
    .map((file) => file.filePath);

  for (const filePath of dedupeStrings(filesToPrune)) {
    await pruneFile(filePath);
  }

  return { prunedCount, charsSaved };
}

export interface PruneClaudeSessionArtifactsOptions {
  claudeSessionId: string;
  candidateProjectPaths: Array<string | null | undefined>;
  preserveRecentCount?: number;
  maxPrunedLength?: number;
}

export interface PruneClaudeSessionArtifactsResult {
  prunedCount: number;
  charsSaved: number;
  prunedToolUseIds: string[];
  foundArtifacts: boolean;
}

export async function pruneClaudeSessionArtifacts(
  options: PruneClaudeSessionArtifactsOptions
): Promise<PruneClaudeSessionArtifactsResult> {
  const preserveRecentCount = options.preserveRecentCount ?? 0;
  const maxPrunedLength = options.maxPrunedLength ?? 200;

  const { sessionFile, toolResultsDirs } = await resolveClaudeSessionArtifacts(
    options.claudeSessionId,
    options.candidateProjectPaths
  );

  if (!sessionFile && toolResultsDirs.length === 0) {
    return {
      prunedCount: 0,
      charsSaved: 0,
      prunedToolUseIds: [],
      foundArtifacts: false,
    };
  }

  const counters: PruneCounters = {
    prunedCount: 0,
    charsSaved: 0,
    prunedToolUseIds: new Set<string>(),
  };

  if (sessionFile) {
    const rawContent = await readFile(sessionFile, "utf-8");
    const trimmedContent = rawContent.trim();
    const lines = trimmedContent.length > 0 ? trimmedContent.split("\n") : [];

    const userMessageIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === "user") {
          userMessageIndices.push(i);
        }
      } catch {}
    }

    const normalizedPreserveRecentCount = Math.max(0, preserveRecentCount);
    const preserveFromIndex = normalizedPreserveRecentCount === 0
      ? Number.POSITIVE_INFINITY
      : userMessageIndices.length > normalizedPreserveRecentCount
        ? userMessageIndices[userMessageIndices.length - normalizedPreserveRecentCount]
        : 0;

    const prunedLines = lines.map((line, index) => {
      if (index >= preserveFromIndex) {
        return line;
      }

      try {
        const entry = JSON.parse(line) as any;
        let modified = false;

        if (Array.isArray(entry?.message?.content)) {
          const result = pruneToolResultBlocks(entry.message.content, maxPrunedLength, counters);
          if (result.modified) {
            entry.message.content = result.blocks;
            modified = true;
          }
        }

        if (Array.isArray(entry?.data?.message?.message?.content)) {
          const result = pruneToolResultBlocks(entry.data.message.message.content, maxPrunedLength, counters);
          if (result.modified) {
            entry.data.message.message.content = result.blocks;
            modified = true;
          }
        }

        if (Array.isArray(entry?.data?.message?.content)) {
          const result = pruneToolResultBlocks(entry.data.message.content, maxPrunedLength, counters);
          if (result.modified) {
            entry.data.message.content = result.blocks;
            modified = true;
          }
        }

        if (pruneToolUseResultFields(entry, maxPrunedLength, counters)) {
          modified = true;
        }

        if (pruneToolUseResultFields(entry?.data?.message, maxPrunedLength, counters)) {
          modified = true;
        }

        if (pruneToolUseResultFields(entry?.data?.message?.message, maxPrunedLength, counters)) {
          modified = true;
        }

        return modified ? JSON.stringify(entry) : line;
      } catch {
        return line;
      }
    });

    await writeFile(sessionFile, prunedLines.length > 0 ? prunedLines.join("\n") + "\n" : "");
  }

  const toolResultFilePrune = await pruneToolResultFiles(
    toolResultsDirs,
    counters.prunedToolUseIds,
    preserveRecentCount,
    maxPrunedLength
  );

  return {
    prunedCount: counters.prunedCount + toolResultFilePrune.prunedCount,
    charsSaved: counters.charsSaved + toolResultFilePrune.charsSaved,
    prunedToolUseIds: Array.from(counters.prunedToolUseIds),
    foundArtifacts: true,
  };
}
