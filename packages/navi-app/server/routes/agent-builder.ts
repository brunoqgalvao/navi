import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename, extname, relative } from "path";
import { homedir } from "os";
import { json } from "../utils/response";
import { projects } from "../db";

// Navi agent builder paths (extended format with folders)
const NAVI_GLOBAL_AGENTS = join(homedir(), ".navi", "agents");
const CLAUDE_GLOBAL_SKILLS = join(homedir(), ".claude", "skills");

function getProjectAgentsDir(projectPath: string): string {
  return join(projectPath, ".navi", "agents");
}

function getProjectSkillsDir(projectPath: string): string {
  return join(projectPath, ".claude", "skills");
}

// Types for Agent Builder
export interface AgentFileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: AgentFileNode[];
  extension?: string;
  size?: number;
  modified?: number;
}

export interface AgentDefinition {
  id: string;
  name: string;
  type: "agent" | "skill";
  path: string;
  description?: string;
  prompt?: string;
  tools?: string[];
  model?: "haiku" | "sonnet" | "opus";
  hasSchema?: boolean;
  skillCount?: number;
  scriptCount?: number;
}

// Parse agent.md frontmatter
interface AgentFrontmatter {
  name?: string;
  description?: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
  skills?: string[];
  subAgents?: string[];
  scripts?: string[];
}

function parseFrontmatter(content: string): { frontmatter: AgentFrontmatter; body: string } {
  const lines = content.split("\n");
  const frontmatter: AgentFrontmatter = {};
  let body = content;

  if (lines[0]?.trim() === "---") {
    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") {
        endIndex = i;
        break;
      }
    }

    if (endIndex > 0) {
      const yamlLines = lines.slice(1, endIndex);
      body = lines.slice(endIndex + 1).join("\n").trim();

      let currentKey = "";
      let inArray = false;
      const arrayValues: string[] = [];

      for (const line of yamlLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("- ") && inArray) {
          arrayValues.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
          continue;
        }

        if (inArray && currentKey) {
          (frontmatter as any)[currentKey] = [...arrayValues];
          arrayValues.length = 0;
          inArray = false;
        }

        const colonIndex = trimmed.indexOf(":");
        if (colonIndex > 0) {
          const key = trimmed.slice(0, colonIndex).trim();
          const value = trimmed.slice(colonIndex + 1).trim();

          currentKey = key;

          if (value === "" || value === "|") {
            inArray = true;
          } else {
            (frontmatter as any)[key] = value.replace(/^["']|["']$/g, "");
          }
        }
      }

      if (inArray && currentKey && arrayValues.length > 0) {
        (frontmatter as any)[currentKey] = [...arrayValues];
      }
    }
  }

  return { frontmatter, body };
}

function serializeFrontmatter(frontmatter: AgentFrontmatter, body: string): string {
  const lines: string[] = ["---"];

  if (frontmatter.name) lines.push(`name: "${frontmatter.name}"`);
  if (frontmatter.description) lines.push(`description: "${frontmatter.description}"`);
  if (frontmatter.model) lines.push(`model: ${frontmatter.model}`);

  if (frontmatter.tools && frontmatter.tools.length > 0) {
    lines.push("tools:");
    for (const tool of frontmatter.tools) {
      lines.push(`  - ${tool}`);
    }
  }

  if (frontmatter.skills && frontmatter.skills.length > 0) {
    lines.push("skills:");
    for (const skill of frontmatter.skills) {
      lines.push(`  - ${skill}`);
    }
  }

  if (frontmatter.subAgents && frontmatter.subAgents.length > 0) {
    lines.push("subAgents:");
    for (const agent of frontmatter.subAgents) {
      lines.push(`  - ${agent}`);
    }
  }

  if (frontmatter.scripts && frontmatter.scripts.length > 0) {
    lines.push("scripts:");
    for (const script of frontmatter.scripts) {
      lines.push(`  - ${script}`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n");
}

// Build file tree for an agent folder
function buildFileTree(dirPath: string, basePath?: string): AgentFileNode {
  const name = basename(dirPath);
  const node: AgentFileNode = {
    name,
    path: dirPath,
    type: "directory",
    children: [],
  };

  if (!existsSync(dirPath)) return node;

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      if (entry.startsWith(".")) continue; // Skip hidden files

      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        node.children!.push(buildFileTree(fullPath, basePath || dirPath));
      } else {
        node.children!.push({
          name: entry,
          path: fullPath,
          type: "file",
          extension: extname(entry).slice(1),
          size: stat.size,
          modified: stat.mtimeMs,
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    node.children!.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch (e) {
    console.error(`Failed to read directory ${dirPath}:`, e);
  }

  return node;
}

// Scan for agents (folder-based format)
function scanAgentFolders(dir: string): AgentDefinition[] {
  const agents: AgentDefinition[] = [];
  if (!existsSync(dir)) return agents;

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (!stat.isDirectory()) continue;

      // Look for agent.md in the folder
      const agentMdPath = join(fullPath, "agent.md");
      if (!existsSync(agentMdPath)) continue;

      try {
        const content = readFileSync(agentMdPath, "utf-8");
        const { frontmatter, body } = parseFrontmatter(content);

        // Check for optional files
        const hasSchema = existsSync(join(fullPath, "schema.ts"));
        const skillsDir = join(fullPath, "skills");
        const scriptsDir = join(fullPath, "scripts");

        let skillCount = 0;
        let scriptCount = 0;

        if (existsSync(skillsDir)) {
          skillCount = readdirSync(skillsDir).filter(f => f.endsWith(".md")).length;
        }
        if (existsSync(scriptsDir)) {
          scriptCount = readdirSync(scriptsDir).filter(f => !f.startsWith(".")).length;
        }

        agents.push({
          id: entry,
          name: frontmatter.name || entry,
          type: "agent",
          path: fullPath,
          description: frontmatter.description,
          prompt: body,
          tools: frontmatter.tools,
          model: frontmatter.model,
          hasSchema,
          skillCount,
          scriptCount,
        });
      } catch (e) {
        console.error(`Failed to parse agent ${entry}:`, e);
      }
    }
  } catch (e) {
    console.error(`Failed to scan agents in ${dir}:`, e);
  }

  return agents;
}

// Scan for skills (SKILL.md format)
function scanSkills(dir: string): AgentDefinition[] {
  const skills: AgentDefinition[] = [];
  if (!existsSync(dir)) return skills;

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (!stat.isDirectory()) continue;

      // Look for SKILL.md in the folder
      const skillMdPath = join(fullPath, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;

      try {
        const content = readFileSync(skillMdPath, "utf-8");
        const { frontmatter, body } = parseFrontmatter(content);

        skills.push({
          id: entry,
          name: frontmatter.name || entry,
          type: "skill",
          path: fullPath,
          description: frontmatter.description,
          prompt: body,
          tools: frontmatter.tools,
        });
      } catch (e) {
        console.error(`Failed to parse skill ${entry}:`, e);
      }
    }
  } catch (e) {
    console.error(`Failed to scan skills in ${dir}:`, e);
  }

  return skills;
}

export async function handleAgentBuilderRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  // GET /api/agent-builder/library - List all agents and skills
  if (url.pathname === "/api/agent-builder/library" && method === "GET") {
    const globalAgents = scanAgentFolders(NAVI_GLOBAL_AGENTS);
    const globalSkills = scanSkills(CLAUDE_GLOBAL_SKILLS);

    return json({
      agents: globalAgents,
      skills: globalSkills,
    });
  }

  // GET /api/agent-builder/agents/:id/files - Get file tree for an agent
  const filesMatch = url.pathname.match(/^\/api\/agent-builder\/agents\/([^/]+)\/files$/);
  if (filesMatch && method === "GET") {
    const agentId = decodeURIComponent(filesMatch[1]);
    const agentPath = join(NAVI_GLOBAL_AGENTS, agentId);

    if (!existsSync(agentPath)) {
      return json({ error: "Agent not found" }, 404);
    }

    const tree = buildFileTree(agentPath);
    return json(tree);
  }

  // GET /api/agent-builder/file?path=... - Read a file
  if (url.pathname === "/api/agent-builder/file" && method === "GET") {
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return json({ error: "Path is required" }, 400);
    }

    // Security: only allow reading from .navi or .claude directories
    const normalizedPath = join(filePath);
    if (!normalizedPath.includes(".navi") && !normalizedPath.includes(".claude")) {
      return json({ error: "Access denied" }, 403);
    }

    if (!existsSync(normalizedPath)) {
      return json({ error: "File not found" }, 404);
    }

    try {
      const content = readFileSync(normalizedPath, "utf-8");
      const stat = statSync(normalizedPath);

      return json({
        path: normalizedPath,
        content,
        size: stat.size,
        modified: stat.mtimeMs,
      });
    } catch (e: any) {
      return json({ error: e.message || "Failed to read file" }, 500);
    }
  }

  // PUT /api/agent-builder/file - Write a file
  if (url.pathname === "/api/agent-builder/file" && method === "PUT") {
    try {
      const body = await req.json();
      const { path: filePath, content } = body;

      if (!filePath || content === undefined) {
        return json({ error: "Path and content are required" }, 400);
      }

      // Security: only allow writing to .navi or .claude directories
      const normalizedPath = join(filePath);
      if (!normalizedPath.includes(".navi") && !normalizedPath.includes(".claude")) {
        return json({ error: "Access denied" }, 403);
      }

      // Ensure directory exists
      const dir = join(normalizedPath, "..");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(normalizedPath, content);

      return json({ success: true, path: normalizedPath });
    } catch (e: any) {
      return json({ error: e.message || "Failed to write file" }, 500);
    }
  }

  // POST /api/agent-builder/agents - Create new agent
  if (url.pathname === "/api/agent-builder/agents" && method === "POST") {
    try {
      const body = await req.json();
      const { name, description, type = "agent" } = body;

      if (!name) {
        return json({ error: "Name is required" }, 400);
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      let basePath: string;
      if (type === "skill") {
        basePath = CLAUDE_GLOBAL_SKILLS;
      } else {
        basePath = NAVI_GLOBAL_AGENTS;
      }

      const agentPath = join(basePath, slug);

      if (existsSync(agentPath)) {
        return json({ error: `${type === "skill" ? "Skill" : "Agent"} "${slug}" already exists` }, 400);
      }

      // Create directory structure
      mkdirSync(agentPath, { recursive: true });

      if (type === "skill") {
        // Create SKILL.md
        const skillContent = serializeFrontmatter(
          { name, description: description || "" },
          `# ${name}\n\n## When to Use\n\nDescribe when this skill should be used.\n\n## Instructions\n\nYour instructions here.`
        );
        writeFileSync(join(agentPath, "SKILL.md"), skillContent);
      } else {
        // Create agent.md
        const agentContent = serializeFrontmatter(
          { name, description: description || "", tools: ["Read", "Write", "Bash"] },
          `# ${name}\n\nYour agent instructions here.\n\n## Guidelines\n\n- Be helpful\n- Follow best practices`
        );
        writeFileSync(join(agentPath, "agent.md"), agentContent);

        // Create schema.ts
        const schemaContent = `// Input and Output schemas for this agent

export interface Input {
  // Define your input parameters
  query: string;
}

export interface Output {
  // Define your output structure
  result: string;
}
`;
        writeFileSync(join(agentPath, "schema.ts"), schemaContent);

        // Create subdirectories
        mkdirSync(join(agentPath, "skills"), { recursive: true });
        mkdirSync(join(agentPath, "scripts"), { recursive: true });
        mkdirSync(join(agentPath, "sub-agents"), { recursive: true });
      }

      const result: AgentDefinition = {
        id: slug,
        name,
        type: type as "agent" | "skill",
        path: agentPath,
        description,
        hasSchema: type === "agent",
        skillCount: 0,
        scriptCount: 0,
      };

      return json(result, 201);
    } catch (e: any) {
      return json({ error: e.message || "Failed to create agent" }, 500);
    }
  }

  // DELETE /api/agent-builder/agents/:id - Delete agent
  const deleteMatch = url.pathname.match(/^\/api\/agent-builder\/agents\/([^/]+)$/);
  if (deleteMatch && method === "DELETE") {
    const agentId = decodeURIComponent(deleteMatch[1]);
    const type = url.searchParams.get("type") || "agent";

    let basePath: string;
    if (type === "skill") {
      basePath = CLAUDE_GLOBAL_SKILLS;
    } else {
      basePath = NAVI_GLOBAL_AGENTS;
    }

    const agentPath = join(basePath, agentId);

    if (!existsSync(agentPath)) {
      return json({ error: "Not found" }, 404);
    }

    try {
      rmSync(agentPath, { recursive: true, force: true });
      return json({ success: true });
    } catch (e: any) {
      return json({ error: e.message || "Failed to delete" }, 500);
    }
  }

  // POST /api/agent-builder/agents/:id/skill - Add skill to agent
  const addSkillMatch = url.pathname.match(/^\/api\/agent-builder\/agents\/([^/]+)\/skill$/);
  if (addSkillMatch && method === "POST") {
    const agentId = decodeURIComponent(addSkillMatch[1]);
    const agentPath = join(NAVI_GLOBAL_AGENTS, agentId);

    if (!existsSync(agentPath)) {
      return json({ error: "Agent not found" }, 404);
    }

    try {
      const body = await req.json();
      const { name } = body;

      if (!name) {
        return json({ error: "Name is required" }, 400);
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const skillPath = join(agentPath, "skills", `${slug}.md`);

      if (existsSync(skillPath)) {
        return json({ error: `Skill "${slug}" already exists` }, 400);
      }

      const skillContent = `# ${name}\n\n## When to Use\n\nDescribe when this skill should be used.\n\n## Instructions\n\nYour instructions here.`;

      // Ensure skills directory exists
      mkdirSync(join(agentPath, "skills"), { recursive: true });
      writeFileSync(skillPath, skillContent);

      return json({ path: skillPath, name }, 201);
    } catch (e: any) {
      return json({ error: e.message || "Failed to add skill" }, 500);
    }
  }

  // POST /api/agent-builder/agents/:id/script - Add script to agent
  const addScriptMatch = url.pathname.match(/^\/api\/agent-builder\/agents\/([^/]+)\/script$/);
  if (addScriptMatch && method === "POST") {
    const agentId = decodeURIComponent(addScriptMatch[1]);
    const agentPath = join(NAVI_GLOBAL_AGENTS, agentId);

    if (!existsSync(agentPath)) {
      return json({ error: "Agent not found" }, 404);
    }

    try {
      const body = await req.json();
      const { name, language = "typescript" } = body;

      if (!name) {
        return json({ error: "Name is required" }, 400);
      }

      const ext = language === "python" ? "py" : language === "shell" ? "sh" : "ts";
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const scriptPath = join(agentPath, "scripts", `${slug}.${ext}`);

      if (existsSync(scriptPath)) {
        return json({ error: `Script "${slug}.${ext}" already exists` }, 400);
      }

      let scriptContent: string;
      if (language === "python") {
        scriptContent = `#!/usr/bin/env python3
# Script: ${name}

import json
import sys

def main():
    input_data = json.loads(sys.stdin.read())
    # Your logic here
    result = {"success": True}
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
      } else if (language === "shell") {
        scriptContent = `#!/bin/bash
# Script: ${name}

echo "Running ${name}..."
`;
      } else {
        scriptContent = `// Script: ${name}

export async function run(input: unknown): Promise<unknown> {
  console.log("Running script with input:", input);

  // Your logic here

  return { success: true };
}
`;
      }

      // Ensure scripts directory exists
      mkdirSync(join(agentPath, "scripts"), { recursive: true });
      writeFileSync(scriptPath, scriptContent);

      return json({ path: scriptPath, name, language }, 201);
    } catch (e: any) {
      return json({ error: e.message || "Failed to add script" }, 500);
    }
  }

  return null;
}
