import { writable } from "svelte/store";
import type { TextReference, TerminalReference, ChatReference } from "./types";

function createReferencesStore() {
  const { subscribe, set, update } = writable<TextReference[]>([]);

  return {
    subscribe,
    add: (ref: TextReference) =>
      update((refs) => {
        // Prevent duplicates by checking text + source path/terminalId
        if (ref.source.type === "terminal") {
          if (refs.some((r) => r.source.type === "terminal" && r.source.terminalId === ref.source.terminalId)) {
            return refs;
          }
        } else if (refs.some((r) => r.text === ref.text && r.source.path === ref.source.path)) {
          return refs;
        }
        return [...refs, ref];
      }),
    remove: (id: string) => update((refs) => refs.filter((r) => r.id !== id)),
    clear: () => set([]),
    set,
  };
}

export const textReferences = createReferencesStore();

// Terminal references store for @terminal mentions
function createTerminalReferencesStore() {
  const { subscribe, set, update } = writable<TerminalReference[]>([]);

  return {
    subscribe,
    add: (ref: TerminalReference) =>
      update((refs) => {
        // Prevent duplicate terminal references
        if (refs.some((r) => r.terminalId === ref.terminalId)) {
          return refs;
        }
        return [...refs, ref];
      }),
    remove: (id: string) => update((refs) => refs.filter((r) => r.id !== id)),
    removeByTerminalId: (terminalId: string) =>
      update((refs) => refs.filter((r) => r.terminalId !== terminalId)),
    clear: () => set([]),
    set,
  };
}

export const terminalReferences = createTerminalReferencesStore();

// Chat references store for @chat mentions - lazy loaded
function createChatReferencesStore() {
  const { subscribe, set, update } = writable<ChatReference[]>([]);

  return {
    subscribe,
    add: (ref: ChatReference) =>
      update((refs) => {
        // Prevent duplicate chat references
        if (refs.some((r) => r.sessionId === ref.sessionId)) {
          return refs;
        }
        return [...refs, ref];
      }),
    remove: (id: string) => update((refs) => refs.filter((r) => r.id !== id)),
    removeBySessionId: (sessionId: string) =>
      update((refs) => refs.filter((r) => r.sessionId !== sessionId)),
    clear: () => set([]),
    set,
  };
}

export const chatReferences = createChatReferencesStore();
