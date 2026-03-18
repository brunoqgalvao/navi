const DEFAULT_MAX_TOOL_RESULT_CHARS = 2000;

export interface PersistedMessageSanitizationOptions {
  maxToolResultChars?: number;
}

export interface PersistedMessageSanitizationResult {
  content: string;
  changed: boolean;
  bytesSaved: number;
}

function buildPrunedSummary(originalContent: string, maxPrunedLength: number): string {
  const contentLines = originalContent.split("\n");
  const lineCount = contentLines.length;

  if (lineCount > 3) {
    return contentLines.slice(0, 2).join("\n") + `\n... [${lineCount - 2} lines, ${originalContent.length} chars pruned]`;
  }

  return originalContent.slice(0, Math.max(0, maxPrunedLength - 30)) + `... [${originalContent.length} chars pruned]`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function estimateBase64Bytes(data: string): number {
  const normalizedLength = data.replace(/=+$/g, "").length;
  return Math.floor((normalizedLength * 3) / 4);
}

function collectInlineImageStats(
  value: unknown,
  stats: { count: number; bytes: number; mediaTypes: Set<string> } = {
    count: 0,
    bytes: 0,
    mediaTypes: new Set<string>(),
  }
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectInlineImageStats(item, stats);
    }
    return stats;
  }

  if (!value || typeof value !== "object") {
    return stats;
  }

  const record = value as Record<string, any>;
  if (
    record.type === "image" &&
    record.source?.type === "base64" &&
    typeof record.source?.data === "string"
  ) {
    stats.count += 1;
    stats.bytes += estimateBase64Bytes(record.source.data);
    if (typeof record.source?.media_type === "string" && record.source.media_type.length > 0) {
      stats.mediaTypes.add(record.source.media_type);
    }
    return stats;
  }

  for (const nested of Object.values(record)) {
    collectInlineImageStats(nested, stats);
  }

  return stats;
}

function buildInlineImageSummary(content: unknown): string | null {
  const stats = collectInlineImageStats(content);
  if (stats.count === 0) return null;

  const mediaTypes = Array.from(stats.mediaTypes);
  const mediaLabel =
    mediaTypes.length === 1
      ? mediaTypes[0]
      : mediaTypes.length > 1
        ? `${mediaTypes.length} media types`
        : "unknown media";

  return `${stats.count} inline image${stats.count === 1 ? "" : "s"} (${mediaLabel}, ${formatBytes(stats.bytes)})`;
}

function sanitizeImageBlock(block: Record<string, any>) {
  if (
    block.type !== "image" ||
    block.source?.type !== "base64" ||
    typeof block.source?.data !== "string"
  ) {
    return { block, changed: false, bytesSaved: 0 };
  }

  const bytes = estimateBase64Bytes(block.source.data);
  const mediaType = typeof block.source?.media_type === "string" ? block.source.media_type : "unknown media";
  const replacement = {
    type: "text",
    text: `[inline image omitted from persisted history: ${mediaType}, ${formatBytes(bytes)}]`,
  };
  const nextSerialized = JSON.stringify(replacement);
  return {
    block: replacement,
    changed: true,
    bytesSaved: Math.max(0, JSON.stringify(block).length - nextSerialized.length),
  };
}

function sanitizeToolResultBlock(block: Record<string, any>, maxToolResultChars: number) {
  const originalContent =
    typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");

  const inlineImageSummary = buildInlineImageSummary(block.content);
  if (inlineImageSummary) {
    const summary = `[tool result omitted from persisted history: ${inlineImageSummary}]`;
    return {
      block: {
        ...block,
        content: summary,
        navi_persisted_summary: true,
      },
      changed: true,
      bytesSaved: Math.max(0, originalContent.length - summary.length),
    };
  }

  if (originalContent.length <= maxToolResultChars) {
    return { block, changed: false, bytesSaved: 0 };
  }

  const summary = buildPrunedSummary(originalContent, maxToolResultChars);
  return {
    block: {
      ...block,
      content: summary,
      navi_persisted_summary: true,
    },
    changed: true,
    bytesSaved: Math.max(0, originalContent.length - summary.length),
  };
}

export function sanitizePersistedMessageContent(
  rawContent: string,
  options: PersistedMessageSanitizationOptions = {}
): PersistedMessageSanitizationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return { content: rawContent, changed: false, bytesSaved: 0 };
  }

  if (!Array.isArray(parsed)) {
    return { content: rawContent, changed: false, bytesSaved: 0 };
  }

  const maxToolResultChars = options.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS;
  let changed = false;
  let bytesSaved = 0;

  const sanitizedBlocks = parsed.map((block) => {
    if (!block || typeof block !== "object") return block;

    const record = block as Record<string, any>;

    if (record.type === "tool_result") {
      const result = sanitizeToolResultBlock(record, maxToolResultChars);
      changed ||= result.changed;
      bytesSaved += result.bytesSaved;
      return result.block;
    }

    if (record.type === "image") {
      const result = sanitizeImageBlock(record);
      changed ||= result.changed;
      bytesSaved += result.bytesSaved;
      return result.block;
    }

    return block;
  });

  if (!changed) {
    return { content: rawContent, changed: false, bytesSaved: 0 };
  }

  const nextContent = JSON.stringify(sanitizedBlocks);
  return {
    content: nextContent,
    changed: nextContent !== rawContent,
    bytesSaved: Math.max(0, rawContent.length - nextContent.length) || bytesSaved,
  };
}
