import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const PORT = 3001;

interface ClientMessage {
  type: "query" | "cancel";
  prompt?: string;
  workingDirectory?: string;
  sessionId?: string;
  allowedTools?: string[];
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Claude Code UI Server", { status: 200 });
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

async function handleQuery(
  ws: any,
  data: ClientMessage
) {
  const { prompt, workingDirectory, sessionId, allowedTools } = data;

  console.log(`Query: "${prompt}" in ${workingDirectory || process.cwd()}`);

  try {
    const q = query({
      prompt: prompt!,
      options: {
        cwd: workingDirectory || process.cwd(),
        resume: sessionId,
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

    for await (const msg of q) {
      ws.send(JSON.stringify(formatMessage(msg)));
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
      };

    case "user":
      return {
        type: "user",
        content: msg.message.content,
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

    default:
      return { type: "unknown", raw: msg };
  }
}

console.log(`Claude Code UI Server running on http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
