import { z } from "zod";

export const UsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  costUsd: z.number().optional(),
  model: z.string(),
  raw: z.unknown(),
});

export type Usage = z.infer<typeof UsageSchema>;

export type PermissionDecision = "allow" | "allow-session" | "deny";

const sessionId = z.string();

export const GatewayEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text-delta"),
    sessionId,
    text: z.string(),
  }),
  z.object({
    type: z.literal("thinking-delta"),
    sessionId,
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool-start"),
    sessionId,
    toolId: z.string(),
    tool: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal("tool-output"),
    sessionId,
    toolId: z.string(),
    chunk: z.string(),
  }),
  z.object({
    type: z.literal("tool-end"),
    sessionId,
    toolId: z.string(),
    result: z.unknown().optional(),
    isError: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("permission-request"),
    sessionId,
    requestId: z.string(),
    tool: z.string(),
    description: z.string(),
    input: z.unknown(),
    options: z.array(z.enum(["allow", "allow-session", "deny"])),
  }),
  z.object({
    type: z.literal("usage"),
    sessionId,
    usage: UsageSchema,
  }),
  z.object({
    type: z.literal("session-meta"),
    sessionId,
    backendSessionId: z.string().optional(),
    model: z.string().optional(),
    cwd: z.string().optional(),
  }),
  z.object({
    type: z.literal("agent-spawned"),
    sessionId,
    childSessionId: z.string(),
    backend: z.string(),
    task: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    sessionId,
    message: z.string(),
    detail: z.unknown().optional(),
    fatal: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("done"),
    sessionId,
    reason: z.enum(["complete", "cancelled", "error"]),
  }),
]);

export type GatewayEvent = z.infer<typeof GatewayEventSchema>;
