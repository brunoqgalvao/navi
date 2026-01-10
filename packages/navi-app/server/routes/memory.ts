/**
 * Project Memory Routes
 *
 * Handles reading and writing project memory files (.claude/MEMORY.md)
 * Used by the Memory Builder proactive hook.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { json, error } from "../utils/response";
import { projects } from "../db";

const MEMORY_FILENAME = "MEMORY.md";
const CLAUDE_DIR = ".claude";

interface MemoryEntry {
  category: string;
  content: string;
  sessionId?: string;
  timestamp: number;
}

/**
 * Get the path to the memory file for a project
 */
function getMemoryPath(projectPath: string): string {
  return join(projectPath, CLAUDE_DIR, MEMORY_FILENAME);
}

/**
 * Parse memory file content
 */
function parseMemory(content: string): Record<string, string[]> {
  const memory: Record<string, string[]> = {
    preferences: [],
    stack: [],
    patterns: [],
    style: [],
    context: [],
  };

  const sectionMap: Record<string, string> = {
    "preferences": "preferences",
    "tech stack": "stack",
    "coding patterns": "patterns",
    "style": "style",
    "project context": "context",
  };

  let currentSection: string | null = null;
  const lines = content.split("\n");

  for (const line of lines) {
    // Check for section headers (## 🛠️ Tech Stack)
    const sectionMatch = line.match(/^##\s+.?\s*(.+)$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].toLowerCase().trim();
      currentSection = sectionMap[sectionName] || null;
      continue;
    }

    // Check for list items
    const itemMatch = line.match(/^-\s+(.+)$/);
    if (itemMatch && currentSection && memory[currentSection]) {
      memory[currentSection].push(itemMatch[1].trim());
    }
  }

  return memory;
}

/**
 * Format memory as markdown
 */
function formatMemory(memory: Record<string, string[]>): string {
  const sections: string[] = [
    "# Project Memory",
    "",
    "_Automatically learned from conversations. Edit freely._",
    "",
  ];

  const addSection = (title: string, items: string[], icon: string) => {
    if (items.length === 0) return;
    sections.push(`## ${icon} ${title}`, "");
    for (const item of items) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  };

  addSection("Preferences", memory.preferences || [], "⚙️");
  addSection("Tech Stack", memory.stack || [], "🛠️");
  addSection("Coding Patterns", memory.patterns || [], "📐");
  addSection("Style", memory.style || [], "🎨");
  addSection("Project Context", memory.context || [], "📋");

  sections.push("---", `_Last updated: ${new Date().toISOString()}_`);

  return sections.join("\n");
}

/**
 * Add entries to existing memory
 */
function addEntries(existing: Record<string, string[]>, entries: MemoryEntry[]): Record<string, string[]> {
  const result = { ...existing };

  for (const entry of entries) {
    const category = entry.category;
    if (!result[category]) {
      result[category] = [];
    }

    // Avoid duplicates (simple string match)
    const normalizedContent = entry.content.toLowerCase().trim();
    const isDuplicate = result[category].some(
      (item) => item.toLowerCase().trim() === normalizedContent
    );

    if (!isDuplicate) {
      result[category].push(entry.content);
    }
  }

  return result;
}

export async function handleMemoryRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // GET /api/projects/:id/memory - Read project memory
  const getMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/memory$/);
  if (getMatch && method === "GET") {
    const projectId = getMatch[1];
    const project = projects.get(projectId);

    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const memoryPath = getMemoryPath(project.path);

    if (!existsSync(memoryPath)) {
      return json({ content: null, parsed: null });
    }

    try {
      const content = readFileSync(memoryPath, "utf-8");
      const parsed = parseMemory(content);
      return json({ content, parsed });
    } catch (e: any) {
      return json({ error: `Failed to read memory: ${e.message}` }, 500);
    }
  }

  // POST /api/projects/:id/memory - Add to project memory
  const postMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/memory$/);
  if (postMatch && method === "POST") {
    const projectId = postMatch[1];
    const project = projects.get(projectId);

    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    try {
      const body = await req.json();
      const entries: MemoryEntry[] = body.entries;

      if (!Array.isArray(entries) || entries.length === 0) {
        return json({ error: "No entries provided" }, 400);
      }

      const memoryPath = getMemoryPath(project.path);
      const claudeDir = dirname(memoryPath);

      // Ensure .claude directory exists
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      // Read existing or start fresh
      let existing: Record<string, string[]> = {
        preferences: [],
        stack: [],
        patterns: [],
        style: [],
        context: [],
      };

      if (existsSync(memoryPath)) {
        const content = readFileSync(memoryPath, "utf-8");
        existing = parseMemory(content);
      }

      // Add new entries
      const updated = addEntries(existing, entries);

      // Write back
      const formatted = formatMemory(updated);
      writeFileSync(memoryPath, formatted, "utf-8");

      return json({
        success: true,
        path: memoryPath,
        entriesAdded: entries.length,
      });
    } catch (e: any) {
      return json({ error: `Failed to save memory: ${e.message}` }, 500);
    }
  }

  // PUT /api/projects/:id/memory - Replace entire memory
  const putMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/memory$/);
  if (putMatch && method === "PUT") {
    const projectId = putMatch[1];
    const project = projects.get(projectId);

    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    try {
      const body = await req.json();
      const content: string = body.content;

      if (typeof content !== "string") {
        return json({ error: "Content must be a string" }, 400);
      }

      const memoryPath = getMemoryPath(project.path);
      const claudeDir = dirname(memoryPath);

      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      writeFileSync(memoryPath, content, "utf-8");

      return json({ success: true, path: memoryPath });
    } catch (e: any) {
      return json({ error: `Failed to save memory: ${e.message}` }, 500);
    }
  }

  // DELETE /api/projects/:id/memory - Clear memory
  const deleteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/memory$/);
  if (deleteMatch && method === "DELETE") {
    const projectId = deleteMatch[1];
    const project = projects.get(projectId);

    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    try {
      const memoryPath = getMemoryPath(project.path);

      if (existsSync(memoryPath)) {
        const { unlinkSync } = await import("fs");
        unlinkSync(memoryPath);
      }

      return json({ success: true });
    } catch (e: any) {
      return json({ error: `Failed to delete memory: ${e.message}` }, 500);
    }
  }

  return null;
}
