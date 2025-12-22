import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import * as readline from "readline";

interface WorkerInput {
  prompt: string;
  cwd: string;
  resume?: string;
  model?: string;
  allowedTools?: string[];
  sessionId?: string;
  permissionSettings?: {
    autoAcceptAll: boolean;
    requireConfirmation: string[];
  };
}

const pendingPermissions = new Map<string, (result: { approved: boolean; approveAll?: boolean }) => void>();

function send(msg: any) {
  console.log(JSON.stringify(msg));
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

let sessionApprovedAll = false;

async function runQuery(input: WorkerInput) {
  const { prompt, cwd, resume, model, allowedTools, sessionId, permissionSettings } = input;
  
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  console.error(`[Worker] Auth method: ${hasApiKey ? "API_KEY" : "OAuth"}`);
  if (hasApiKey) {
    console.error(`[Worker] API Key prefix: ${process.env.ANTHROPIC_API_KEY?.slice(0, 10)}...`);
  }

  const canUseTool = async (
    toolName: string,
    toolInput: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string }
  ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> } | { behavior: 'deny'; message: string; interrupt?: boolean }> => {
    if (permissionSettings?.autoAcceptAll) {
      return { behavior: 'allow', updatedInput: toolInput };
    }

    if (sessionApprovedAll) {
      return { behavior: 'allow', updatedInput: toolInput };
    }

    if (!permissionSettings?.requireConfirmation?.includes(toolName)) {
      return { behavior: 'allow', updatedInput: toolInput };
    }

    const requestId = crypto.randomUUID();

    let inputPreview = "";
    if (toolName === "Write" || toolName === "Edit") {
      inputPreview = `File: ${(toolInput as any).file_path || "unknown"}`;
    } else if (toolName === "Bash") {
      inputPreview = `Command: ${((toolInput as any).command || "").slice(0, 100)}`;
    }

    send({
      type: "permission_request",
      requestId,
      toolName,
      toolInput,
      message: `Claude wants to use ${toolName}. ${inputPreview}`,
    });

    const result = await new Promise<{ approved: boolean; approveAll?: boolean }>((resolve) => {
      pendingPermissions.set(requestId, resolve);
    });

    if (result.approveAll) {
      sessionApprovedAll = true;
    }

    if (!result.approved) {
      return { behavior: 'deny', message: 'User denied permission', interrupt: false };
    }

    return { behavior: 'allow', updatedInput: toolInput };
  };

  try {
    console.error(`[Worker] Starting query with cwd: ${cwd}`);
    console.error(`[Worker] permissionSettings:`, permissionSettings);
    
    const allTools = allowedTools || [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "TodoWrite",
    ];
    
    const requireConfirmation = permissionSettings?.requireConfirmation || [];
    const autoAllowedTools = allTools.filter(t => !requireConfirmation.includes(t));
    
    console.error(`[Worker] allTools:`, allTools);
    console.error(`[Worker] requireConfirmation:`, requireConfirmation);
    console.error(`[Worker] autoAllowedTools:`, autoAllowedTools);
    
    const q = query({
      prompt,
      options: {
        cwd,
        resume,
        model,
        tools: allTools,
        allowedTools: permissionSettings?.autoAcceptAll ? allTools : autoAllowedTools,
        permissionMode: "default",
        canUseTool,
        settingSources: ['project'] as const,
      },
    });

    let lastAssistantContent: any[] = [];
    let resultData: any = null;

    for await (const msg of q) {
      const formatted = formatMessage(msg, sessionId);
      send({ type: "message", data: formatted });

      if (msg.type === "assistant") {
        lastAssistantContent = msg.message.content;
      }
      if (msg.type === "result") {
        resultData = msg;
      }
    }

    send({
      type: "complete",
      sessionId,
      lastAssistantContent,
      resultData: resultData ? {
        session_id: resultData.session_id,
        model: resultData.model,
        total_cost_usd: resultData.total_cost_usd,
        num_turns: resultData.num_turns,
        usage: resultData.usage,
      } : null,
    });

  } catch (error) {
    send({
      type: "error",
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === "permission_response" && msg.requestId) {
      const resolve = pendingPermissions.get(msg.requestId);
      if (resolve) {
        resolve({ approved: msg.approved, approveAll: msg.approveAll });
        pendingPermissions.delete(msg.requestId);
      }
    }
  } catch {}
});

const input: WorkerInput = JSON.parse(process.argv[2] || "{}");

if (input.prompt) {
  runQuery(input);
} else {
  console.error("No input provided");
  process.exit(1);
}
