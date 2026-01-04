import { query } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "child_process";
import { json } from "../utils/response";
import { globalSettings } from "../db";

export async function handleAuthRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
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

  return null;
}
