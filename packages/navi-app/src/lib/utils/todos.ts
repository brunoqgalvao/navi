import type { TodoItem } from "../stores/types";

/**
 * TodoWrite inputs can arrive malformed — models occasionally emit `todos`
 * as a stringified JSON array instead of an array. Normalize to a real
 * array so render sites never call array methods on a string.
 */
export function normalizeTodos(value: unknown): TodoItem[] {
  if (Array.isArray(value)) return value as TodoItem[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as TodoItem[];
    } catch {
      // fall through — not parseable JSON
    }
  }
  return [];
}
