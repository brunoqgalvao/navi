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
  format?: "simple" | "bundle";
  soul?: string | null;
  memory?: string | null;
}

function toAgentResponse(
  scope: "global" | "project",
  slug: string,
  bundle: AgentBundle,
  projectId?: string
): Agent {
  const path = bundle.path ||
    (scope === "global"
      ? join(CLAUDE_GLOBAL_AGENTS, `${slug}.md`)
      : join(process.cwd(), ".claude", "agents", `${slug}.md`))

  let soul: string | null = null
  let memory: string | null = null
  let format: "simple" | "bundle" = path.endsWith(".md") ? "simple" : "bundle"
  let body = bundle.prompt

  if (existsSync(path) && statSync(path).isDirectory()) {
    const promptPath = join(path, "prompt.md")
    const soulPath = join(path, "soul.md")
    const memoryPath = join(path, "memory.md")
    body = existsSync(promptPath) ? readFileSync(promptPath, "utf-8") : bundle.prompt
    soul = existsSync(soulPath) ? readFileSync(soulPath, "utf-8") : null
    memory = existsSync(memoryPath) ? readFileSync(memoryPath, "utf-8") : null
    format = "bundle"
  }

  return {
    id: `${scope}:${projectId || "global"}:${slug}`,
    slug,
    name: bundle.name,
    description: bundle.description,
    model: bundle.model,
    tools: bundle.tools?.allowed,
    body,
    scope,
    projectId,
    path,
    format,
    soul,
    memory,
  }
}

function serializeBundleAgentYaml(input: {
  slug: string;
  description: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
}): string {
  const lines = [
    `name: ${input.slug}`,
    `description: ${input.description || ""}`,
    "prompt: file:prompt.md",
  ]

  if (input.model) {
    lines.push(`model: ${input.model}`)
  }

  if (input.tools && input.tools.length > 0) {
    lines.push("tools:")
    lines.push("  allowed:")
    for (const tool of input.tools) {
      lines.push(`    - ${tool}`)
    }
  }

  return `${lines.join("\n")}\n`
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
        if (bundle.source === "builtin") {
          agents.push({
            id: `global:global:${id}`,
            slug: id,
            name: bundle.name,
            description: bundle.description,
            model: bundle.model,
            tools: bundle.tools?.allowed,
            body: bundle.prompt,
            scope: "global",
            path: `builtin:${id}`,
            format: "simple",
          });
          continue;
        }

        agents.push(
          toAgentResponse(
            bundle.source === "project" ? "project" : "global",
            id,
            bundle,
            bundle.source === "project"
              ? projects.list().find((project) => bundle.path?.startsWith(join(project.path, ".claude", "agents")) )?.id
              : undefined
          )
        );
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
    const bundleDir = join(agentsDir, slug);
    if (!existsSync(filePath) && !(existsSync(bundleDir) && statSync(bundleDir).isDirectory())) {
      return json({ error: "Agent not found" }, 404);
    }

    if (existsSync(bundleDir) && statSync(bundleDir).isDirectory()) {
      const projectPath = scope === "project" ? projects.get(scopeId!)?.path || process.cwd() : process.cwd()
      const bundle = await agentLoader.loadAgent(slug, projectPath)
      if (!bundle) return json({ error: "Agent not found" }, 404)
      return json(toAgentResponse(scope as "global" | "project", slug, bundle, scope === "project" ? scopeId : undefined))
    }

    const content = readFileSync(filePath, "utf-8");
    const parsed = parseAgentMd(content);
    return json({
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
      format: "simple",
    } satisfies Agent);
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
    const bundleDir = join(agentsDir, slug);
    if (!existsSync(filePath) && !(existsSync(bundleDir) && statSync(bundleDir).isDirectory())) {
      return json({ error: "Agent not found" }, 404);
    }

    try {
      const body = await req.json();
      const { name, description, model, tools, instructions, soul, memory, format } = body;
      const nextName = name || slug;
      const nextDescription = description || "";

      if (existsSync(bundleDir) && statSync(bundleDir).isDirectory()) {
        if (format === "simple") {
          const content = serializeAgentMd({
            frontmatter: {
              name: nextName,
              description: nextDescription,
              model,
              tools,
            },
            body: instructions || "",
          });

          writeFileSync(filePath, content);
          rmSync(bundleDir, { recursive: true, force: true });
          agentLoader.clearCache();

          const agent: Agent = {
            id,
            slug,
            name: nextName,
            description: nextDescription,
            model,
            tools,
            body: instructions || "",
            scope: scope as "global" | "project",
            projectId: scope === "project" ? scopeId : undefined,
            path: filePath,
            format: "simple",
          };

          return json(agent);
        }

        const agentYamlPath = join(bundleDir, "agent.yaml");
        const promptPath = join(bundleDir, "prompt.md");
        const soulPath = join(bundleDir, "soul.md");
        const memoryPath = join(bundleDir, "memory.md");

        const existingBundle = await agentLoader.loadAgent(
          slug,
          scope === "project" && scopeId ? projects.get(scopeId)?.path || process.cwd() : process.cwd()
        );
        if (!existingBundle) {
          return json({ error: "Agent not found" }, 404);
        }

        writeFileSync(
          agentYamlPath,
          serializeBundleAgentYaml({
            slug,
            description: description ?? existingBundle.description,
            model: model ?? existingBundle.model,
            tools: tools ?? existingBundle.tools?.allowed,
          })
        );
        writeFileSync(promptPath, instructions ?? readFileSync(promptPath, "utf-8"));
        if (soul !== undefined) writeFileSync(soulPath, soul || "");
        if (memory !== undefined) writeFileSync(memoryPath, memory || "");

        agentLoader.clearCache();
        const updatedBundle = await agentLoader.loadAgent(
          slug,
          scope === "project" && scopeId ? projects.get(scopeId)?.path || process.cwd() : process.cwd()
        );
        if (!updatedBundle) return json({ error: "Failed to reload agent" }, 500);
        return json(
          toAgentResponse(
            scope as "global" | "project",
            slug,
            updatedBundle,
            scope === "project" ? scopeId : undefined
          )
        );
      }

      if (format === "bundle") {
        mkdirSync(bundleDir, { recursive: true });
        writeFileSync(
          join(bundleDir, "agent.yaml"),
          serializeBundleAgentYaml({
            slug,
            description: nextDescription,
            model,
            tools,
          })
        );
        writeFileSync(join(bundleDir, "prompt.md"), instructions || "");
        writeFileSync(join(bundleDir, "soul.md"), soul || "");
        writeFileSync(join(bundleDir, "memory.md"), memory || "");
        if (existsSync(filePath)) {
          rmSync(filePath, { force: true });
        }

        agentLoader.clearCache();
        const updatedBundle = await agentLoader.loadAgent(
          slug,
          scope === "project" && scopeId ? projects.get(scopeId)?.path || process.cwd() : process.cwd()
        );
        if (!updatedBundle) return json({ error: "Failed to reload agent" }, 500);
        return json(
          toAgentResponse(
            scope as "global" | "project",
            slug,
            updatedBundle,
            scope === "project" ? scopeId : undefined
          )
        );
      }

      const content = serializeAgentMd({
        frontmatter: {
          name: nextName,
          description: nextDescription,
          model,
          tools,
        },
        body: instructions || "",
      });

      writeFileSync(filePath, content);
      agentLoader.clearCache();

      const agent: Agent = {
        id,
        slug,
        name: nextName,
        description: nextDescription,
        model,
        tools,
        body: instructions || "",
        scope: scope as "global" | "project",
        projectId: scope === "project" ? scopeId : undefined,
        path: filePath,
        format: "simple",
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
    const bundleDir = join(agentsDir, slug);
    if (!existsSync(filePath) && !(existsSync(bundleDir) && statSync(bundleDir).isDirectory())) {
      return json({ error: "Agent not found" }, 404);
    }

    try {
      if (existsSync(bundleDir) && statSync(bundleDir).isDirectory()) {
        rmSync(bundleDir, { recursive: true, force: true });
      } else {
        rmSync(filePath);
      }
      agentLoader.clearCache();
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
    const bundles = await agentLoader.loadAllAgents(project.path);
    const projectAgents: Agent[] = [];
    const globalAgents: Agent[] = [];

    for (const [slug, bundle] of bundles) {
      if (bundle.source === "builtin") continue;
      const response = toAgentResponse(
        bundle.source === "project" ? "project" : "global",
        slug,
        bundle,
        bundle.source === "project" ? projectId : undefined
      );
      if (bundle.source === "project") {
        projectAgents.push(response);
      } else {
        globalAgents.push(response);
      }
    }

    return json([...projectAgents, ...globalAgents]);
  }

  // POST /api/projects/:projectId/agents - Create project agent
  if (projectAgentsMatch && method === "POST") {
    const projectId = projectAgentsMatch[1];
    const project = projects.get(projectId);

    if (!project) return json({ error: "Project not found" }, 404);

    try {
      const body = await req.json();
      const { name, description, model, tools, instructions, soul, memory, format } = body;

      if (!name) {
        return json({ error: "Name is required" }, 400);
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const agentsDir = getProjectAgentsDir(project.path);
      const filePath = join(agentsDir, `${slug}.md`);
      const bundleDir = join(agentsDir, slug);

      if (existsSync(filePath) || existsSync(bundleDir)) {
        return json({ error: `Agent "${slug}" already exists in this project` }, 400);
      }

      if (!existsSync(agentsDir)) {
        mkdirSync(agentsDir, { recursive: true });
      }

      if (format === "bundle" || soul !== undefined || memory !== undefined) {
        mkdirSync(bundleDir, { recursive: true });
        writeFileSync(
          join(bundleDir, "agent.yaml"),
          serializeBundleAgentYaml({
            slug,
            description: description || "",
            model,
            tools,
          })
        );
        writeFileSync(join(bundleDir, "prompt.md"), instructions || "");
        writeFileSync(join(bundleDir, "soul.md"), soul || "");
        writeFileSync(join(bundleDir, "memory.md"), memory || "");
        agentLoader.clearCache();

        const bundle = await agentLoader.loadAgent(slug, project.path);
        if (!bundle) {
          return json({ error: "Failed to create bundle agent" }, 500);
        }
        return json(toAgentResponse("project", slug, bundle, projectId), 201);
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
      agentLoader.clearCache();

      return json({
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
        format: "simple",
      } satisfies Agent, 201);
    } catch (e: any) {
      return json({ error: e.message || "Failed to create agent" }, 400);
    }
  }

  return null;
}
