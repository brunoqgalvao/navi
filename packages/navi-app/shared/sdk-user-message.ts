const COMPACT_SUMMARY_PREFIXES = [
  "This session is being continued from a previous conversation that ran out of context.",
  "This conversation is being continued from a previous conversation that ran out of context.",
];

function getMessageContent(input: unknown): unknown {
  if (!input || typeof input !== "object") return undefined;
  return (input as { message?: { content?: unknown } }).message?.content;
}

export function isCompactSummaryContent(content: unknown): boolean {
  if (typeof content !== "string") return false;

  const normalized = content.trim();
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
    toolUseResult: data.tool_use_result,
  };
}

export function shouldDisplayOrPersistUserMessage(input: {
  content: unknown;
  isCompactSummary?: boolean;
  isSynthetic?: boolean;
  toolUseResult?: unknown;
}): boolean {
  const hasToolResult =
    Array.isArray(input.content) &&
    input.content.some((block) => block && (block as { type?: unknown }).type === "tool_result");

  return (
    input.isSynthetic === true ||
    input.isCompactSummary === true ||
    Boolean(input.toolUseResult) ||
    hasToolResult ||
    isCompactSummaryContent(input.content)
  );
}
