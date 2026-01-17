/**
 * LLM Council Routes
 *
 * API endpoints for dispatching prompts to multiple LLMs simultaneously
 * and comparing their responses side-by-side.
 */

import { json, error } from "../utils/response";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { execSync } from "child_process";

// ============================================================================
// Types
// ============================================================================

export interface CouncilMember {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google";
  model: string;
  icon: string;
  color: string;
}

export interface CouncilResponse {
  memberId: string;
  memberName: string;
  response: string;
  latencyMs: number;
  error?: string;
  tokenCount?: number;
}

export interface CouncilResult {
  prompt: string;
  responses: CouncilResponse[];
  totalLatencyMs: number;
  timestamp: string;
}

// ============================================================================
// Configuration
// ============================================================================

const KEYMANAGER_MASTER_KEY = "1479863a-96d5-4a9d-9824-1996c21a2d36";
const KEYMANAGER_PATH =
  "/Users/brunogalvao/Documents/dev-bruno/api-key-manager/index.ts";

// Default council members - can be customized per request
const DEFAULT_COUNCIL: CouncilMember[] = [
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    icon: "🟣",
    color: "#8B5CF6",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    model: "gpt-4o",
    icon: "🟢",
    color: "#10B981",
  },
  {
    id: "gemini-flash",
    name: "Gemini Flash",
    provider: "google",
    model: "gemini-2.0-flash-exp",
    icon: "🔵",
    color: "#3B82F6",
  },
];

// Available council members to choose from
const AVAILABLE_MEMBERS: CouncilMember[] = [
  // Anthropic
  {
    id: "claude-opus",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    model: "claude-opus-4-5-20251101",
    icon: "🟣",
    color: "#7C3AED",
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    icon: "🟣",
    color: "#8B5CF6",
  },
  {
    id: "claude-haiku",
    name: "Claude Haiku",
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    icon: "🟣",
    color: "#A78BFA",
  },
  // OpenAI
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    model: "gpt-4o",
    icon: "🟢",
    color: "#10B981",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    model: "gpt-4o-mini",
    icon: "🟢",
    color: "#34D399",
  },
  {
    id: "o1",
    name: "o1 (Reasoning)",
    provider: "openai",
    model: "o1",
    icon: "🟢",
    color: "#059669",
  },
  // Google
  {
    id: "gemini-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    model: "gemini-2.0-flash-exp",
    icon: "🔵",
    color: "#3B82F6",
  },
  {
    id: "gemini-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    model: "gemini-1.5-pro",
    icon: "🔵",
    color: "#2563EB",
  },
];

// ============================================================================
// Key Management
// ============================================================================

function getKeyFromManager(service: string): string | null {
  try {
    const result = execSync(
      `export KEYMANAGER_MASTER_KEY="${KEYMANAGER_MASTER_KEY}" && ${KEYMANAGER_PATH} find --service ${service}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const keys = JSON.parse(result);
    if (!keys || keys.length === 0) return null;

    const keyId = keys[0].id;
    const keyResult = execSync(
      `export KEYMANAGER_MASTER_KEY="${KEYMANAGER_MASTER_KEY}" && ${KEYMANAGER_PATH} get ${keyId} --show-key --format json`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const data = JSON.parse(keyResult);
    return data.key || null;
  } catch {
    return null;
  }
}

const providerServiceMap: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "gemini",
};

function getApiKey(provider: string): string | null {
  const service = providerServiceMap[provider];
  if (!service) return null;

  // Try keymanager first
  const key = getKeyFromManager(service);
  if (key) return key;

  // Fall back to environment variables
  const envVars: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GEMINI_API_KEY",
  };

  return process.env[envVars[provider]] || null;
}

// ============================================================================
// LLM Dispatch
// ============================================================================

async function dispatchToMember(
  member: CouncilMember,
  prompt: string,
  systemPrompt?: string
): Promise<CouncilResponse> {
  const startTime = Date.now();

  try {
    const apiKey = getApiKey(member.provider);
    if (!apiKey) {
      return {
        memberId: member.id,
        memberName: member.name,
        response: "",
        latencyMs: Date.now() - startTime,
        error: `No API key for ${member.provider}`,
      };
    }

    // Create provider instance
    let provider: any;
    switch (member.provider) {
      case "openai":
        provider = createOpenAI({ apiKey });
        break;
      case "anthropic":
        provider = createAnthropic({ apiKey });
        break;
      case "google":
        provider = createGoogleGenerativeAI({ apiKey });
        break;
    }

    const model = provider(member.model);

    const result = await generateText({
      model,
      prompt,
      system: systemPrompt,
      maxTokens: 4096,
    });

    return {
      memberId: member.id,
      memberName: member.name,
      response: result.text,
      latencyMs: Date.now() - startTime,
      tokenCount: result.usage?.totalTokens,
    };
  } catch (err: any) {
    return {
      memberId: member.id,
      memberName: member.name,
      response: "",
      latencyMs: Date.now() - startTime,
      error: err.message || "Unknown error",
    };
  }
}

async function conveneCouncil(
  prompt: string,
  members: CouncilMember[] = DEFAULT_COUNCIL,
  systemPrompt?: string
): Promise<CouncilResult> {
  const startTime = Date.now();

  // Dispatch to all members in parallel
  const responses = await Promise.all(
    members.map((member) => dispatchToMember(member, prompt, systemPrompt))
  );

  return {
    prompt,
    responses,
    totalLatencyMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Route Handler
// ============================================================================

export async function handleCouncilRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const path = url.pathname;

  // GET /api/council/members - List available council members
  if (path === "/api/council/members" && method === "GET") {
    // Check which providers have API keys
    const membersWithStatus = AVAILABLE_MEMBERS.map((member) => ({
      ...member,
      available: !!getApiKey(member.provider),
    }));

    return json({
      members: membersWithStatus,
      defaultCouncil: DEFAULT_COUNCIL.map((m) => m.id),
    });
  }

  // GET /api/council/providers - Check which providers are available
  if (path === "/api/council/providers" && method === "GET") {
    const providers = ["openai", "anthropic", "google"].map((p) => ({
      id: p,
      name: p.charAt(0).toUpperCase() + p.slice(1),
      available: !!getApiKey(p),
    }));

    return json(providers);
  }

  // POST /api/council/convene - Send prompt to the council
  if (path === "/api/council/convene" && method === "POST") {
    try {
      const body = await req.json();
      const { prompt, members: memberIds, systemPrompt } = body;

      if (!prompt || typeof prompt !== "string") {
        return error("prompt is required", 400);
      }

      // Resolve members from IDs or use default
      let members = DEFAULT_COUNCIL;
      if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
        members = memberIds
          .map((id: string) => AVAILABLE_MEMBERS.find((m) => m.id === id))
          .filter(Boolean) as CouncilMember[];

        if (members.length === 0) {
          return error("No valid members specified", 400);
        }
      }

      // Convene the council
      const result = await conveneCouncil(prompt, members, systemPrompt);

      return json(result);
    } catch (err: any) {
      return error(err.message || "Failed to convene council", 500);
    }
  }

  return null;
}
