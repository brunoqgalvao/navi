import { describe, expect, test } from "bun:test";

import { normalizeTodos } from "./todos";
import type { TodoItem } from "../stores/types";

describe("normalizeTodos", () => {
  const todos: TodoItem[] = [
    { content: "Do the thing", status: "in_progress", activeForm: "Doing the thing" },
    { content: "Do the other thing", status: "pending" },
  ];

  test("passes arrays through unchanged", () => {
    expect(normalizeTodos(todos)).toEqual(todos);
  });

  test("parses a stringified JSON array (malformed model output)", () => {
    expect(normalizeTodos(JSON.stringify(todos))).toEqual(todos);
  });

  test("returns [] for non-array strings", () => {
    expect(normalizeTodos("not json")).toEqual([]);
    expect(normalizeTodos('{"content":"x"}')).toEqual([]);
  });

  test("returns [] for null, undefined, and objects", () => {
    expect(normalizeTodos(null)).toEqual([]);
    expect(normalizeTodos(undefined)).toEqual([]);
    expect(normalizeTodos({ 0: todos[0] })).toEqual([]);
  });
});
