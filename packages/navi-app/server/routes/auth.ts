import { spawn } from "child_process";
import { json, error as errorResponse } from "../utils/response";
import { globalSettings } from "../db";
import { buildClaudeCodeEnv, getClaudeCodeRuntimeOptions } from "../utils/claude-code";
import { getSDK } from "../utils/sdk-loader";
import { createHash, randomBytes } from "crypto";

// ============================================
// USER AUTH (for gated features like Email)
// ============================================

const AGENTMAIL_API_BASE = "https://api.agentmail.to/v0";

// In-memory user store (replace with DB later)
interface NaviUser {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  naviEmail: string;
  createdAt: number;
}

const naviUsers = new Map<string, NaviUser>();

// Session store
interface NaviSession {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

const naviSessions = new Map<string, NaviSession>();

function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(password + salt).digest("hex");
}

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

async function createNaviInbox(username: string): Promise<string | null> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    console.error("[Auth] AGENTMAIL_API_KEY not set");
    return null;
  }

  try {
    const response = await fetch(`${AGENTMAIL_API_BASE}/inboxes`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        display_name: `Navi - ${username}`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
      console.error("[Auth] Failed to create inbox:", errorData);

      // Provide specific error for limit exceeded
      if (errorData.name === "LimitExceededError") {
        throw new Error("AgentMail inbox limit reached. Please delete unused inboxes at agentmail.to or upgrade your plan.");
      }
      return null;
    }

    const result = await response.json() as { inbox_id: string };
    return result.inbox_id;
  } catch (e) {
    console.error("[Auth] Error creating inbox:", e);
    return null;
  }
}

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/navi_session=([^;]+)/);
  return match ? match[1] : null;
}

function getUserFromSession(sessionToken: string): NaviUser | null {
  const session = naviSessions.get(sessionToken);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    naviSessions.delete(sessionToken);
    return null;
  }
  return naviUsers.get(session.userId) || null;
}

// ============================================

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

    const storedApiKey = globalSettings.get("anthropicApiKey") as string | null;
    const hasApiKey = !!storedApiKey;

    let hasOAuth = false;
    try {
      const { query } = await getSDK();
      const q = query({
        prompt: "",
        options: {
          cwd: process.cwd(),
          env: buildClaudeCodeEnv(process.env),
          ...getClaudeCodeRuntimeOptions(),
        },
      });
      const models = await q.supportedModels();
      await q.interrupt();

      if (models && models.length > 0) {
        hasOAuth = true;
        claudeInstalled = true;
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

    const zaiKey = globalSettings.get("zaiApiKey") as string | null;
    const hasZaiKey = !!zaiKey;
    const zaiKeyPreview = zaiKey
      ? `${zaiKey.slice(0, 8)}...${zaiKey.slice(-4)}`
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
      hasZaiKey,
      zaiKeyPreview,
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

  if (url.pathname === "/api/auth/zai-key" && method === "POST") {
    const body = await req.json();
    const apiKey = body.apiKey;

    if (!apiKey || typeof apiKey !== "string") {
      return json({ error: "API key required" }, 400);
    }

    globalSettings.set("zaiApiKey", apiKey);

    return json({ success: true });
  }

  if (url.pathname === "/api/auth/zai-key" && method === "DELETE") {
    globalSettings.set("zaiApiKey", "");
    return json({ success: true });
  }

  if (url.pathname === "/api/auth/zai-key" && method === "GET") {
    const zaiKey = globalSettings.get("zaiApiKey") as string | null;
    const hasZaiKey = !!zaiKey;
    const zaiKeyPreview = zaiKey
      ? `${zaiKey.slice(0, 8)}...${zaiKey.slice(-4)}`
      : null;

    return json({ hasZaiKey, zaiKeyPreview });
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

  // ============================================
  // USER AUTH ROUTES (for gated features)
  // ============================================

  // GET /api/auth/me - Get current Navi user
  if (url.pathname === "/api/auth/me" && method === "GET") {
    const sessionToken = getSessionFromRequest(req);
    if (!sessionToken) {
      return errorResponse("Not authenticated", 401);
    }

    const user = getUserFromSession(sessionToken);
    if (!user) {
      return errorResponse("Not authenticated", 401);
    }

    return json({
      id: user.id,
      email: user.email,
      name: user.name,
      naviEmail: user.naviEmail,
      createdAt: user.createdAt,
    });
  }

  // POST /api/auth/signup - Create Navi account
  if (url.pathname === "/api/auth/signup" && method === "POST") {
    try {
      const body = await req.json() as {
        email: string;
        password: string;
        name?: string;
      };

      if (!body.email || !body.password) {
        return errorResponse("Email and password required", 400);
      }

      if (body.password.length < 8) {
        return errorResponse("Password must be at least 8 characters", 400);
      }

      // Check if user exists
      for (const user of naviUsers.values()) {
        if (user.email === body.email) {
          return errorResponse("Email already registered", 400);
        }
      }

      // Generate username for AgentMail
      const emailUsername = body.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      const naviUsername = `navi-${emailUsername}-${randomBytes(4).toString("hex")}`;

      // Create AgentMail inbox
      let naviEmail: string | null;
      try {
        naviEmail = await createNaviInbox(naviUsername);
      } catch (e: any) {
        return errorResponse(e.message || "Failed to create Navi email. Please try again.", 500);
      }
      if (!naviEmail) {
        return errorResponse("Failed to create Navi email. Please try again.", 500);
      }

      // Create user
      const userId = randomBytes(16).toString("hex");
      const salt = randomBytes(16).toString("hex");
      const passwordHash = hashPassword(body.password, salt) + ":" + salt;

      const user: NaviUser = {
        id: userId,
        email: body.email,
        passwordHash,
        name: body.name,
        naviEmail,
        createdAt: Date.now(),
      };

      naviUsers.set(userId, user);

      // Create session
      const sessionToken = generateSessionToken();
      naviSessions.set(sessionToken, {
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      const response = json({
        id: user.id,
        email: user.email,
        name: user.name,
        naviEmail: user.naviEmail,
        createdAt: user.createdAt,
      });

      response.headers.set("Set-Cookie", `navi_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
      return response;
    } catch (e) {
      console.error("[Auth] Signup error:", e);
      return errorResponse("Sign up failed", 500);
    }
  }

  // POST /api/auth/signin - Sign in to Navi
  if (url.pathname === "/api/auth/signin" && method === "POST") {
    try {
      const body = await req.json() as {
        email: string;
        password: string;
      };

      if (!body.email || !body.password) {
        return errorResponse("Email and password required", 400);
      }

      // Find user
      let foundUser: NaviUser | null = null;
      for (const user of naviUsers.values()) {
        if (user.email === body.email) {
          foundUser = user;
          break;
        }
      }

      if (!foundUser) {
        return errorResponse("Invalid email or password", 401);
      }

      // Check password
      const [storedHash, salt] = foundUser.passwordHash.split(":");
      const inputHash = hashPassword(body.password, salt);

      if (inputHash !== storedHash) {
        return errorResponse("Invalid email or password", 401);
      }

      // Create session
      const sessionToken = generateSessionToken();
      naviSessions.set(sessionToken, {
        userId: foundUser.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });

      const response = json({
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        naviEmail: foundUser.naviEmail,
        createdAt: foundUser.createdAt,
      });

      response.headers.set("Set-Cookie", `navi_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
      return response;
    } catch (e) {
      console.error("[Auth] Signin error:", e);
      return errorResponse("Sign in failed", 500);
    }
  }

  // POST /api/auth/signout - Sign out of Navi
  if (url.pathname === "/api/auth/signout" && method === "POST") {
    const sessionToken = getSessionFromRequest(req);
    if (sessionToken) {
      naviSessions.delete(sessionToken);
    }

    const response = json({ success: true });
    response.headers.set("Set-Cookie", `navi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return response;
  }

  return null;
}
