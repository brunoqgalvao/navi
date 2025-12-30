import { writable } from "svelte/store";
import type { TextReference } from "./types";

function createReferencesStore() {
  const { subscribe, set, update } = writable<TextReference[]>([]);

  return {
    subscribe,
    add: (ref: TextReference) =>
      update((refs) => {
        // Prevent duplicates by checking text + source path
        if (refs.some((r) => r.text === ref.text && r.source.path === ref.source.path)) {
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
