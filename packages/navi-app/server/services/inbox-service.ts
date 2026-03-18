import { randomUUID } from "crypto";
import {
  inboxItems,
  messages,
  sessions,
  workflows,
  type InboxItem,
  type InboxItemKind,
  type InboxItemPriority,
  type InboxItemStatus,
} from "../db";

const INBOX_ITEM_BLOCK_REGEX = /```inbox-item[^\n]*\n([\s\S]*?)```/gi;

const VALID_KINDS = new Set<InboxItemKind>([
  "report",
  "question",
  "attention",
  "approval",
  "delivery",
]);

const VALID_PRIORITIES = new Set<InboxItemPriority>([
  "low",
  "medium",
  "high",
  "urgent",
]);

const VALID_STATUSES = new Set<InboxItemStatus>([
  "open",
  "acknowledged",
  "resolved",
  "dismissed",
]);

export interface InboxDirectiveDraft {
  title: string;
  body: string | null;
  kind: InboxItemKind;
  status: InboxItemStatus;
  priority: InboxItemPriority;
  requiresResponse: boolean;
  responseOptions: unknown;
  workItemId: string | null;
  metadata: Record<string, unknown>;
}

interface SessionInboxContext {
  sessionId: string | null;
  sessionTitle: string | null;
  rootSessionId: string | null;
  workflowId: string | null;
  workflowName: string | null;
  workItemId: string | null;
  agentId: string | null;
}

export interface ProcessAssistantInboxDirectivesResult {
  createdItems: InboxItem[];
  sanitizedContent: unknown;
  contentChanged: boolean;
}

interface CreateProjectInboxItemOptions {
  projectId: string;
  sessionId?: string | null;
  source?: "assistant-directive" | "workflow-system";
  item: InboxDirectiveDraft;
  dedupeKey?: string | null;
}

function safeParseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  const parsed = safeParseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function normalizeEnum<T extends string>(
  value: unknown,
  valid: Set<T>,
  fallback: T
): T {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase() as T;
  return valid.has(normalized) ? normalized : fallback;
}

function normalizeResponseOptions(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (
          entry &&
          typeof entry === "object" &&
          typeof (entry as { label?: unknown }).label === "string"
        ) {
          return {
            ...entry,
            label: (entry as { label: string }).label.trim(),
          };
        }
        return null;
      })
      .filter(Boolean);
  }
  return value;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extractSessionInboxContext(sessionId?: string | null): SessionInboxContext {
  if (!sessionId) {
    return {
      sessionId: null,
      sessionTitle: null,
      rootSessionId: null,
      workflowId: null,
      workflowName: null,
      workItemId: null,
      agentId: null,
    };
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return {
      sessionId,
      sessionTitle: null,
      rootSessionId: null,
      workflowId: null,
      workflowName: null,
      workItemId: null,
      agentId: null,
    };
  }

  const rootSessionId = session.root_session_id || session.id;
  const workflow =
    (session.workflow_id ? workflows.get(session.workflow_id) : null) ||
    workflows.getByRootSession(rootSessionId);

  return {
    sessionId: session.id,
    sessionTitle: session.title,
    rootSessionId,
    workflowId: workflow?.id ?? session.workflow_id ?? null,
    workflowName: workflow?.name ?? null,
    workItemId: session.work_item_id ?? null,
    agentId: session.agent_id ?? null,
  };
}

function defaultDedupeKey(
  context: SessionInboxContext,
  item: InboxDirectiveDraft
): string | null {
  const titleSlug = slugify(item.title);
  if (!titleSlug) return null;
  if (context.workflowId) {
    return `workflow:${context.workflowId}:inbox:${titleSlug}`;
  }
  if (context.sessionId) {
    return `session:${context.sessionId}:inbox:${titleSlug}`;
  }
  return null;
}

function findExistingOpenInboxItem(projectId: string, dedupeKey: string): InboxItem | null {
  const activeStatuses = new Set<InboxItemStatus>(["open", "acknowledged"]);
  for (const item of inboxItems.listByProject(projectId)) {
    if (!activeStatuses.has(item.status)) continue;
    const metadata = parseJsonObject(item.metadata);
    if (metadata.dedupeKey === dedupeKey) {
      return item;
    }
  }
  return null;
}

function withInboxDefaults(
  item: InboxDirectiveDraft,
  context: SessionInboxContext,
  source: "assistant-directive" | "workflow-system",
  explicitDedupeKey?: string | null
): {
  kind: InboxItemKind;
  title: string;
  body: string | null;
  status: InboxItemStatus;
  priority: InboxItemPriority;
  sourceAgentId: string | null;
  sourceSessionId: string | null;
  workItemId: string | null;
  requiresResponse: boolean;
  responseOptions: unknown;
  metadata: Record<string, unknown>;
  dedupeKey: string | null;
} {
  const dedupeKey =
    explicitDedupeKey ||
    (typeof item.metadata.dedupeKey === "string" ? item.metadata.dedupeKey : null) ||
    defaultDedupeKey(context, item);

  return {
    kind: item.kind,
    title: item.title,
    body: item.body,
    status: item.status,
    priority: item.priority,
    sourceAgentId: context.agentId,
    sourceSessionId: context.sessionId,
    workItemId: item.workItemId ?? context.workItemId,
    requiresResponse: item.requiresResponse,
    responseOptions: item.responseOptions,
    metadata: {
      source,
      sessionId: context.sessionId,
      sessionTitle: context.sessionTitle,
      rootSessionId: context.rootSessionId,
      workflowId: context.workflowId,
      workflowName: context.workflowName,
      workItemId: item.workItemId ?? context.workItemId,
      ...item.metadata,
      dedupeKey,
    },
    dedupeKey,
  };
}

function createFallbackAssistantText(): unknown {
  return [{ type: "text", text: "A follow-up item was added to your inbox." }];
}

function normalizeInboxDirective(candidate: unknown): InboxDirectiveDraft | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) return null;

  const body =
    record.body === null || record.body === undefined
      ? null
      : String(record.body).trim() || null;

  const metadata =
    record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? { ...(record.metadata as Record<string, unknown>) }
      : {};

  if (typeof record.dedupeKey === "string" && record.dedupeKey.trim()) {
    metadata.dedupeKey = record.dedupeKey.trim();
  }

  return {
    title,
    body,
    kind: normalizeEnum(record.kind, VALID_KINDS, "attention"),
    status: normalizeEnum(record.status, VALID_STATUSES, "open"),
    priority: normalizeEnum(record.priority, VALID_PRIORITIES, "medium"),
    requiresResponse: Boolean(record.requiresResponse),
    responseOptions: normalizeResponseOptions(record.responseOptions),
    workItemId:
      typeof record.workItemId === "string" && record.workItemId.trim()
        ? record.workItemId.trim()
        : null,
    metadata,
  };
}

function normalizeInboxDirectives(payload: unknown): InboxDirectiveDraft[] {
  if (Array.isArray(payload)) {
    return payload
      .map(normalizeInboxDirective)
      .filter(Boolean) as InboxDirectiveDraft[];
  }

  const single = normalizeInboxDirective(payload);
  return single ? [single] : [];
}

export function parseInboxItemBlocks(text: string): {
  items: InboxDirectiveDraft[];
  cleanedText: string;
} {
  const items: InboxDirectiveDraft[] = [];
  const cleanedText = text.replace(INBOX_ITEM_BLOCK_REGEX, (fullMatch, block) => {
    const parsed = safeParseJson(String(block).trim());
    const normalized = normalizeInboxDirectives(parsed);
    if (normalized.length === 0) {
      return fullMatch;
    }
    items.push(...normalized);
    return "";
  });

  return {
    items,
    cleanedText: cleanedText.replace(/\n{3,}/g, "\n\n").trim(),
  };
}

function extractInboxItemsFromAssistantContent(content: unknown): {
  items: InboxDirectiveDraft[];
  cleanedContent: unknown;
  contentChanged: boolean;
} {
  if (typeof content === "string") {
    const parsed = parseInboxItemBlocks(content);
    return {
      items: parsed.items,
      cleanedContent: parsed.cleanedText || createFallbackAssistantText(),
      contentChanged: parsed.items.length > 0,
    };
  }

  if (!Array.isArray(content)) {
    return {
      items: [],
      cleanedContent: content,
      contentChanged: false,
    };
  }

  const items: InboxDirectiveDraft[] = [];
  let contentChanged = false;
  const cleanedBlocks = content.flatMap((block) => {
    if (!block || typeof block !== "object" || block.type !== "text" || typeof block.text !== "string") {
      return [block];
    }

    const parsed = parseInboxItemBlocks(block.text);
    if (parsed.items.length === 0) {
      return [block];
    }

    items.push(...parsed.items);
    contentChanged = true;

    if (!parsed.cleanedText) {
      return [];
    }

    return [{ ...block, text: parsed.cleanedText }];
  });

  return {
    items,
    cleanedContent: cleanedBlocks.length > 0 ? cleanedBlocks : createFallbackAssistantText(),
    contentChanged,
  };
}

export function createProjectInboxItem({
  projectId,
  sessionId = null,
  source = "workflow-system",
  item,
  dedupeKey = null,
}: CreateProjectInboxItemOptions): InboxItem {
  const context = extractSessionInboxContext(sessionId);
  const normalized = withInboxDefaults(item, context, source, dedupeKey);
  const existing =
    normalized.dedupeKey ? findExistingOpenInboxItem(projectId, normalized.dedupeKey) : null;

  if (existing) {
    const nextStatus =
      existing.status === "acknowledged" && normalized.status === "open"
        ? "acknowledged"
        : normalized.status;

    inboxItems.update(existing.id, {
      kind: normalized.kind,
      title: normalized.title,
      body: normalized.body,
      status: nextStatus,
      priority: normalized.priority,
      source_agent_id: normalized.sourceAgentId,
      source_session_id: normalized.sourceSessionId,
      work_item_id: normalized.workItemId,
      requires_response: normalized.requiresResponse ? 1 : 0,
      response_options:
        normalized.responseOptions === null
          ? null
          : JSON.stringify(normalized.responseOptions),
      metadata: JSON.stringify(normalized.metadata),
      resolved_at: nextStatus === "resolved" || nextStatus === "dismissed" ? Date.now() : null,
    });
    return inboxItems.get(existing.id)!;
  }

  const now = Date.now();
  const created: InboxItem = {
    id: randomUUID(),
    project_id: projectId,
    kind: normalized.kind,
    title: normalized.title,
    body: normalized.body,
    status: normalized.status,
    priority: normalized.priority,
    source_agent_id: normalized.sourceAgentId,
    source_session_id: normalized.sourceSessionId,
    work_item_id: normalized.workItemId,
    requires_response: normalized.requiresResponse ? 1 : 0,
    response_options:
      normalized.responseOptions === null
        ? null
        : JSON.stringify(normalized.responseOptions),
    metadata: JSON.stringify(normalized.metadata),
    created_at: now,
    updated_at: now,
    resolved_at:
      normalized.status === "resolved" || normalized.status === "dismissed"
        ? now
        : null,
  };

  inboxItems.create(created);
  return inboxItems.get(created.id)!;
}

export function processAssistantInboxDirectives(options: {
  projectId: string;
  sessionId: string;
  messageId?: string | null;
  content: unknown;
}): ProcessAssistantInboxDirectivesResult {
  const extracted = extractInboxItemsFromAssistantContent(options.content);
  if (extracted.items.length === 0) {
    return {
      createdItems: [],
      sanitizedContent: options.content,
      contentChanged: false,
    };
  }

  const createdItems = extracted.items.map((item) =>
    createProjectInboxItem({
      projectId: options.projectId,
      sessionId: options.sessionId,
      source: "assistant-directive",
      item,
    })
  );

  if (options.messageId && extracted.contentChanged) {
    messages.update(options.messageId, JSON.stringify(extracted.cleanedContent));
  }

  return {
    createdItems,
    sanitizedContent: extracted.cleanedContent,
    contentChanged: extracted.contentChanged,
  };
}
