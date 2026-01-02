import { query } from "@anthropic-ai/claude-agent-sdk";
import { json } from "../utils/response";
import { globalSettings, DEFAULT_TOOLS, DANGEROUS_TOOLS } from "../db";
import { buildClaudeCodeEnv, getClaudeCodeRuntimeOptions } from "../utils/claude-code";
import { resolveNaviClaudeAuth, formatAuthForLog } from "../utils/navi-auth";
import { describePath, writeDebugLog } from "../utils/logging";

export async function handleConfigRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
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

  // Navi API URL endpoint - used by skills and external tools to discover the API
  if (url.pathname === "/api/navi-url") {
    const port = process.env.PORT || Bun.env.PORT || "3001";
    const apiUrl = `http://localhost:${port}`;
    return json({ apiUrl, port: parseInt(port, 10) });
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
    const authResult = resolveNaviClaudeAuth();
    logModelsDiagnostics("start", {
      auth: formatAuthForLog(authResult),
      cwd: process.cwd(),
      execPath: process.execPath,
      argv0: process.argv?.[0] ?? null,
    });

    const runtimeOptions = getClaudeCodeRuntimeOptions();
    logModelsDiagnostics("runtime", {
      runtimeOptions,
      executable: describePath(runtimeOptions.executable),
      claudeCode: describePath(runtimeOptions.pathToClaudeCodeExecutable),
    });

    let q: ReturnType<typeof query> | null = null;
    try {
      q = query({
        prompt: "",
        options: {
          cwd: process.cwd(),
          env: buildClaudeCodeEnv(process.env, authResult.overrides),
          ...runtimeOptions,
        },
      });
      const sdkModels = await q.supportedModels();
      logModelsDiagnostics("success", {
        modelCount: Array.isArray(sdkModels) ? sdkModels.length : null,
      });

      // Add provider info to Claude models and ensure Sonnet is included
      const claudeModels = sdkModels.map((m: any) => ({ ...m, provider: "anthropic" }));

      // Check if sonnet is missing and add it
      const hasSonnet = claudeModels.some((m: any) => m.value === "sonnet" || m.value.includes("sonnet"));
      if (!hasSonnet) {
        claudeModels.push({
          value: "sonnet",
          displayName: "Sonnet",
          description: "Sonnet 4 · Best balance of speed and capability · $3/$15 per Mtok",
          provider: "anthropic"
        });
      }

      // Add Z.AI models if API key is configured
      const zaiApiKey = globalSettings.get("zaiApiKey") || process.env.ZAI_API_KEY;
      const zaiModels = zaiApiKey ? [
        { value: "glm-4.7", displayName: "GLM-4.7", description: "Z.AI flagship coding model", provider: "zai" },
        { value: "glm-4.5-air", displayName: "GLM-4.5 Air", description: "Fast, lightweight model", provider: "zai" },
      ] : [];

      return json([...claudeModels, ...zaiModels]);
    } catch (e) {
      logModelsDiagnostics("error", {
        message: e instanceof Error ? e.message : String(e),
        name: e instanceof Error ? e.name : null,
        stack: e instanceof Error ? e.stack : null,
      });
      return json({ error: "Failed to fetch models" }, 500);
    } finally {
      if (q) {
        try {
          await q.interrupt();
        } catch (e) {
          logModelsDiagnostics("interrupt_error", {
            message: e instanceof Error ? e.message : String(e),
            name: e instanceof Error ? e.name : null,
          });
        }
      }
    }
  }

  return null;
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

function logModelsDiagnostics(stage: string, payload: Record<string, unknown>) {
  const message = `[Models] ${stage}: ${JSON.stringify(payload)}`;
  console.error(message);
  writeDebugLog(message);
}
