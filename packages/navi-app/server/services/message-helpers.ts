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
    // Skip verbose logging for stream_event - fires too frequently
    if (data?.type !== "stream_event") {
      console.log(`[Persist] Skipping non-user message: type=${data?.type}`);
    }
    return false;
  }
  if (data.isReplay) {
    console.log(`[Persist] Skipping replay message: uuid=${data.uuid}`);
    return false;
  }

  const hasToolResult = isToolResultContent(data.content);
  const result = data.isSynthetic || data.toolUseResult || hasToolResult;

  console.log(`[Persist] User message check:`, {
    uuid: data.uuid,
    isSynthetic: !!data.isSynthetic,
    hasToolUseResult: !!data.toolUseResult,
    hasToolResultContent: hasToolResult,
    contentType: Array.isArray(data.content) ? 'array' : typeof data.content,
    contentLength: Array.isArray(data.content) ? data.content.length : 0,
    contentBlockTypes: Array.isArray(data.content) ? data.content.map((b: any) => b?.type) : [],
    parentToolUseId: data.parentToolUseId,
    willPersist: result,
  });

  return result;
}

export function safeSend(ws: any, payload: unknown) {
  if (!ws) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {}
}
