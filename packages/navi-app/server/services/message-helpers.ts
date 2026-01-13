export function hasMessageContent(content: unknown): boolean {
  if (Array.isArray(content)) return content.length > 0;
  if (typeof content === "string") return content.trim().length > 0;
  return false;
}

export function isToolResultContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((block) => block && (block as any).type === "tool_result");
}

export function shouldPersistUserMessage(data: any): boolean {
  if (!data || data.type !== "user") {
    return false;
  }
  if (data.isReplay) {
    return false;
  }

  const hasToolResult = isToolResultContent(data.content);
  const result = data.isSynthetic || data.toolUseResult || hasToolResult;

  return result;
}

export function safeSend(ws: any, payload: unknown) {
  if (!ws) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {}
}
