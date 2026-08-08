const COMPACT_SUMMARY_PREFIXES = [
  "This session is being continued from a previous conversation that ran out of context.",
  "This conversation is being continued from a previous conversation that ran out of context.",
];

function getMessageContent(input: unknown): unknown {
  if (!input || typeof input !== "object") return undefined;
  return (input as { message?: { content?: unknown } }).message?.content;
}

function getTextContent(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;

  const text = content
    .filter((block) => block && (block as { type?: unknown }).type === "text")
    .map((block) => (block as { text?: unknown }).text)
    .filter((text): text is string => typeof text === "string")
    .join("\n");

  return text.trim() ? text : undefined;
}

export function isCompactSummaryContent(content: unknown): boolean {
  const text = getTextContent(content);
  if (!text) return false;

  const normalized = text.trim();
  if (!normalized.includes("Summary:")) return false;

  return COMPACT_SUMMARY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function getSdkUserMessageFlags(input: unknown): {
  isCompactSummary: boolean;
  isReplay: boolean;
  isSynthetic: boolean;
  toolUseResult: unknown;
} {
  if (!input || typeof input !== "object") {
    return {
      isCompactSummary: false,
      isReplay: false,
      isSynthetic: false,
      toolUseResult: undefined,
    };
  }

  const data = input as {
    isCompactSummary?: unknown;
    isReplay?: unknown;
    isSynthetic?: unknown;
    isVisibleInTranscriptOnly?: unknown;
    tool_use_result?: unknown;
    toolUseResult?: unknown;
  };

  const content = getMessageContent(data);
  const isCompactSummary =
    data.isCompactSummary === true ||
    data.isVisibleInTranscriptOnly === true ||
    isCompactSummaryContent(content);

  return {
    isCompactSummary,
    isReplay: data.isReplay === true,
    isSynthetic: data.isSynthetic === true || isCompactSummary,
    toolUseResult: data.tool_use_result ?? data.toolUseResult,
  };
}

export function shouldDisplayOrPersistUserMessage(input: {
  content: unknown;
  isCompactSummary?: boolean;
  isSynthetic?: boolean;
  toolUseResult?: unknown;
}): boolean {
  if (input.isCompactSummary === true || isCompactSummaryContent(input.content)) {
    return false;
  }

  const hasToolResult =
    Array.isArray(input.content) &&
    input.content.some((block) => block && (block as { type?: unknown }).type === "tool_result");

  return Boolean(input.toolUseResult) || hasToolResult;
}
