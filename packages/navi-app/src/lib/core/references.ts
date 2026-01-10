/**
 * Unified Reference System
 *
 * All @ mentions (files, terminals, chats, text selections) go through
 * this unified system. Each reference type implements the Reference interface.
 */

import { writable, derived, get } from "svelte/store";
import type {
  Reference,
  ReferenceType,
  FileReferenceData,
  TextReferenceData,
  TerminalReferenceData,
  ChatReferenceData,
  IntegrationReferenceData,
  IntegrationProvider,
  IntegrationService,
} from "./types";

// =============================================================================
// REFERENCE FACTORIES
// =============================================================================

let refCounter = 0;

function generateRefId(type: ReferenceType): string {
  return `${type}-${Date.now()}-${++refCounter}`;
}

/**
 * Create a file reference
 */
export function createFileReference(
  path: string,
  name: string,
  isDirectory = false
): Reference<FileReferenceData> {
  return {
    id: generateRefId("file"),
    type: "file",
    label: name,
    icon: isDirectory ? "folder" : "file",
    data: { path, name, isDirectory },
    toPromptContent() {
      return isDirectory
        ? `<directory path="${path}"></directory>`
        : `<file path="${path}"></file>`;
    },
  };
}

/**
 * Create a text selection reference
 */
export function createTextReference(
  text: string,
  source: TextReferenceData["source"]
): Reference<TextReferenceData> {
  const truncatedText = text.length > 50 ? text.slice(0, 47) + "..." : text;
  const label = source.path
    ? `${source.path.split("/").pop()}:${source.startLine ?? ""}`
    : source.type === "terminal"
      ? source.terminalName || "Terminal"
      : "Selection";

  return {
    id: generateRefId("text"),
    type: "text",
    label,
    icon: source.type === "terminal" ? "terminal" : "text-select",
    data: { text, truncatedText, source },
    toPromptContent() {
      const { source, text } = this.data;
      if (source.path) {
        const lines = source.startLine
          ? ` lines ${source.startLine}-${source.endLine}`
          : "";
        return `<selection from="${source.path}"${lines}>\n${text}\n</selection>`;
      }
      if (source.type === "terminal") {
        return `<terminal-output name="${source.terminalName}">\n${text}\n</terminal-output>`;
      }
      return `<selection>\n${text}\n</selection>`;
    },
  };
}

/**
 * Create a terminal reference
 */
export function createTerminalReference(
  terminalId: string,
  name: string,
  bufferLines: number
): Reference<TerminalReferenceData> {
  return {
    id: generateRefId("terminal"),
    type: "terminal",
    label: name,
    icon: "terminal",
    data: { terminalId, name, bufferLines },
    toPromptContent() {
      // Content is fetched at send time from the terminal buffer
      return `<terminal-buffer name="${this.data.name}" lines="${this.data.bufferLines}">{{TERMINAL_BUFFER:${this.data.terminalId}}}</terminal-buffer>`;
    },
  };
}

/**
 * Create a chat reference
 */
export function createChatReference(
  sessionId: string,
  title: string,
  messageCount: number,
  projectName: string | null,
  updatedAt: number
): Reference<ChatReferenceData> {
  return {
    id: generateRefId("chat"),
    type: "chat",
    label: title || "Untitled Chat",
    icon: "message-square",
    data: { sessionId, title, messageCount, projectName, updatedAt },
    toPromptContent() {
      // Content is fetched at send time from the session
      return `<chat-context session="${this.data.sessionId}" title="${this.data.title}">{{CHAT_CONTEXT:${this.data.sessionId}}}</chat-context>`;
    },
  };
}

/**
 * Create an integration reference (OAuth-connected service)
 */
export function createIntegrationReference(
  provider: IntegrationProvider,
  service: IntegrationService,
  integrationId: string,
  resourceLabel: string,
  resourceId?: string,
  query?: string
): Reference<IntegrationReferenceData> {
  // Icons for different services
  const serviceIcons: Record<IntegrationService, string> = {
    gmail: "mail",
    sheets: "table",
    drive: "hard-drive",
    calendar: "calendar",
    repos: "git-branch",
    issues: "circle-dot",
    prs: "git-pull-request",
    pages: "file-text",
    databases: "database",
    channels: "hash",
    messages: "send",
  };

  return {
    id: generateRefId("integration"),
    type: "integration",
    label: resourceLabel,
    icon: serviceIcons[service] || "cloud",
    data: { provider, service, integrationId, resourceId, resourceLabel, query },
    toPromptContent() {
      // This returns a placeholder that gets resolved by the server/skill
      // The actual content is fetched via the integrations CLI
      const parts = [`provider="${this.data.provider}"`, `service="${this.data.service}"`];
      if (this.data.resourceId) parts.push(`resource="${this.data.resourceId}"`);
      if (this.data.query) parts.push(`query="${this.data.query}"`);
      return `<integration-context ${parts.join(" ")}>{{INTEGRATION:${this.data.provider}:${this.data.service}:${this.data.resourceId || ""}:${this.data.query || ""}}}</integration-context>`;
    },
  };
}

// =============================================================================
// UNIFIED REFERENCES STORE
// =============================================================================

function createReferencesStore() {
  const { subscribe, set, update } = writable<Reference[]>([]);

  return {
    subscribe,

    /**
     * Add a reference (prevents duplicates based on type + data)
     */
    add(ref: Reference): void {
      update((refs) => {
        // Check for duplicates based on type
        const isDuplicate = refs.some((existing) => {
          if (existing.type !== ref.type) return false;

          switch (ref.type) {
            case "file":
              return (
                (existing.data as FileReferenceData).path ===
                (ref.data as FileReferenceData).path
              );
            case "text":
              return (
                (existing.data as TextReferenceData).text ===
                (ref.data as TextReferenceData).text
              );
            case "terminal":
              return (
                (existing.data as TerminalReferenceData).terminalId ===
                (ref.data as TerminalReferenceData).terminalId
              );
            case "chat":
              return (
                (existing.data as ChatReferenceData).sessionId ===
                (ref.data as ChatReferenceData).sessionId
              );
            case "integration":
              const existingInt = existing.data as IntegrationReferenceData;
              const newInt = ref.data as IntegrationReferenceData;
              return (
                existingInt.integrationId === newInt.integrationId &&
                existingInt.service === newInt.service &&
                existingInt.resourceId === newInt.resourceId
              );
            default:
              return false;
          }
        });

        if (isDuplicate) return refs;
        return [...refs, ref];
      });
    },

    /**
     * Remove a reference by ID
     */
    remove(id: string): void {
      update((refs) => refs.filter((r) => r.id !== id));
    },

    /**
     * Remove all references of a specific type
     */
    removeByType(type: ReferenceType): void {
      update((refs) => refs.filter((r) => r.type !== type));
    },

    /**
     * Clear all references
     */
    clear(): void {
      set([]);
    },

    /**
     * Get all references as prompt content
     */
    toPromptContent(): string {
      const refs = get({ subscribe });
      if (refs.length === 0) return "";

      return refs.map((r) => r.toPromptContent()).join("\n\n");
    },

    /**
     * Get references by type
     */
    getByType(type: ReferenceType): Reference[] {
      return get({ subscribe }).filter((r) => r.type === type);
    },
  };
}

export const references = createReferencesStore();

// =============================================================================
// DERIVED STORES (for backwards compatibility)
// =============================================================================

/**
 * File references only
 */
export const fileReferences = derived(references, ($refs) =>
  $refs.filter((r): r is Reference<FileReferenceData> => r.type === "file")
);

/**
 * Text references only
 */
export const textReferences = derived(references, ($refs) =>
  $refs.filter((r): r is Reference<TextReferenceData> => r.type === "text")
);

/**
 * Terminal references only
 */
export const terminalReferences = derived(references, ($refs) =>
  $refs.filter((r): r is Reference<TerminalReferenceData> => r.type === "terminal")
);

/**
 * Chat references only
 */
export const chatReferences = derived(references, ($refs) =>
  $refs.filter((r): r is Reference<ChatReferenceData> => r.type === "chat")
);

/**
 * Integration references only
 */
export const integrationReferences = derived(references, ($refs) =>
  $refs.filter((r): r is Reference<IntegrationReferenceData> => r.type === "integration")
);

/**
 * Total reference count
 */
export const referenceCount = derived(references, ($refs) => $refs.length);

// =============================================================================
// LEGACY COMPATIBILITY ADAPTERS
// =============================================================================

/**
 * Convert old TextReference format to new Reference
 * @deprecated Use createTextReference directly
 */
export function fromLegacyTextReference(legacy: {
  id: string;
  text: string;
  truncatedText: string;
  source: TextReferenceData["source"];
}): Reference<TextReferenceData> {
  const ref = createTextReference(legacy.text, legacy.source);
  return { ...ref, id: legacy.id };
}

/**
 * Convert old TerminalReference format to new Reference
 * @deprecated Use createTerminalReference directly
 */
export function fromLegacyTerminalReference(legacy: {
  id: string;
  terminalId: string;
  name: string;
  bufferLines: number;
}): Reference<TerminalReferenceData> {
  const ref = createTerminalReference(
    legacy.terminalId,
    legacy.name,
    legacy.bufferLines
  );
  return { ...ref, id: legacy.id };
}

/**
 * Convert old ChatReference format to new Reference
 * @deprecated Use createChatReference directly
 */
export function fromLegacyChatReference(legacy: {
  id: string;
  sessionId: string;
  title: string;
  messageCount: number;
  projectName: string | null;
  updatedAt: number;
}): Reference<ChatReferenceData> {
  const ref = createChatReference(
    legacy.sessionId,
    legacy.title,
    legacy.messageCount,
    legacy.projectName,
    legacy.updatedAt
  );
  return { ...ref, id: legacy.id };
}
