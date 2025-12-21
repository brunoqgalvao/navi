import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

interface WorkerInput {
  prompt: string;
  cwd: string;
  resume?: string;
  model?: string;
  allowedTools?: string[];
  sessionId?: string;
}

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

async function runQuery(input: WorkerInput) {
  const { prompt, cwd, resume, model, allowedTools, sessionId } = input;

  try {
    const q = query({
      prompt,
      options: {
        cwd,
        resume,
        model,
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

const input: WorkerInput = JSON.parse(process.argv[2] || "{}");

if (input.prompt) {
  runQuery(input).then(() => process.exit(0));
} else {
  console.error("No input provided");
  process.exit(1);
}
