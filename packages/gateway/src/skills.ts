/**
 * skills.ts — Skills index loading and injection for agent sessions.
 *
 * SKILL.md files live in <dir>/<skill-name>/SKILL.md. Each file may have a
 * YAML frontmatter block (---\nkey: value\n---) containing at minimum:
 *   name: <skill-name>
 *   description: <one-liner>
 *
 * loadSkillIndex(dirs) searches each dir for each subdir's SKILL.md.
 * Earlier dirs shadow later dirs by skill name (project-level skills
 * before global skills).
 *
 * buildSkillsContext(index) returns a compact injection block that backends
 * with capabilities().skills === "injected" include in their system prompt
 * via SessionOptions.systemContext.
 *
 * registerUseSkillTool(mcpServer, index) adds a use_skill(name) tool that
 * returns the full SKILL.md content.
 *
 * WIRING NOTE (for the server package, not done here):
 *   For backends with capabilities().skills === "injected", the caller:
 *     1. Calls loadSkillIndex(dirs) to build the index.
 *     2. Passes buildSkillsContext(index) as SessionOptions.systemContext.
 *     3. Creates an MCP server with registerUseSkillTool, starts a control
 *        server, and includes the McpServerConfig in SessionOptions.mcpServers.
 *   The gateway does NOT auto-wire this; wiring is the server package's job.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkillIndexEntry {
  /** Parsed skill name (from frontmatter). Falls back to directory name. */
  name: string;
  /** One-line description (from frontmatter). Empty string if missing. */
  description: string;
  /** Absolute path to the SKILL.md file */
  filePath: string;
  /** Warning message if the file had parse issues (but was not skipped) */
  warning?: string;
}

// ── YAML frontmatter parser ───────────────────────────────────────────────────

interface Frontmatter {
  name?: string;
  description?: string;
}

/**
 * Minimal YAML frontmatter parser. Handles simple key: value pairs.
 * Does not handle arrays, nested objects, or multi-line values.
 */
function parseFrontmatter(content: string): { fm: Frontmatter; body: string; warning?: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { fm: {}, body: content };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { fm: {}, body: content, warning: "unclosed YAML frontmatter block" };
  }

  const fm: Frontmatter = {};
  let warning: string | undefined;

  for (let i = 1; i < endIdx; i++) {
    const line = lines[i] ?? "";
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    // Remove surrounding quotes if present
    const unquoted = value.replace(/^["'](.*)["']$/, "$1");
    if (key === "name") fm.name = unquoted;
    else if (key === "description") fm.description = unquoted;
  }

  const body = lines.slice(endIdx + 1).join("\n");
  return { fm, body, warning };
}

// ── loadSkillIndex ────────────────────────────────────────────────────────────

/**
 * Loads the skill index from an ordered list of directories.
 * Earlier directories shadow later ones by skill name.
 *
 * Skills with no parseable content are skipped (an entry with warning is
 * returned for malformed but readable files; completely unreadable files are
 * silently skipped).
 */
export function loadSkillIndex(dirs: string[]): SkillIndexEntry[] {
  // name → entry (first-wins shadowing)
  const byName = new Map<string, SkillIndexEntry>();

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      // Directory doesn't exist or isn't readable — skip silently
      continue;
    }

    for (const entry of entries) {
      const skillDir = join(dir, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(skillDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      const skillFile = join(skillDir, "SKILL.md");
      let content: string;
      try {
        content = readFileSync(skillFile, "utf-8");
      } catch {
        // SKILL.md doesn't exist — skip this directory
        continue;
      }

      const { fm, warning } = parseFrontmatter(content);

      // Use frontmatter name if present, otherwise fall back to directory name
      const name = (fm.name ?? entry).trim();
      if (!name) continue; // sanity check

      // Skip if a higher-priority dir already has this skill name
      if (byName.has(name)) continue;

      const skillEntry: SkillIndexEntry = {
        name,
        description: fm.description ?? "",
        filePath: skillFile,
      };
      if (warning) skillEntry.warning = warning;

      byName.set(name, skillEntry);
    }
  }

  return Array.from(byName.values());
}

// ── buildSkillsContext ────────────────────────────────────────────────────────

/**
 * Builds a compact skills injection block for system prompts.
 * Backends with capabilities().skills === "injected" receive this as
 * SessionOptions.systemContext.
 */
export function buildSkillsContext(index: SkillIndexEntry[]): string {
  if (index.length === 0) {
    return "";
  }

  const lines: string[] = [
    "Available skills (use the use_skill tool to get full instructions):",
    "",
  ];

  for (const entry of index) {
    const desc = entry.description ? ` — ${entry.description}` : "";
    lines.push(`- ${entry.name}${desc}`);
  }

  lines.push("");
  lines.push(
    "To use a skill: call the use_skill tool with the skill name to retrieve its full instructions."
  );

  return lines.join("\n");
}

// ── registerUseSkillTool ──────────────────────────────────────────────────────

/**
 * Registers a use_skill(name) tool on the given McpServer.
 * Returns the full SKILL.md content for the named skill.
 * Returns an MCP error result if the skill name is unknown.
 */
export function registerUseSkillTool(
  mcpServer: McpServer,
  index: SkillIndexEntry[]
): void {
  const byName = new Map(index.map((e) => [e.name, e]));

  mcpServer.tool(
    "use_skill",
    "Retrieve the full instructions for a named skill. Call this before using any skill.",
    { name: z.string().describe("The skill name to look up") },
    async (args) => {
      const entry = byName.get(args.name);
      if (!entry) {
        const available = Array.from(byName.keys()).join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown skill: "${args.name}". Available skills: ${available || "(none)"}`,
            },
          ],
          isError: true,
        };
      }

      let content: string;
      try {
        content = readFileSync(entry.filePath, "utf-8");
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to read skill file: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: content }],
      };
    }
  );
}
