import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { json } from "../utils/response";
import { projects } from "../db";
import { agentLoader, type AgentBundle } from "../services/agent-loader";

// Anthropic standard paths for agents
const CLAUDE_GLOBAL_AGENTS = join(homedir(), ".claude", "agents");

function getProjectAgentsDir(projectPath: string): string {
  return join(projectPath, ".claude", "agents");
}

// Parse agent markdown file (Anthropic format)
interface AgentFrontmatter {
  name?: string;
  description?: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
}

interface ParsedAgent {
  frontmatter: AgentFrontmatter;
  body: string;
}

function parseAgentMd(content: string): ParsedAgent {
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

      // Simple YAML parsing for frontmatter
      let currentKey = "";
      let inArray = false;
      const arrayValues: string[] = [];

      for (const line of yamlLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if it's an array item
        if (trimmed.startsWith("- ") && inArray) {
          arrayValues.push(trimmed.slice(2).trim());
          continue;
        }

        // Finish previous array if any
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
            // Could be array or multiline, check next line
            inArray = true;
          } else {
            // Direct value
            (frontmatter as any)[key] = value.replace(/^["']|["']$/g, "");
          }
        }
      }

      // Handle trailing array
      if (inArray && currentKey && arrayValues.length > 0) {
        (frontmatter as any)[currentKey] = [...arrayValues];
      }
    }
  }

  return { frontmatter, body };
}

function serializeAgentMd(parsed: ParsedAgent): string {
  const lines: string[] = ["---"];

  if (parsed.frontmatter.name) lines.push(`name: ${parsed.frontmatter.name}`);
  if (parsed.frontmatter.description) lines.push(`description: ${parsed.frontmatter.description}`);
  if (parsed.frontmatter.model) lines.push(`model: ${parsed.frontmatter.model}`);
  if (parsed.frontmatter.tools && parsed.frontmatter.tools.length > 0) {
    lines.push("tools:");
    for (const tool of parsed.frontmatter.tools) {
      lines.push(`  - ${tool}`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(parsed.body);

  return lines.join("\n");
}

export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
  body: string;
  scope: "global" | "project";
  projectId?: string;
  path: string;
}

function scanAgentDirectory(dir: string, scope: "global" | "project", projectId?: string): Agent[] {
  const agents: Agent[] = [];

  if (!existsSync(dir)) return agents;

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (!stat.isFile()) continue;

      try {
        const content = readFileSync(filePath, "utf-8");
        const parsed = parseAgentMd(content);
        const slug = basename(file, ".md");

        agents.push({
          id: `${scope}:${projectId || "global"}:${slug}`,
          slug,
          name: parsed.frontmatter.name || slug,
          description: parsed.frontmatter.description || "",
          model: parsed.frontmatter.model,
          tools: parsed.frontmatter.tools,
          body: parsed.body,
          scope,
          projectId,
          path: filePath,
        });
      } catch (e) {
        console.error(`Failed to parse agent ${file}:`, e);
      }
    }
  } catch (e) {
    console.error(`Failed to scan agents in ${dir}:`, e);
  }

  return agents;
}

export async function handleAgentRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  // GET /api/agents - List all agents (builtin + global + project if projectPath provided)
  if (url.pathname === "/api/agents" && method === "GET") {
    const projectPath = url.searchParams.get("projectPath") || process.cwd();

    try {
      // Use the unified agent loader to get all agents
      const agentBundles = await agentLoader.loadAllAgents(projectPath);

      // Convert AgentBundle to the frontend Agent format
      const agents: Agent[] = [];
      for (const [id, bundle] of agentBundles) {
        agents.push({
          id: `${bundle.source}:${id}`,
          slug: id,
          name: bundle.name,
          description: bundle.description,
          model: bundle.model,
          tools: bundle.tools?.allowed,
          body: bundle.prompt,
          scope: bundle.source === "project" ? "project" : "global",
          path: bundle.source === "builtin"
            ? `builtin:${id}`
            : bundle.source === "global"
              ? join(CLAUDE_GLOBAL_AGENTS, `${id}.md`)
              : join(projectPath, ".claude", "agents", `${id}.md`),
        });
      }

      return json(agents);
    } catch (e) {
      console.error("Failed to load agents:", e);
      // Fallback to old behavior
      const globalAgents = scanAgentDirectory(CLAUDE_GLOBAL_AGENTS, "global");
      return json(globalAgents);
    }
  }

  // POST /api/agents - Create global agent
  if (url.pathname === "/api/agents" && method === "POST") {
    try {
      const body = await req.json();
      const { name, description, model, tools, instructions } = body;

      if (!name) {
        return json({ error: "Name is required" }, 400);
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const filePath = join(CLAUDE_GLOBAL_AGENTS, `${slug}.md`);

      if (existsSync(filePath)) {
        return json({ error: `Agent "${slug}" already exists` }, 400);
      }

      if (!existsSync(CLAUDE_GLOBAL_AGENTS)) {
        mkdirSync(CLAUDE_GLOBAL_AGENTS, { recursive: true });
      }

      const content = serializeAgentMd({
        frontmatter: {
          name,
          description: description || "",
          model,
          tools,
        },
        body: instructions || "",
      });

      writeFileSync(filePath, content);

      const agent: Agent = {
        id: `global:global:${slug}`,
        slug,
        name,
        description: description || "",
        model,
        tools,
        body: instructions || "",
        scope: "global",
        path: filePath,
      };

      return json(agent, 201);
    } catch (e: any) {
      return json({ error: e.message || "Failed to create agent" }, 400);
    }
  }

  // GET /api/agents/:id - Get agent by ID
  const agentMatch = url.pathname.match(/^\/api\/agents\/([^/]+)$/);
  if (agentMatch && method === "GET") {
    const id = decodeURIComponent(agentMatch[1]);
    const [scope, scopeId, slug] = id.split(":");

    let agentsDir: string;
    if (scope === "global") {
      agentsDir = CLAUDE_GLOBAL_AGENTS;
    } else if (scope === "project" && scopeId) {
      const project = projects.get(scopeId);
      if (!project) return json({ error: "Project not found" }, 404);
      agentsDir = getProjectAgentsDir(project.path);
    } else {
      return json({ error: "Invalid agent ID" }, 400);
    }

    const filePath = join(agentsDir, `${slug}.md`);
    if (!existsSync(filePath)) {
      return json({ error: "Agent not found" }, 404);
    }

    const content = readFileSync(filePath, "utf-8");
    const parsed = parseAgentMd(content);

    const agent: Agent = {
      id,
      slug,
      name: parsed.frontmatter.name || slug,
      description: parsed.frontmatter.description || "",
      model: parsed.frontmatter.model,
      tools: parsed.frontmatter.tools,
      body: parsed.body,
      scope: scope as "global" | "project",
      projectId: scope === "project" ? scopeId : undefined,
      path: filePath,
    };

    return json(agent);
  }

  // PUT /api/agents/:id - Update agent
  if (agentMatch && method === "PUT") {
    const id = decodeURIComponent(agentMatch[1]);
    const [scope, scopeId, slug] = id.split(":");

    let agentsDir: string;
    if (scope === "global") {
      agentsDir = CLAUDE_GLOBAL_AGENTS;
    } else if (scope === "project" && scopeId) {
      const project = projects.get(scopeId);
      if (!project) return json({ error: "Project not found" }, 404);
      agentsDir = getProjectAgentsDir(project.path);
    } else {
      return json({ error: "Invalid agent ID" }, 400);
    }

    const filePath = join(agentsDir, `${slug}.md`);
    if (!existsSync(filePath)) {
      return json({ error: "Agent not found" }, 404);
    }

    try {
      const body = await req.json();
      const { name, description, model, tools, instructions } = body;

      const content = serializeAgentMd({
        frontmatter: {
          name: name || slug,
          description: description || "",
          model,
          tools,
        },
        body: instructions || "",
      });

      writeFileSync(filePath, content);

      const agent: Agent = {
        id,
        slug,
        name: name || slug,
        description: description || "",
        model,
        tools,
        body: instructions || "",
        scope: scope as "global" | "project",
        projectId: scope === "project" ? scopeId : undefined,
        path: filePath,
      };

      return json(agent);
    } catch (e: any) {
      return json({ error: e.message || "Failed to update agent" }, 400);
    }
  }

  // DELETE /api/agents/:id - Delete agent
  if (agentMatch && method === "DELETE") {
    const id = decodeURIComponent(agentMatch[1]);
    const [scope, scopeId, slug] = id.split(":");

    let agentsDir: string;
    if (scope === "global") {
      agentsDir = CLAUDE_GLOBAL_AGENTS;
    } else if (scope === "project" && scopeId) {
      const project = projects.get(scopeId);
      if (!project) return json({ error: "Project not found" }, 404);
      agentsDir = getProjectAgentsDir(project.path);
    } else {
      return json({ error: "Invalid agent ID" }, 400);
    }

    const filePath = join(agentsDir, `${slug}.md`);
    if (!existsSync(filePath)) {
      return json({ error: "Agent not found" }, 404);
    }

    try {
      rmSync(filePath);
      return json({ success: true });
    } catch (e: any) {
      return json({ error: e.message || "Failed to delete agent" }, 500);
    }
  }

  // GET /api/projects/:projectId/agents - List project agents
  const projectAgentsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/agents$/);
  if (projectAgentsMatch && method === "GET") {
    const projectId = projectAgentsMatch[1];
    const project = projects.get(projectId);

    if (!project) return json({ error: "Project not found" }, 404);

    const projectAgents = scanAgentDirectory(getProjectAgentsDir(project.path), "project", projectId);
    const globalAgents = scanAgentDirectory(CLAUDE_GLOBAL_AGENTS, "global");

    // Return both, with project agents first
    return json([...projectAgents, ...globalAgents]);
  }

  // POST /api/projects/:projectId/agents - Create project agent
  if (projectAgentsMatch && method === "POST") {
    const projectId = projectAgentsMatch[1];
    const project = projects.get(projectId);

    if (!project) return json({ error: "Project not found" }, 404);

    try {
      const body = await req.json();
      const { name, description, model, tools, instructions } = body;

      if (!name) {
        return json({ error: "Name is required" }, 400);
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const agentsDir = getProjectAgentsDir(project.path);
      const filePath = join(agentsDir, `${slug}.md`);

      if (existsSync(filePath)) {
        return json({ error: `Agent "${slug}" already exists in this project` }, 400);
      }

      if (!existsSync(agentsDir)) {
        mkdirSync(agentsDir, { recursive: true });
      }

      const content = serializeAgentMd({
        frontmatter: {
          name,
          description: description || "",
          model,
          tools,
        },
        body: instructions || "",
      });

      writeFileSync(filePath, content);

      const agent: Agent = {
        id: `project:${projectId}:${slug}`,
        slug,
        name,
        description: description || "",
        model,
        tools,
        body: instructions || "",
        scope: "project",
        projectId,
        path: filePath,
      };

      return json(agent, 201);
    } catch (e: any) {
      return json({ error: e.message || "Failed to create agent" }, 400);
    }
  }

  return null;
}
