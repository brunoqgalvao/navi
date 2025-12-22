import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { initDb, projects, sessions, messages, globalSettings, searchIndex, DEFAULT_TOOLS, DANGEROUS_TOOLS, type Project, type Session, type Message } from "./db";
import { spawn, type ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await initDb();

async function migrateEnvKeys() {
  const { homedir } = await import("os");
  const { join } = await import("path");
  const fs = await import("fs/promises");
  
  const envPath = join(homedir(), ".claude-code-ui", ".env");
  try {
    const content = await fs.readFile(envPath, "utf-8");
    
    const anthropicMatch = content.match(/ANTHROPIC_API_KEY=(.+)/);
    if (anthropicMatch && !globalSettings.get("anthropicApiKey")) {
      const key = anthropicMatch[1].trim();
      if (key.startsWith("sk-ant-")) {
        globalSettings.set("anthropicApiKey", key);
        globalSettings.set("preferredAuth", "api_key");
        console.log("Migrated ANTHROPIC_API_KEY from .env to database");
      }
    }
  } catch {}
}

await migrateEnvKeys();

const stats = searchIndex.getStats();
if (stats.total === 0) {
  console.log("Building search index...");
  searchIndex.reindexAll();
  console.log("Search index built:", searchIndex.getStats());
}

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
  type: "query" | "cancel" | "abort" | "permission_response";
  prompt?: string;
  projectId?: string;
  sessionId?: string;
  claudeSessionId?: string;
  allowedTools?: string[];
  model?: string;
  historyContext?: string;
  permissionRequestId?: string;
  approved?: boolean;
  approveAll?: boolean;
}

interface ActiveProcess {
  process: ChildProcess;
  ws: any;
  sessionId: string;
}

const activeProcesses = new Map<string, ActiveProcess>();
const pendingPermissions = new Map<string, { sessionId: string }>();
const sessionApprovedAll = new Set<string>();

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
        const projectId = url.searchParams.get("projectId") || undefined;
        const sessionId = url.searchParams.get("sessionId") || undefined;
        const limit = parseInt(url.searchParams.get("limit") || "50");
        
        if (!q.trim()) {
          return json([]);
        }
        
        const results = searchIndex.search(q, { projectId, sessionId, limit });
        return json(results);
      }
    }

    if (url.pathname === "/api/search/reindex" && method === "POST") {
      try {
        searchIndex.reindexAll();
        const stats = searchIndex.getStats();
        return json({ success: true, stats });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Reindex failed" }, 500);
      }
    }

    if (url.pathname === "/api/search/stats" && method === "GET") {
      return json(searchIndex.getStats());
    }

    if (url.pathname === "/api/search/debug" && method === "GET") {
      const entityType = url.searchParams.get("type") || undefined;
      return json({
        stats: searchIndex.getStats(),
        items: searchIndex.debugList(entityType),
      });
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

    const projectsReorderMatch = url.pathname === "/api/projects/reorder";
    if (projectsReorderMatch && method === "POST") {
      const body = await req.json();
      for (let i = 0; i < body.order.length; i++) {
        projects.updateOrder(body.order[i], i);
      }
      return json({ success: true });
    }

    if (url.pathname === "/api/sessions/recent" && method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "10");
      return json(sessions.listRecent(limit));
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
        searchIndex.indexSession(id);
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
          searchIndex.indexSession(id);
        }
        return json(sessions.get(id));
      }
      if (method === "DELETE") {
        searchIndex.removeSession(id);
        sessions.delete(id);
        return json({ success: true });
      }
    }

    const sessionPinMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/pin$/);
    if (sessionPinMatch && method === "POST") {
      const id = sessionPinMatch[1];
      const body = await req.json();
      sessions.togglePin(id, body.pinned);
      return json(sessions.get(id));
    }

    const sessionAutoAcceptMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/auto-accept$/);
    if (sessionAutoAcceptMatch && method === "POST") {
      const id = sessionAutoAcceptMatch[1];
      const body = await req.json();
      sessions.setAutoAcceptAll(id, body.autoAcceptAll);
      if (body.autoAcceptAll) {
        sessionApprovedAll.add(id);
      } else {
        sessionApprovedAll.delete(id);
      }
      return json(sessions.get(id));
    }

    const sessionsReorderMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/sessions\/reorder$/);
    if (sessionsReorderMatch && method === "POST") {
      const body = await req.json();
      for (let i = 0; i < body.order.length; i++) {
        sessions.updateOrder(body.order[i], i);
      }
      return json({ success: true });
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

      let newClaudeSessionId: string | null = null;
      if (sourceSession.claude_session_id) {
        try {
          const { homedir } = await import("os");
          const { join } = await import("path");
          const fs = await import("fs/promises");
          
          const project = projects.get(sourceSession.project_id);
          if (project) {
            const projectDirName = project.path.replace(/\//g, "-");
            const claudeProjectDir = join(homedir(), ".claude", "projects", projectDirName);
            const sourceFile = join(claudeProjectDir, `${sourceSession.claude_session_id}.jsonl`);
            
            try {
              const content = await fs.readFile(sourceFile, "utf-8");
              const lines = content.trim().split("\n");
              
              const forkMsg = messagesToCopy.length > 0 ? messagesToCopy[messagesToCopy.length - 1] : null;
              const forkTimestamp = forkMsg?.timestamp;
              
              let linesToKeep: string[] = [];
              let foundForkPoint = !forkTimestamp;
              
              for (const line of lines) {
                if (foundForkPoint) {
                  break;
                }
                try {
                  const entry = JSON.parse(line);
                  linesToKeep.push(line);
                  
                  if (forkTimestamp && entry.timestamp && entry.timestamp >= forkTimestamp) {
                    if (entry.type === "assistant") {
                      foundForkPoint = true;
                    }
                  }
                } catch {
                  linesToKeep.push(line);
                }
              }
              
              if (linesToKeep.length > 0) {
                newClaudeSessionId = newSessionId;
                const newSessionFile = join(claudeProjectDir, `${newClaudeSessionId}.jsonl`);
                
                const updatedLines = linesToKeep.map(line => {
                  try {
                    const entry = JSON.parse(line);
                    if (entry.sessionId === sourceSession.claude_session_id) {
                      entry.sessionId = newClaudeSessionId;
                    }
                    return JSON.stringify(entry);
                  } catch {
                    return line;
                  }
                });
                
                await fs.writeFile(newSessionFile, updatedLines.join("\n") + "\n");
                sessions.updateClaudeSession(newClaudeSessionId, sourceSession.model, 0, 0, 0, 0, now, newSessionId);
                console.log(`Forked Claude session: ${sourceSession.claude_session_id} -> ${newClaudeSessionId} (${linesToKeep.length} lines)`);
              }
            } catch (e) {
              console.error("Failed to copy Claude session file:", e);
            }
          }
        } catch (e) {
          console.error("Failed to fork Claude internal session:", e);
        }
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

    const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (messageMatch) {
      const messageId = messageMatch[1];
      if (method === "GET") {
        const msg = messages.get(messageId);
        if (!msg) return json({ error: "Message not found" }, 404);
        return json({ ...msg, content: JSON.parse(msg.content) });
      }
      if (method === "PUT") {
        try {
          const body = await req.json();
          const msg = messages.get(messageId);
          if (!msg) return json({ error: "Message not found - it may not be saved yet" }, 404);
          messages.update(messageId, JSON.stringify(body.content));
          
          const sess = sessions.get(msg.session_id);
          if (sess) {
            sessions.updateClaudeSession(null, sess.model, 0, 0, 0, 0, Date.now(), msg.session_id);
          }
          
          const allMsgs = messages.listBySession(msg.session_id);
          let historyContext = "";
          if (allMsgs.length > 0) {
            historyContext = "<conversation_history>\n";
            for (const m of allMsgs) {
              const content = JSON.parse(m.content);
              const text = typeof content === "string" ? content : 
                (Array.isArray(content) ? content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") : "");
              historyContext += `<${m.role}>${text}</${m.role}>\n`;
            }
            historyContext += "</conversation_history>\n\nContinue from this conversation context. The previous messages above are your conversation history.";
          }
          
          return json({ success: true, sessionReset: true, historyContext });
        } catch (e) {
          console.error("Failed to update message:", e);
          return json({ error: e instanceof Error ? e.message : "Update failed" }, 500);
        }
      }
      if (method === "DELETE") {
        messages.delete(messageId);
        return json({ success: true });
      }
    }

    const rollbackMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/rollback$/);
    if (rollbackMatch && method === "POST") {
      const sessionId = rollbackMatch[1];
      const body = await req.json();
      const messageId = body.messageId;
      
      const session = sessions.get(sessionId);
      if (!session) return json({ error: "Session not found" }, 404);
      
      const msg = messages.get(messageId);
      if (!msg) return json({ error: "Message not found" }, 404);
      
      messages.deleteAfter(sessionId, msg.timestamp);
      
      sessions.updateClaudeSession(
        null,
        session.model,
        0,
        0,
        0,
        0,
        Date.now(),
        sessionId
      );
      
      const remainingMsgs = messages.listBySession(sessionId);
      
      let historyContext = "";
      if (remainingMsgs.length > 0) {
        historyContext = "<conversation_history>\n";
        for (const m of remainingMsgs) {
          const content = JSON.parse(m.content);
          const text = typeof content === "string" ? content : 
            (Array.isArray(content) ? content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") : "");
          historyContext += `<${m.role}>${text}</${m.role}>\n`;
        }
        historyContext += "</conversation_history>\n\nContinue from this conversation context. The previous messages above are your conversation history.";
      }
      
      return json({ 
        success: true, 
        messages: remainingMsgs.map(m => ({ ...m, content: JSON.parse(m.content) })),
        sessionReset: true,
        historyContext 
      });
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
            mp3: "audio/mpeg",
            wav: "audio/wav",
            ogg: "audio/ogg",
            flac: "audio/flac",
            aac: "audio/aac",
            m4a: "audio/mp4",
            wma: "audio/x-ms-wma",
            mp4: "video/mp4",
            webm: "video/webm",
            mov: "video/quicktime",
            avi: "video/x-msvideo",
            mkv: "video/x-matroska",
            m4v: "video/mp4",
            ogv: "video/ogg",
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

    if (url.pathname === "/api/fs/reveal" && method === "POST") {
      const body = await req.json();
      const filePath = body.path;
      if (!filePath) {
        return json({ error: "Path required" }, 400);
      }
      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        const platform = process.platform;
        
        if (platform === "darwin") {
          await execAsync(`open -R "${filePath}"`);
        } else if (platform === "win32") {
          await execAsync(`explorer /select,"${filePath}"`);
        } else {
          await execAsync(`xdg-open "${filePath.split("/").slice(0, -1).join("/")}"`);
        }
        return json({ success: true });
      } catch (e) {
        return json({ error: "Failed to reveal file" }, 500);
      }
    }

    if (url.pathname === "/api/fs/upload" && method === "POST") {
      try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const targetDir = formData.get("targetDir") as string;
        
        if (!file || !targetDir) {
          return json({ error: "File and targetDir required" }, 400);
        }

        const fs = await import("fs/promises");
        const { join } = await import("path");
        
        const filePath = join(targetDir, file.name);
        const buffer = await file.arrayBuffer();
        await fs.writeFile(filePath, Buffer.from(buffer));
        
        return json({ success: true, path: filePath, name: file.name });
      } catch (e) {
        console.error("Upload error:", e);
        return json({ error: "Failed to upload file" }, 500);
      }
    }

    if (url.pathname === "/api/config") {
      const { homedir } = await import("os");
      const { join } = await import("path");
      const defaultProjectsDir = join(homedir(), "claude-projects");
      const isTestMode = process.env.DEV_ENV === "TEST";
      const openAIKey = isTestMode ? null : process.env.OPENAI_API_KEY;
      const hasOpenAIKey = !!openAIKey;
      const openAIKeyPreview = openAIKey ? `${openAIKey.slice(0, 7)}...${openAIKey.slice(-4)}` : null;
      const autoTitleEnabled = process.env.AUTO_TITLE !== "false";
      return json({ defaultProjectsDir, hasOpenAIKey, openAIKeyPreview, autoTitleEnabled });
    }

    if (url.pathname === "/api/permissions") {
      if (method === "GET") {
        return json({
          global: globalSettings.getPermissions(),
          defaults: { tools: DEFAULT_TOOLS, dangerous: DANGEROUS_TOOLS },
        });
      }
      if (method === "POST") {
        const body = await req.json();
        globalSettings.setPermissions(body);
        return json({ success: true });
      }
    }

    if (url.pathname === "/api/config/auto-title" && method === "POST") {
      const body = await req.json();
      const enabled = body.enabled;
      
      process.env.AUTO_TITLE = enabled ? "true" : "false";

      const { homedir } = await import("os");
      const { join } = await import("path");
      const fs = await import("fs/promises");
      
      const configDir = join(homedir(), ".claude-code-ui");
      await fs.mkdir(configDir, { recursive: true });
      
      const envPath = join(configDir, ".env");
      let envContent = "";
      try {
        envContent = await fs.readFile(envPath, "utf-8");
      } catch {}
      
      if (envContent.includes("AUTO_TITLE=")) {
        envContent = envContent.replace(/AUTO_TITLE=.*/g, `AUTO_TITLE=${enabled}`);
      } else {
        envContent += `AUTO_TITLE=${enabled}\n`;
      }
      
      await fs.writeFile(envPath, envContent);
      
      return json({ success: true, enabled });
    }

    if (url.pathname === "/api/config/openai-key" && method === "POST") {
      const body = await req.json();
      const apiKey = body.apiKey;
      
      if (!apiKey || typeof apiKey !== "string") {
        return json({ error: "API key required" }, 400);
      }
      
      if (!apiKey.startsWith("sk-")) {
        return json({ error: "Invalid API key format" }, 400);
      }

      process.env.OPENAI_API_KEY = apiKey;

      const { homedir } = await import("os");
      const { join } = await import("path");
      const fs = await import("fs/promises");
      
      const configDir = join(homedir(), ".claude-code-ui");
      await fs.mkdir(configDir, { recursive: true });
      
      const envPath = join(configDir, ".env");
      await fs.writeFile(envPath, `OPENAI_API_KEY=${apiKey}\n`);
      
      return json({ success: true });
    }

    if (url.pathname === "/api/claude-md/default") {
      const { homedir } = await import("os");
      const { join } = await import("path");
      const fs = await import("fs/promises");
      const defaultPath = join(homedir(), ".claude-code-ui", "default-claude.md");

      if (method === "GET") {
        try {
          const content = await fs.readFile(defaultPath, "utf-8");
          return json({ content, exists: true });
        } catch {
          return json({ content: getDefaultClaudeMdContent(), exists: false });
        }
      }

      if (method === "POST") {
        const body = await req.json();
        const configDir = join(homedir(), ".claude-code-ui");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(defaultPath, body.content);
        return json({ success: true });
      }
    }

    if (url.pathname === "/api/claude-md/project") {
      const projectPath = url.searchParams.get("path");
      if (!projectPath) {
        return json({ error: "Project path required" }, 400);
      }

      const { join } = await import("path");
      const fs = await import("fs/promises");
      const claudeMdPath = join(projectPath, "CLAUDE.md");

      if (method === "GET") {
        try {
          const content = await fs.readFile(claudeMdPath, "utf-8");
          return json({ content, exists: true, path: claudeMdPath });
        } catch {
          return json({ content: null, exists: false, path: claudeMdPath });
        }
      }

      if (method === "POST") {
        const body = await req.json();
        await fs.writeFile(claudeMdPath, body.content);
        return json({ success: true, path: claudeMdPath });
      }

      if (method === "DELETE") {
        try {
          await fs.unlink(claudeMdPath);
          return json({ success: true });
        } catch {
          return json({ error: "File not found" }, 404);
        }
      }
    }

    if (url.pathname === "/api/claude-md/init" && method === "POST") {
      const body = await req.json();
      const projectPath = body.path;
      if (!projectPath) {
        return json({ error: "Project path required" }, 400);
      }

      const { homedir } = await import("os");
      const { join } = await import("path");
      const fs = await import("fs/promises");

      const claudeMdPath = join(projectPath, "CLAUDE.md");
      
      try {
        await fs.access(claudeMdPath);
        return json({ created: false, exists: true, path: claudeMdPath });
      } catch {}

      const defaultPath = join(homedir(), ".claude-code-ui", "default-claude.md");
      let content: string;
      try {
        content = await fs.readFile(defaultPath, "utf-8");
      } catch {
        content = getDefaultClaudeMdContent();
      }

      await fs.writeFile(claudeMdPath, content);
      return json({ created: true, exists: true, path: claudeMdPath });
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

    if (url.pathname === "/api/auth/status") {
      const isTestMode = process.env.DEV_ENV === "TEST";
      
      if (isTestMode) {
        return json({
          claudeInstalled: false,
          claudePath: "",
          authenticated: false,
          authMethod: null,
          hasApiKey: false,
          hasOAuth: false,
          preferredAuth: null,
        });
      }
      
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      
      let claudeInstalled = false;
      let claudePath = "";
      
      const pathsToTry = [
        "which claude",
        "command -v claude",
      ];
      
      for (const cmd of pathsToTry) {
        try {
          const { stdout } = await execAsync(cmd);
          claudePath = stdout.trim();
          if (claudePath) {
            claudeInstalled = true;
            break;
          }
        } catch {}
      }

      const storedApiKey = globalSettings.get("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;
      const hasApiKey = !!storedApiKey;
      
      if (storedApiKey && !globalSettings.get("anthropicApiKey")) {
        globalSettings.set("anthropicApiKey", storedApiKey);
      }
      
      let hasOAuth = false;
      try {
        const originalKey = process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        
        const q = query({
          prompt: "",
          options: { cwd: process.cwd() },
        });
        const models = await q.supportedModels();
        await q.interrupt();
        
        if (models && models.length > 0) {
          hasOAuth = true;
          claudeInstalled = true;
        }
        
        if (originalKey) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        }
      } catch (e: any) {
        hasOAuth = false;
      }

      const preferredAuth = globalSettings.get("preferredAuth") as "oauth" | "api_key" | null;
      const authenticated = hasOAuth || hasApiKey;
      
      let authMethod: "oauth" | "api_key" | null = null;
      if (hasOAuth && hasApiKey) {
        authMethod = preferredAuth || "oauth";
      } else if (hasApiKey) {
        authMethod = "api_key";
      } else if (hasOAuth) {
        authMethod = "oauth";
      }

      const apiKeyPreview = storedApiKey 
        ? `${storedApiKey.slice(0, 10)}...${storedApiKey.slice(-4)}`
        : null;

      return json({
        claudeInstalled,
        claudePath,
        authenticated,
        authMethod,
        hasApiKey,
        apiKeyPreview,
        hasOAuth,
        preferredAuth,
      });
    }

    if (url.pathname === "/api/auth/preferred" && method === "POST") {
      const body = await req.json();
      const preferred = body.preferred as "oauth" | "api_key" | null;
      
      if (preferred !== null && preferred !== "oauth" && preferred !== "api_key") {
        return json({ error: "Invalid preferred auth method" }, 400);
      }
      
      if (preferred === null) {
        globalSettings.set("preferredAuth", "");
      } else {
        globalSettings.set("preferredAuth", preferred);
      }
      
      return json({ success: true, preferred });
    }

    if (url.pathname === "/api/auth/api-key" && method === "POST") {
      const body = await req.json();
      const apiKey = body.apiKey;
      
      if (!apiKey || typeof apiKey !== "string") {
        return json({ error: "API key required" }, 400);
      }
      
      if (!apiKey.startsWith("sk-ant-")) {
        return json({ error: "Invalid Anthropic API key format. Key should start with 'sk-ant-'" }, 400);
      }

      globalSettings.set("anthropicApiKey", apiKey);
      
      const preferredAuth = globalSettings.get("preferredAuth");
      if (!preferredAuth) {
        globalSettings.set("preferredAuth", "api_key");
      }
      
      return json({ success: true });
    }

    if (url.pathname === "/api/auth/login" && method === "POST") {
      const { spawn } = await import("child_process");
      
      return new Promise((resolve) => {
        const loginProcess = spawn("claude", ["login"], {
          stdio: ["inherit", "pipe", "pipe"],
        });

        let output = "";
        loginProcess.stdout?.on("data", (data) => {
          output += data.toString();
        });
        loginProcess.stderr?.on("data", (data) => {
          output += data.toString();
        });

        loginProcess.on("close", (code) => {
          if (code === 0) {
            resolve(json({ success: true, message: "Login successful" }));
          } else {
            resolve(json({ success: false, error: output || "Login failed" }, 400));
          }
        });

        loginProcess.on("error", (err) => {
          resolve(json({ success: false, error: err.message }, 500));
        });

        setTimeout(() => {
          loginProcess.kill();
          resolve(json({ 
            success: false, 
            error: "Login requires interactive terminal. Please run 'claude login' in your terminal.",
            requiresTerminal: true 
          }, 400));
        }, 2000);
      });
    }

    if (url.pathname === "/api/transcribe" && method === "POST") {
      try {
        const formData = await req.formData();
        const audioFile = formData.get("audio") as File;
        
        if (!audioFile) {
          return json({ error: "No audio file provided" }, 400);
        }

        const audioBuffer = await audioFile.arrayBuffer();
        const audioBytes = new Uint8Array(audioBuffer);

        const whisperApiKey = process.env.OPENAI_API_KEY;
        if (!whisperApiKey) {
          return json({ error: "OPENAI_API_KEY not configured" }, 500);
        }

        const whisperFormData = new FormData();
        whisperFormData.append("file", new Blob([audioBytes], { type: "audio/webm" }), "audio.webm");
        whisperFormData.append("model", "whisper-1");
        whisperFormData.append("response_format", "json");

        const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${whisperApiKey}`,
          },
          body: whisperFormData,
        });

        if (!whisperRes.ok) {
          const errorData = await whisperRes.json().catch(() => ({}));
          console.error("Whisper API error:", errorData);
          return json({ error: errorData.error?.message || "Transcription failed" }, whisperRes.status);
        }

        const result = await whisperRes.json();
        return json({ text: result.text });
      } catch (e) {
        console.error("Transcription error:", e);
        return json({ error: e instanceof Error ? e.message : "Transcription failed" }, 500);
      }
    }

    if (url.pathname === "/api/audio/save" && method === "POST") {
      try {
        const formData = await req.formData();
        const audioFile = formData.get("audio") as File;
        
        if (!audioFile) {
          return json({ error: "No audio file provided" }, 400);
        }

        const { homedir } = await import("os");
        const { join } = await import("path");
        const fs = await import("fs/promises");

        const audioDir = join(homedir(), ".claude-code-ui", "audio-backups");
        await fs.mkdir(audioDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `recording-${timestamp}.webm`;
        const filepath = join(audioDir, filename);

        const audioBuffer = await audioFile.arrayBuffer();
        await fs.writeFile(filepath, new Uint8Array(audioBuffer));

        console.log(`Audio backup saved: ${filepath}`);
        return json({ path: filepath });
      } catch (e) {
        console.error("Audio save error:", e);
        return json({ error: e instanceof Error ? e.message : "Failed to save audio" }, 500);
      }
    }

    if (url.pathname === "/api/ephemeral" && method === "POST") {
      try {
        const body = await req.json();
        const { 
          prompt, 
          systemPrompt,
          model = "claude-sonnet-4-20250514",
          maxTokens = 1024,
          projectPath,
          useTools = false,
          provider = "auto"
        } = body;
        
        if (!prompt) {
          return json({ error: "Prompt is required" }, 400);
        }

        let result = "";
        let usage = { input_tokens: 0, output_tokens: 0 };
        let costUsd = 0;

        const effectiveProvider = provider === "auto" 
          ? (process.env.OPENAI_API_KEY ? "openai" : "anthropic")
          : provider;

        if (effectiveProvider === "openai" && process.env.OPENAI_API_KEY && !useTools) {
          const openaiModel = model.includes("haiku") ? "gpt-4o-mini" : "gpt-4o-mini";
          const messages: any[] = [];
          if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
          }
          messages.push({ role: "user", content: prompt });

          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: openaiModel,
              messages,
              max_tokens: maxTokens,
              temperature: 0.7,
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || "OpenAI API error");
          }

          const data = await res.json();
          result = data.choices?.[0]?.message?.content || "";
          usage = {
            input_tokens: data.usage?.prompt_tokens || 0,
            output_tokens: data.usage?.completion_tokens || 0,
          };
          costUsd = (usage.input_tokens * 0.00015 + usage.output_tokens * 0.0006) / 1000;
        } else if (globalSettings.get("anthropicApiKey") && !useTools) {
          const storedApiKey = globalSettings.get("anthropicApiKey")!;
          const anthropicModel = model.includes("haiku") ? "claude-3-haiku-20240307" : "claude-3-haiku-20240307";
          
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": storedApiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: anthropicModel,
              max_tokens: maxTokens,
              system: systemPrompt || undefined,
              messages: [{ role: "user", content: prompt }],
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || "Anthropic API error");
          }

          const data = await res.json();
          result = data.content?.[0]?.text || "";
          usage = {
            input_tokens: data.usage?.input_tokens || 0,
            output_tokens: data.usage?.output_tokens || 0,
          };
          costUsd = (usage.input_tokens * 0.00025 + usage.output_tokens * 0.00125) / 1000;
        } else {
          const q = query({
            prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
            options: {
              cwd: projectPath || process.cwd(),
              allowedTools: useTools ? ["Read", "Glob", "Grep", "Bash"] : [],
              maxTurns: useTools ? 5 : 1,
              model: model,
            },
          });

          for await (const msg of q) {
            if (msg.type === "assistant") {
              const textBlock = msg.message.content.find((b: any) => b.type === "text");
              if (textBlock) {
                result = textBlock.text;
              }
            }
            if (msg.type === "result") {
              usage = msg.usage || usage;
              costUsd = msg.total_cost_usd || 0;
            }
          }
        }

        return json({ 
          result, 
          usage,
          costUsd,
          provider: effectiveProvider,
        });
      } catch (e) {
        console.error("Ephemeral chat error:", e);
        return json({ error: e instanceof Error ? e.message : "Ephemeral chat failed" }, 500);
      }
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
          console.log(`[${data.sessionId}] Starting query: "${data.prompt.slice(0, 50)}..."`);
          handleQueryWithProcess(ws, data);
        } else if (data.type === "abort" && data.sessionId) {
          const active = activeProcesses.get(data.sessionId);
          if (active) {
            console.log(`Aborting query for session ${data.sessionId}`);
            active.process.kill("SIGTERM");
            activeProcesses.delete(data.sessionId);
            ws.send(JSON.stringify({ type: "aborted", uiSessionId: data.sessionId }));
          }
        } else if (data.type === "permission_response" && data.permissionRequestId) {
          const pending = pendingPermissions.get(data.permissionRequestId);
          if (pending) {
            if (data.approveAll && pending.sessionId) {
              sessionApprovedAll.add(pending.sessionId);
              sessions.setAutoAcceptAll(pending.sessionId, true);
            }
            const active = activeProcesses.get(pending.sessionId);
            if (active && active.process.stdin) {
              const response = JSON.stringify({
                type: "permission_response",
                requestId: data.permissionRequestId,
                approved: data.approved,
                approveAll: data.approveAll,
              });
              active.process.stdin.write(response + "\n");
            }
            pendingPermissions.delete(data.permissionRequestId);
          }
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

function handleQueryWithProcess(ws: any, data: ClientMessage) {
  const { prompt, projectId, sessionId, claudeSessionId, allowedTools, model, historyContext } = data;

  const session = sessionId ? sessions.get(sessionId) : null;
  const project = projectId ? projects.get(projectId) : null;
  const workingDirectory = project?.path || process.cwd();

  console.log(`[${sessionId}] Spawning worker process in ${workingDirectory}`);

  const permissionSettings = globalSettings.getPermissions();

  const needsAutoTitle = session?.title === "New Chat" || session?.title === "New conversation";
  
  if (sessionId && prompt) {
    const msgId = crypto.randomUUID();
    const now = Date.now();
    messages.create(msgId, sessionId, "user", JSON.stringify(prompt), now);
    searchIndex.indexMessage(msgId, sessionId, JSON.stringify(prompt), now);
  }

  const effectivePrompt = historyContext 
    ? `${historyContext}\n\nUser's new message:\n${prompt}`
    : prompt;

  const workerPath = join(__dirname, "query-worker.ts");
  const isSessionApprovedAll = sessionId ? (sessionApprovedAll.has(sessionId) || session?.auto_accept_all === 1) : false;
  const isProjectApprovedAll = project?.auto_accept_all === 1;
  const inputJson = JSON.stringify({
    prompt: effectivePrompt,
    cwd: workingDirectory,
    resume: claudeSessionId || session?.claude_session_id,
    model,
    allowedTools: allowedTools || permissionSettings.allowedTools,
    sessionId,
    permissionSettings: {
      autoAcceptAll: permissionSettings.autoAcceptAll || isSessionApprovedAll || isProjectApprovedAll,
      requireConfirmation: permissionSettings.requireConfirmation,
    },
  });

  const preferredAuth = globalSettings.get("preferredAuth") as "oauth" | "api_key" | null;
  const storedApiKey = globalSettings.get("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;
  
  const workerEnv = { ...process.env };
  delete workerEnv.ANTHROPIC_API_KEY;
  
  if (preferredAuth === "api_key" && storedApiKey) {
    workerEnv.ANTHROPIC_API_KEY = storedApiKey;
    console.log(`[${sessionId}] Using API key auth`);
  } else {
    console.log(`[${sessionId}] Using OAuth auth`);
  }

  const child = spawn("bun", ["run", workerPath, inputJson], {
    cwd: workingDirectory,
    stdio: ["pipe", "pipe", "pipe"],
    env: workerEnv,
  });

  if (sessionId) {
    activeProcesses.set(sessionId, { process: child, ws, sessionId });
  }

  let buffer = "";
  
  child.stdout?.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        
        if (msg.type === "message") {
          ws.send(JSON.stringify(msg.data));
        } else if (msg.type === "permission_request") {
          if (sessionId) {
            pendingPermissions.set(msg.requestId, { sessionId });
          }
          ws.send(JSON.stringify({
            type: "permission_request",
            requestId: msg.requestId,
            tools: [msg.toolName],
            toolInput: msg.toolInput,
            message: msg.message,
          }));
        } else if (msg.type === "complete") {
          if (sessionId && msg.lastAssistantContent?.length > 0) {
            const msgId = crypto.randomUUID();
            const now = Date.now();
            messages.create(msgId, sessionId, "assistant", JSON.stringify(msg.lastAssistantContent), now);
            searchIndex.indexMessage(msgId, sessionId, JSON.stringify(msg.lastAssistantContent), now);
            
            if (needsAutoTitle && prompt) {
              generateChatTitle(prompt, msg.lastAssistantContent, sessionId);
            }
          }

          if (sessionId && msg.resultData) {
            sessions.updateClaudeSession(
              msg.resultData.session_id,
              msg.resultData.model || null,
              msg.resultData.total_cost_usd || 0,
              msg.resultData.num_turns || 0,
              msg.resultData.usage?.input_tokens || 0,
              msg.resultData.usage?.output_tokens || 0,
              Date.now(),
              sessionId
            );
          }

          ws.send(JSON.stringify({ type: "done", uiSessionId: sessionId }));
          if (sessionId) activeProcesses.delete(sessionId);
        } else if (msg.type === "error") {
          ws.send(JSON.stringify({ 
            type: "error", 
            uiSessionId: sessionId,
            error: msg.error 
          }));
          if (sessionId) activeProcesses.delete(sessionId);
        }
      } catch (e) {
        console.log(`[${sessionId}] Non-JSON stdout:`, line);
      }
    }
  });

  child.stderr?.on("data", (data) => {
    console.error(`[${sessionId}] stderr:`, data.toString());
  });

  child.on("error", (error) => {
    console.error(`[${sessionId}] Process error:`, error);
    ws.send(JSON.stringify({ 
      type: "error", 
      uiSessionId: sessionId,
      error: error.message 
    }));
    if (sessionId) activeProcesses.delete(sessionId);
  });

  child.on("exit", (code) => {
    console.log(`[${sessionId}] Process exited with code ${code}`);
    if (buffer.trim()) {
      try {
        const msg = JSON.parse(buffer);
        if (msg.type === "complete") {
          ws.send(JSON.stringify({ type: "done", uiSessionId: sessionId }));
        }
      } catch {}
    }
    if (sessionId) activeProcesses.delete(sessionId);
  });
}

async function handleQuery(ws: any, data: ClientMessage) {
  const { prompt, projectId, sessionId, claudeSessionId, allowedTools, model } = data;

  const session = sessionId ? sessions.get(sessionId) : null;
  const project = projectId ? projects.get(projectId) : null;
  const workingDirectory = project?.path || process.cwd();

  console.log(`Query: "${prompt}" in ${workingDirectory}`);

  const needsAutoTitle = session?.title === "New Chat" || session?.title === "New conversation";
  
  if (sessionId && prompt) {
    const msgId = crypto.randomUUID();
    messages.create(msgId, sessionId, "user", JSON.stringify(prompt), Date.now());
  }

  const queryKey = sessionId || crypto.randomUUID();
  
  try {
    const q = query({
      prompt: prompt!,
      options: {
        cwd: workingDirectory,
        resume: claudeSessionId || session?.claude_session_id || undefined,
        model: model || undefined,
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
        settingSources: ['project'],
      },
    });

    activeQueries.set(queryKey, { abort: () => q.interrupt(), ws });
    console.log(`[${sessionId}] Query registered, starting iteration...`);

    let lastAssistantContent: any[] = [];
    let resultData: any = null;
    let wasAborted = false;

    for await (const msg of q) {
      console.log(`[${sessionId}] Got message type: ${msg.type}`);
      if (!activeQueries.has(queryKey)) {
        wasAborted = true;
        break;
      }
      const formatted = formatMessage(msg, sessionId);
      ws.send(JSON.stringify(formatted));

      if (msg.type === "assistant") {
        lastAssistantContent = msg.message.content;
      }
      if (msg.type === "result") {
        resultData = msg;
      }
    }

    activeQueries.delete(queryKey);

    if (wasAborted) {
      return;
    }

    if (sessionId && lastAssistantContent.length > 0) {
      const msgId = crypto.randomUUID();
      messages.create(msgId, sessionId, "assistant", JSON.stringify(lastAssistantContent), Date.now());
      
      if (needsAutoTitle && prompt) {
        generateChatTitle(prompt, lastAssistantContent, sessionId);
      }
    }

    if (sessionId && resultData) {
      sessions.updateClaudeSession(
        resultData.session_id,
        resultData.model || null,
        resultData.total_cost_usd || 0,
        resultData.num_turns || 0,
        resultData.usage?.input_tokens || 0,
        resultData.usage?.output_tokens || 0,
        Date.now(),
        sessionId
      );
    }

    ws.send(JSON.stringify({ type: "done", sessionId }));
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : "Query failed",
      })
    );
  }
}

async function generateChatTitle(userPrompt: string, assistantContent: any[], sessionId: string) {
  const autoTitleEnabled = process.env.AUTO_TITLE !== "false";
  if (!autoTitleEnabled) {
    const fallbackTitle = userPrompt.slice(0, 50) + (userPrompt.length > 50 ? "..." : "");
    sessions.updateTitle(fallbackTitle, Date.now(), sessionId);
    return;
  }

  try {
    const assistantText = assistantContent
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join(" ")
      .slice(0, 300);
    
    const systemPrompt = "Generate a very short title (3-6 words max) for this conversation. Return ONLY the title text, nothing else. No quotes.";
    const userContent = `User: ${userPrompt.slice(0, 150)}\nAssistant: ${assistantText.slice(0, 150)}`;

    let title = "";
    
    if (process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 20,
          temperature: 0.7,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        title = data.choices?.[0]?.message?.content?.trim() || "";
      }
    } else {
      const storedApiKey = globalSettings.get("anthropicApiKey");
      if (storedApiKey) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": storedApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 20,
            system: systemPrompt,
            messages: [{ role: "user", content: userContent }],
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          title = data.content?.[0]?.text?.trim() || "";
        }
      }
    }

    title = title.replace(/^["']|["']$/g, "").slice(0, 60);
    
    if (title && title.length > 2) {
      sessions.updateTitle(title, Date.now(), sessionId);
    } else {
      const fallbackTitle = userPrompt.slice(0, 50) + (userPrompt.length > 50 ? "..." : "");
      sessions.updateTitle(fallbackTitle, Date.now(), sessionId);
    }
  } catch (e) {
    console.error("Failed to generate chat title:", e);
    const fallbackTitle = userPrompt.slice(0, 50) + (userPrompt.length > 50 ? "..." : "");
    sessions.updateTitle(fallbackTitle, Date.now(), sessionId);
  }
}

function formatMessage(msg: SDKMessage, uiSessionId?: string): any {
  switch (msg.type) {
    case "system":
      return {
        type: "system",
        uiSessionId,
        claudeSessionId: msg.session_id,
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
        uiSessionId,
        claudeSessionId: msg.session_id,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
      };

    case "user":
      return {
        type: "user",
        uiSessionId,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
      };

    case "result":
      return {
        type: "result",
        uiSessionId,
        claudeSessionId: msg.session_id,
        costUsd: msg.total_cost_usd,
        durationMs: msg.duration_ms,
        numTurns: msg.num_turns,
        usage: msg.usage,
      };

    case "tool_progress":
      return {
        type: "tool_progress",
        uiSessionId,
        toolUseId: msg.tool_use_id,
        toolName: msg.tool_name,
        parentToolUseId: msg.parent_tool_use_id || null,
        elapsedTimeSeconds: msg.elapsed_time_seconds,
      };

    default:
      return { type: "unknown", uiSessionId, raw: msg };
  }
}

function getDefaultClaudeMdContent(): string {
  return `# Project Instructions

## Code Style
- Follow existing patterns and conventions in this codebase
- No comments unless absolutely necessary
- Prefer editing existing files over creating new ones
- Keep code concise and readable

## Development
- Run tests before committing changes
- Verify lint/typecheck passes
- Follow security best practices

## Communication
- Be concise and direct
- Focus on what changed, not explanations
- One word answers when appropriate
`;
}

console.log(`Claude Code UI Server running on http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
