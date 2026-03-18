import { describe, expect, test } from "bun:test";
import { sanitizePersistedMessageContent } from "./message-storage";

describe("sanitizePersistedMessageContent", () => {
  test("replaces inline base64 tool-result images with a compact summary", () => {
    const raw = JSON.stringify([
      {
        type: "tool_result",
        tool_use_id: "toolu_image",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "A".repeat(32_000),
            },
          },
        ],
      },
    ]);

    const result = sanitizePersistedMessageContent(raw);
    expect(result.changed).toBe(true);
    expect(result.bytesSaved).toBeGreaterThan(0);

    const parsed = JSON.parse(result.content);
    expect(parsed[0].type).toBe("tool_result");
    expect(parsed[0].content).toContain("tool result omitted from persisted history");
    expect(parsed[0].content).toContain("inline image");
  });

  test("truncates oversized textual tool results but preserves small blocks", () => {
    const raw = JSON.stringify([
      {
        type: "tool_result",
        tool_use_id: "toolu_text",
        content: "line-1\nline-2\n" + "x".repeat(6_000),
      },
      {
        type: "text",
        text: "keep me intact",
      },
    ]);

    const result = sanitizePersistedMessageContent(raw);
    expect(result.changed).toBe(true);

    const parsed = JSON.parse(result.content);
    expect(parsed[0].content).toContain("chars pruned");
    expect(parsed[1].text).toBe("keep me intact");
  });

  test("replaces top-level inline image blocks with text placeholders", () => {
    const raw = JSON.stringify([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "B".repeat(8_000),
        },
      },
    ]);

    const result = sanitizePersistedMessageContent(raw);
    expect(result.changed).toBe(true);

    const parsed = JSON.parse(result.content);
    expect(parsed[0].type).toBe("text");
    expect(parsed[0].text).toContain("inline image omitted");
  });
});
