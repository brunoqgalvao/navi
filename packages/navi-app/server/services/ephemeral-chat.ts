import { json } from "../utils/response";
import { buildClaudeCodeEnv, getClaudeCodeRuntimeOptions } from "../utils/claude-code";
import { resolveNaviClaudeAuth } from "../utils/navi-auth";
import { getSDK } from "../utils/sdk-loader";
import { DEFAULT_CLAUDE_FAST_MODEL, normalizeAnthropicModelValue } from "../../shared/anthropic-models";

export async function handleEphemeralChat(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      prompt,
      systemPrompt,
      model = DEFAULT_CLAUDE_FAST_MODEL,
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
    const normalizedClaudeModel = normalizeAnthropicModelValue(model) || DEFAULT_CLAUDE_FAST_MODEL;

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
    } else {
      const claudeAuth = resolveNaviClaudeAuth(normalizedClaudeModel);

      const directAuthToken = claudeAuth.mode === "zai"
        ? claudeAuth.overrides.authToken
        : claudeAuth.overrides.apiKey;

      if ((claudeAuth.mode === "api_key" || claudeAuth.mode === "zai") && directAuthToken && !useTools) {
        const baseUrl = (claudeAuth.overrides.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
        const authHeaders = claudeAuth.mode === "zai"
          ? { Authorization: `Bearer ${directAuthToken}` }
          : { "x-api-key": directAuthToken };

        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: normalizedClaudeModel,
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
        if (claudeAuth.mode === "none") {
          throw new Error(claudeAuth.error || "No Claude authentication available");
        }
        const { query } = await getSDK();
        const q = query({
          prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
          options: {
            cwd: projectPath || process.cwd(),
            allowedTools: useTools ? ["Read", "Glob", "Grep", "Bash"] : [],
            maxTurns: useTools ? 5 : 1,
            model: normalizedClaudeModel,
            env: buildClaudeCodeEnv(process.env, claudeAuth.overrides),
            ...getClaudeCodeRuntimeOptions(),
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
