import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { initDb, projects, sessions, messages, type Project, type Session, type Message } from "./db";

await initDb();

const PORT = 3001;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

interface ClientMessage {
  type: "query" | "cancel";
  prompt?: string;
  projectId?: string;
  sessionId?: string;
  claudeSessionId?: string;
  allowedTools?: string[];
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    const method = req.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    if (url.pathname === "/health") {
      return json({ status: "ok" });
    }

    if (url.pathname === "/api/search") {
      if (method === "GET") {
        const q = url.searchParams.get("q") || "";
        const projectId = url.searchParams.get("projectId");
        if (projectId) {
          return json(sessions.search(projectId, q));
        }
        return json(sessions.searchAll(q));
      }
    }

    if (url.pathname === "/api/projects") {
      if (method === "GET") {
        return json(projects.list());
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
        projects.update(body.name, body.path, body.description || null, Date.now(), id);
        return json(projects.get(id));
      }
      if (method === "DELETE") {
        projects.delete(id);
        return json({ success: true });
      }
    }

    const sessionsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/sessions$/);
    if (sessionsMatch) {
      const projectId = sessionsMatch[1];
      if (method === "GET") {
        return json(sessions.listByProject(projectId));
      }
      if (method === "POST") {
        const body = await req.json();
        const id = crypto.randomUUID();
        const now = Date.now();
        sessions.create(id, projectId, body.title || "New conversation", now, now);
        return json(sessions.get(id), 201);
      }
    }

    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const id = sessionMatch[1];
      if (method === "GET") {
        const session = sessions.get(id);
        return session ? json(session) : json({ error: "Not found" }, 404);
      }
      if (method === "PATCH") {
        const body = await req.json();
        if (body.title) {
          sessions.updateTitle(body.title, Date.now(), id);
        }
        return json(sessions.get(id));
      }
      if (method === "DELETE") {
        sessions.delete(id);
        return json({ success: true });
      }
    }

    const forkMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/fork$/);
    if (forkMatch && method === "POST") {
      const sourceSessionId = forkMatch[1];
      const body = await req.json();
      const fromMessageId = body.fromMessageId;
      
      const sourceSession = sessions.get(sourceSessionId);
      if (!sourceSession) {
        return json({ error: "Session not found" }, 404);
      }

      const allMessages = messages.listBySession(sourceSessionId);
      
      let messagesToCopy: Message[] = [];
      if (fromMessageId) {
        const messageIndex = allMessages.findIndex(m => m.id === fromMessageId);
        if (messageIndex >= 0) {
          messagesToCopy = allMessages.slice(0, messageIndex + 1);
        }
      } else {
        messagesToCopy = allMessages;
      }

      const newSessionId = crypto.randomUUID();
      const now = Date.now();
      const title = body.title || `Fork of ${sourceSession.title}`;
      
      sessions.create(newSessionId, sourceSession.project_id, title, now, now);

      for (const msg of messagesToCopy) {
        messages.create(crypto.randomUUID(), newSessionId, msg.role, msg.content, msg.timestamp);
      }

      return json(sessions.get(newSessionId), 201);
    }

    const messagesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const sessionId = messagesMatch[1];
      if (method === "GET") {
        const msgs = messages.listBySession(sessionId);
        return json(msgs.map(m => ({ ...m, content: JSON.parse(m.content) })));
      }
    }

    const exportMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/export$/);
    if (exportMatch && method === "GET") {
      const sessionId = exportMatch[1];
      const session = sessions.get(sessionId);
      if (!session) {
        return json({ error: "Session not found" }, 404);
      }
      
      const project = projects.get(session.project_id);
      const msgs = messages.listBySession(sessionId);
      
      let markdown = `# ${session.title}\n\n`;
      markdown += `**Project:** ${project?.name || "Unknown"}\n`;
      markdown += `**Path:** ${project?.path || "Unknown"}\n`;
      markdown += `**Date:** ${new Date(session.created_at).toLocaleString()}\n`;
      markdown += `**Cost:** $${session.total_cost_usd.toFixed(4)}\n\n`;
      markdown += `---\n\n`;
      
      for (const msg of msgs) {
        const content = JSON.parse(msg.content);
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        markdown += `## ${role}\n\n`;
        
        if (typeof content === "string") {
          markdown += `${content}\n\n`;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              markdown += `${block.text}\n\n`;
            } else if (block.type === "tool_use") {
              markdown += `**Tool: ${block.name}**\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\`\n\n`;
            }
          }
        }
      }
      
      return new Response(markdown, {
        headers: {
          "Content-Type": "text/markdown",
          "Content-Disposition": `attachment; filename="${session.title.replace(/[^a-z0-9]/gi, "_")}.md"`,
          ...corsHeaders,
        },
      });
    }

    if (url.pathname === "/api/fs/read") {
      const filePath = url.searchParams.get("path");
      const raw = url.searchParams.get("raw") === "true";
      if (!filePath) {
        return json({ error: "Path required" }, 400);
      }
      try {
        const file = Bun.file(filePath);
        const exists = await file.exists();
        if (!exists) {
          return json({ error: "File not found" }, 404);
        }
        
        if (raw) {
          const ext = filePath.split(".").pop()?.toLowerCase() || "";
          const mimeTypes: Record<string, string> = {
            pdf: "application/pdf",
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
            svg: "image/svg+xml",
            ico: "image/x-icon",
            bmp: "image/bmp",
          };
          const contentType = mimeTypes[ext] || "application/octet-stream";
          return new Response(file, {
            headers: { "Content-Type": contentType, ...corsHeaders },
          });
        }
        
        const content = await file.text();
        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        return json({ content, path: filePath, extension: ext });
      } catch (e) {
        return json({ error: "Failed to read file" }, 500);
      }
    }

    if (url.pathname === "/api/fs/list") {
      const dirPath = url.searchParams.get("path") || process.cwd();
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        const entries = items
          .filter(item => !item.name.startsWith("."))
          .map(item => ({
            name: item.name,
            type: item.isDirectory() ? "directory" as const : "file" as const,
            path: path.join(dirPath, item.name),
          }))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        return json({ entries, path: dirPath });
      } catch (e) {
        return json({ error: "Failed to list directory" }, 500);
      }
    }

    if (url.pathname === "/api/fs/mkdir" && method === "POST") {
      const body = await req.json();
      const dirPath = body.path;
      if (!dirPath) {
        return json({ error: "Path required" }, 400);
      }
      try {
        const fs = await import("fs/promises");
        await fs.mkdir(dirPath, { recursive: true });
        return json({ success: true, path: dirPath });
      } catch (e) {
        return json({ error: "Failed to create directory" }, 500);
      }
    }

    if (url.pathname === "/api/config") {
      const { homedir } = await import("os");
      const { join } = await import("path");
      const defaultProjectsDir = join(homedir(), "claude-projects");
      return json({ defaultProjectsDir });
    }

    if (url.pathname === "/api/models") {
      try {
        const q = query({
          prompt: "",
          options: { cwd: process.cwd() },
        });
        const models = await q.supportedModels();
        await q.interrupt();
        return json(models);
      } catch (e) {
        return json({ error: "Failed to fetch models" }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },

  websocket: {
    open(ws) {
      console.log("Client connected");
      ws.send(JSON.stringify({ type: "connected" }));
    },

    async message(ws, message) {
      try {
        const data: ClientMessage = JSON.parse(message.toString());

        if (data.type === "query" && data.prompt) {
          await handleQuery(ws, data);
        }
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          })
        );
      }
    },

    close(ws) {
      console.log("Client disconnected");
    },
  },
});

async function handleQuery(ws: any, data: ClientMessage) {
  const { prompt, projectId, sessionId, claudeSessionId, allowedTools } = data;

  const session = sessionId ? sessions.get(sessionId) : null;
  const project = projectId ? projects.get(projectId) : null;
  const workingDirectory = project?.path || process.cwd();

  console.log(`Query: "${prompt}" in ${workingDirectory}`);

  if (sessionId && prompt) {
    const msgId = crypto.randomUUID();
    messages.create(msgId, sessionId, "user", JSON.stringify(prompt), Date.now());
    
    if (session?.title === "New conversation") {
      const title = prompt.slice(0, 50) + (prompt.length > 50 ? "..." : "");
      sessions.updateTitle(title, Date.now(), sessionId);
    }
  }

  try {
    const q = query({
      prompt: prompt!,
      options: {
        cwd: workingDirectory,
        resume: claudeSessionId || session?.claude_session_id || undefined,
        allowedTools: allowedTools || [
          "Read",
          "Write",
          "Edit",
          "Bash",
          "Glob",
          "Grep",
          "WebFetch",
          "WebSearch",
          "TodoWrite",
        ],
        permissionMode: "acceptEdits",
      },
    });

    let lastAssistantContent: any[] = [];
    let resultData: any = null;

    for await (const msg of q) {
      const formatted = formatMessage(msg);
      ws.send(JSON.stringify(formatted));

      if (msg.type === "assistant") {
        lastAssistantContent = msg.message.content;
      }
      if (msg.type === "result") {
        resultData = msg;
      }
    }

    if (sessionId && lastAssistantContent.length > 0) {
      const msgId = crypto.randomUUID();
      messages.create(msgId, sessionId, "assistant", JSON.stringify(lastAssistantContent), Date.now());
    }

    if (sessionId && resultData) {
      sessions.updateClaudeSession(
        resultData.session_id,
        resultData.model || null,
        resultData.total_cost_usd || 0,
        resultData.num_turns || 0,
        Date.now(),
        sessionId
      );
    }

    ws.send(JSON.stringify({ type: "done" }));
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : "Query failed",
      })
    );
  }
}

function formatMessage(msg: SDKMessage): any {
  switch (msg.type) {
    case "system":
      return {
        type: "system",
        sessionId: msg.session_id,
        subtype: msg.subtype,
        ...(msg.subtype === "init" && {
          cwd: (msg as any).cwd,
          model: (msg as any).model,
          tools: (msg as any).tools,
        }),
      };

    case "assistant":
      return {
        type: "assistant",
        sessionId: msg.session_id,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
      };

    case "user":
      return {
        type: "user",
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
      };

    case "result":
      return {
        type: "result",
        sessionId: msg.session_id,
        costUsd: msg.total_cost_usd,
        durationMs: msg.duration_ms,
        numTurns: msg.num_turns,
        usage: msg.usage,
      };

    case "tool_progress":
      return {
        type: "tool_progress",
        toolUseId: msg.tool_use_id,
        toolName: msg.tool_name,
        parentToolUseId: msg.parent_tool_use_id || null,
        elapsedTimeSeconds: msg.elapsed_time_seconds,
      };

    default:
      return { type: "unknown", raw: msg };
  }
}

console.log(`Claude Code UI Server running on http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
