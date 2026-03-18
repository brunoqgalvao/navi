import { describe, expect, test } from "bun:test";
import { parseInboxItemBlocks } from "./inbox-service";

describe("inbox service", () => {
  test("extracts and strips valid inbox-item blocks", () => {
    const text = [
      "Gmail auth is still blocked.",
      "",
      "```inbox-item",
      '{"title":"Reconnect Gmail","kind":"attention","priority":"high","requiresResponse":true,"responseOptions":["I reconnected it","Retry the workflow"]}',
      "```",
    ].join("\n");

    const parsed = parseInboxItemBlocks(text);

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      title: "Reconnect Gmail",
      kind: "attention",
      priority: "high",
      requiresResponse: true,
    });
    expect(parsed.cleanedText).toBe("Gmail auth is still blocked.");
  });

  test("keeps invalid inbox-item blocks visible in the transcript", () => {
    const text = [
      "Need a decision from the user.",
      "",
      "```inbox-item",
      "{not valid json}",
      "```",
    ].join("\n");

    const parsed = parseInboxItemBlocks(text);

    expect(parsed.items).toHaveLength(0);
    expect(parsed.cleanedText).toContain("```inbox-item");
  });

  test("accepts arrays of inbox items in a single block", () => {
    const text = [
      "Two follow-ups were generated.",
      "",
      "```inbox-item",
      '[{"title":"Approve deploy","kind":"approval"},{"title":"Answer pricing question","kind":"question"}]',
      "```",
    ].join("\n");

    const parsed = parseInboxItemBlocks(text);

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].title).toBe("Approve deploy");
    expect(parsed.items[1].title).toBe("Answer pricing question");
    expect(parsed.cleanedText).toBe("Two follow-ups were generated.");
  });
});
