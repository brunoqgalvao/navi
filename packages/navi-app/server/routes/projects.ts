import { query } from "@anthropic-ai/claude-agent-sdk";
import { json } from "../utils/response";
import { projects, sessions, searchIndex } from "../db";
import { buildClaudeCodeEnv, getClaudeCodeRuntimeOptions } from "../utils/claude-code";
import { resolveNaviClaudeAuth } from "../utils/navi-auth";

export async function handleProjectRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  if (url.pathname === "/api/projects") {
    if (method === "GET") {
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      return json(projects.list(includeArchived));
    }
    if (method === "POST") {
      const body = await req.json();
      const fs = await import("fs/promises");
      try {
        const stat = await fs.stat(body.path);
        if (!stat.isDirectory()) {
          return json({ error: "Path is not a directory" }, 400);
        }
      } catch {
        return json({ error: "Directory does not exist" }, 400);
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      projects.create(id, body.name, body.path, body.description || null, now, now);
      searchIndex.indexProject(id);
      return json(projects.get(id), 201);
    }
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const id = projectMatch[1];
    if (method === "GET") {
      const project = projects.get(id);
      return project ? json(project) : json({ error: "Not found" }, 404);
    }
    if (method === "PUT") {
      const body = await req.json();
      const fs = await import("fs/promises");
      try {
        const stat = await fs.stat(body.path);
        if (!stat.isDirectory()) {
          return json({ error: "Path is not a directory" }, 400);
        }
      } catch {
        return json({ error: "Directory does not exist" }, 400);
      }
      projects.update(body.name, body.path, body.description || null, body.context_window || 200000, Date.now(), id);
      searchIndex.indexProject(id);
      return json(projects.get(id));
    }
    if (method === "DELETE") {
      searchIndex.removeProject(id);
      projects.delete(id);
      return json({ success: true });
    }
  }

  const projectPinMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/pin$/);
  if (projectPinMatch && method === "POST") {
    const id = projectPinMatch[1];
    const body = await req.json();
    projects.togglePin(id, body.pinned);
    return json(projects.get(id));
  }

  const projectAutoAcceptMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/auto-accept$/);
  if (projectAutoAcceptMatch && method === "POST") {
    const id = projectAutoAcceptMatch[1];
    const body = await req.json();
    projects.setAutoAcceptAll(id, body.autoAcceptAll);
    return json(projects.get(id));
  }

  const projectArchiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (projectArchiveMatch && method === "POST") {
    const id = projectArchiveMatch[1];
    const body = await req.json();
    projects.setArchived(id, body.archived);
    sessions.setArchivedByProject(id, body.archived);
    return json(projects.get(id));
  }

  const projectsReorderMatch = url.pathname === "/api/projects/reorder";
  if (projectsReorderMatch && method === "POST") {
    const body = await req.json();
    for (let i = 0; i < body.order.length; i++) {
      projects.updateOrder(body.order[i], i);
    }
    return json({ success: true });
  }

  const projectFolderMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/folder$/);
  if (projectFolderMatch && method === "POST") {
    const id = projectFolderMatch[1];
    const body = await req.json();
    projects.setFolder(id, body.folderId);
    return json(projects.get(id));
  }

  const summaryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/summary$/);
  if (summaryMatch) {
    const projectId = summaryMatch[1];
    const project = projects.get(projectId);

    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    if (method === "GET") {
      return json({
        summary: project.summary || null,
        summaryUpdatedAt: project.summary_updated_at || null,
      });
    }

    if (method === "POST") {
      try {
        const prompt = `Analyze this project directory and provide a brief summary (2-3 sentences) of what this project is about, its main technologies, and current state. Be concise.`;

        const q = query({
          prompt,
          options: {
            cwd: project.path,
            allowedTools: ["Read", "Glob", "Grep"],
            maxTurns: 3,
            settingSources: ['project'],
            env: buildClaudeCodeEnv(process.env, resolveNaviClaudeAuth().overrides),
            ...getClaudeCodeRuntimeOptions(),
          },
        });

        let summary = "";
        for await (const msg of q) {
          if (msg.type === "assistant") {
            const textBlock = msg.message.content.find((b: any) => b.type === "text");
            if (textBlock) {
              summary = textBlock.text;
            }
          }
        }

        if (summary) {
          projects.updateSummary(projectId, summary, Date.now());
        }

        return json({ summary, summaryUpdatedAt: Date.now() });
      } catch (e) {
        console.error("Failed to generate project summary:", e);
        return json({ error: "Failed to generate summary" }, 500);
      }
    }
  }

  return null;
}
