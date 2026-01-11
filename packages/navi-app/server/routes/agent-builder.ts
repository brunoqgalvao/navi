import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename, extname, relative } from "path";
import { homedir } from "os";
import { json } from "../utils/response";
import { projects } from "../db";

// Agent builder paths - UNIFIED with agent loader
// Agents now go to .claude/agents/ for consistency with the agent resolution system
const GLOBAL_AGENTS_DIR = join(homedir(), ".claude", "agents");
const GLOBAL_SKILLS_DIR = join(homedir(), ".claude", "skills");

// Legacy path for backwards compatibility (read-only)
const LEGACY_NAVI_AGENTS = join(homedir(), ".navi", "agents");

function getProjectAgentsDir(projectPath: string): string {
  return join(projectPath, ".claude", "agents");
}

function getProjectSkillsDir(projectPath: string): string {
  return join(projectPath, ".claude", "skills");
}

// Alias for backwards compatibility
const NAVI_GLOBAL_AGENTS = GLOBAL_AGENTS_DIR;
const CLAUDE_GLOBAL_SKILLS = GLOBAL_SKILLS_DIR;

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

// Serialize frontmatter - supports both formats:
// simple: true = aitmpl.com format (tools as comma string)
// simple: false = YAML array format
function serializeFrontmatter(frontmatter: AgentFrontmatter, body: string, simple: boolean = false): string {
  const lines: string[] = ["---"];

  if (frontmatter.name) lines.push(`name: ${frontmatter.name}`);
  if (frontmatter.description) lines.push(`description: ${frontmatter.description}`);

  // For simple format (aitmpl.com), tools as comma-separated string
  if (frontmatter.tools && frontmatter.tools.length > 0) {
    if (simple) {
      lines.push(`tools: ${frontmatter.tools.join(", ")}`);
    } else {
      lines.push("tools:");
      for (const tool of frontmatter.tools) {
        lines.push(`  - ${tool}`);
      }
    }
  }

  if (frontmatter.model) lines.push(`model: ${frontmatter.model}`);

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

// Scan for agents (supports both formats):
// 1. Simple: frontend-developer.md (single file, aitmpl.com format)
// 2. Complex: blog-automation/agent.md (folder with agent.md + skills/scripts)
function scanAgentFolders(dir: string): AgentDefinition[] {
  const agents: AgentDefinition[] = [];
  if (!existsSync(dir)) return agents;

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      // Format 1: Simple .md file (aitmpl.com format)
      if (stat.isFile() && entry.endsWith(".md")) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const { frontmatter, body } = parseFrontmatter(content);

          const id = entry.replace(".md", "");
          agents.push({
            id,
            name: frontmatter.name || id,
            type: "agent",
            path: fullPath,
            description: frontmatter.description,
            prompt: body,
            tools: frontmatter.tools,
            model: frontmatter.model,
            hasSchema: false,
            skillCount: 0,
            scriptCount: 0,
          });
        } catch (e) {
          console.error(`Failed to parse simple agent ${entry}:`, e);
        }
        continue;
      }

      // Format 2: Folder with agent.md
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
        console.error(`Failed to parse folder agent ${entry}:`, e);
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
  // format: "simple" (single .md file, aitmpl.com style) or "complex" (folder with agent.md + subdirs)
  if (url.pathname === "/api/agent-builder/agents" && method === "POST") {
    try {
      const body = await req.json();
      const { name, description, type = "agent", format = "simple", model = "sonnet", tools = ["Read", "Write", "Bash"] } = body;

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

      // Ensure base directory exists
      if (!existsSync(basePath)) {
        mkdirSync(basePath, { recursive: true });
      }

      // For simple format: create single .md file
      // For complex format: create folder structure
      const isSimple = format === "simple" && type === "agent";
      const agentPath = isSimple ? join(basePath, `${slug}.md`) : join(basePath, slug);

      if (existsSync(agentPath)) {
        return json({ error: `${type === "skill" ? "Skill" : "Agent"} "${slug}" already exists` }, 400);
      }

      if (type === "skill") {
        // Skills always use folder format with SKILL.md
        mkdirSync(agentPath, { recursive: true });
        const skillContent = serializeFrontmatter(
          { name, description: description || "" },
          `# ${name}\n\n## When to Use\n\nDescribe when this skill should be used.\n\n## Instructions\n\nYour instructions here.`
        );
        writeFileSync(join(agentPath, "SKILL.md"), skillContent);
      } else if (isSimple) {
        // Simple agent: single .md file (aitmpl.com format)
        const agentContent = serializeFrontmatter(
          { name, description: description || "", tools, model },
          `You are a ${name.toLowerCase()}.\n\n## Focus Areas\n\n- Area 1\n- Area 2\n\n## Approach\n\n1. Step one\n2. Step two\n\n## Output\n\n- Expected output format\n\nFocus on working code over explanations.`,
          true // simple format
        );
        writeFileSync(agentPath, agentContent);
      } else {
        // Complex agent: folder with agent.yaml + prompt.md + navi.yaml
        mkdirSync(agentPath, { recursive: true });

        // agent.yaml - SDK-compatible core configuration
        const agentYaml = `# ${name} - Agent Configuration
# SDK-compatible fields (works with Claude Agent SDK)

name: ${slug}
description: "${description || `A ${name.toLowerCase()} agent`}"

# System prompt - loaded from prompt.md
prompt: file:prompt.md

# Model preference
model: ${model}

# Tool permissions
tools:
  allowed:
${tools.map((t: string) => `    - ${t}`).join("\n")}

# SDK Subagents - spawned via Task tool within this agent's session
# subagents:
#   researcher:
#     description: "Research specialist"
#     prompt: "You are a research specialist..."
#     tools: [WebSearch, WebFetch, Read]
#     model: haiku
`;
        writeFileSync(join(agentPath, "agent.yaml"), agentYaml);

        // prompt.md - System prompt
        const promptContent = `# ${name}

You are a ${name.toLowerCase()} agent.

## Your Capabilities

- Capability 1
- Capability 2

## Guidelines

- Be helpful
- Follow best practices
- Be thorough but concise

## Output Format

Describe how you structure your responses.
`;
        writeFileSync(join(agentPath, "prompt.md"), promptContent);

        // navi.yaml - Navi-specific extensions
        const naviYaml = `# Navi Extensions for ${name}
# These fields extend the agent with Navi-specific features

# UI Configuration
ui:
  icon: "🤖"
  color: gray
  nativeUI: false

# Skills to load
# skills:
#   - global:playwright
#   - project:my-skill

# Required integrations
# integrations:
#   required:
#     - name: github
#       reason: "Needs GitHub access"

# Setup script (runs on first use)
# setup:
#   script: file:scripts/setup.sh

# Metadata
meta:
  version: "1.0.0"
  tags:
    - ${slug}
`;
        writeFileSync(join(agentPath, "navi.yaml"), naviYaml);

        // Create subdirectories
        mkdirSync(join(agentPath, "skills"), { recursive: true });
        mkdirSync(join(agentPath, "scripts"), { recursive: true });
      }

      const result: AgentDefinition = {
        id: slug,
        name,
        type: type as "agent" | "skill",
        path: agentPath,
        description,
        tools,
        model,
        hasSchema: !isSimple && type === "agent",
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

  // POST /api/agent-builder/run - Execute an agent with input
  if (url.pathname === "/api/agent-builder/run" && method === "POST") {
    try {
      const body = await req.json();
      const { agentPath, input, model = "sonnet" } = body;

      if (!agentPath) {
        return json({ error: "agentPath is required" }, 400);
      }

      // Read the agent file
      let agentContent: string;
      let isSimpleAgent = false;

      if (agentPath.endsWith(".md")) {
        // Simple agent (single file)
        if (!existsSync(agentPath)) {
          return json({ error: "Agent file not found" }, 404);
        }
        agentContent = readFileSync(agentPath, "utf-8");
        isSimpleAgent = true;
      } else {
        // Complex agent (folder with agent.md)
        const agentMdPath = join(agentPath, "agent.md");
        if (!existsSync(agentMdPath)) {
          return json({ error: "agent.md not found in agent folder" }, 404);
        }
        agentContent = readFileSync(agentMdPath, "utf-8");
      }

      // Parse frontmatter to get tools and model
      const { frontmatter, body: promptBody } = parseFrontmatter(agentContent);

      // Build the full prompt with input context
      const fullPrompt = `${promptBody}

---

## Input

\`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`

Process the above input according to your instructions and provide the output.`;

      // Return the prepared execution context
      // The actual execution happens via WebSocket in the main chat system
      // This endpoint prepares the agent for execution
      return json({
        prepared: true,
        agentName: frontmatter?.name || "Agent",
        model: frontmatter?.model || model,
        tools: frontmatter?.tools || ["Read", "Write", "Bash"],
        prompt: fullPrompt,
        originalPrompt: promptBody,
        input,
      });
    } catch (e: any) {
      return json({ error: e.message || "Failed to prepare agent" }, 500);
    }
  }

  return null;
}
