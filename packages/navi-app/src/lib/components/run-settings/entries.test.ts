import { describe, expect, test } from "bun:test";
import {
  entryMeta,
  resolveEntryForSelection,
  compactModelLabel,
  reasoningLabel,
} from "./entries";

describe("resolveEntryForSelection", () => {
  test("codex and gemini follow the backend", () => {
    expect(resolveEntryForSelection("codex", null, "gpt-5.6-sol")).toBe("codex");
    expect(resolveEntryForSelection("gemini", null, "gemini-3-pro")).toBe("gemini");
  });

  test("a zai model on the claude backend resolves to zai", () => {
    expect(resolveEntryForSelection("claude", { provider: "zai" } as any, "glm-5.2")).toBe("zai");
  });

  test("a zai model identified only by its value still resolves to zai", () => {
    expect(resolveEntryForSelection("claude", null, "glm-5.2")).toBe("zai");
  });

  test("anything else on the claude backend is claude", () => {
    expect(resolveEntryForSelection("claude", null, "claude-fable-5")).toBe("claude");
  });
});

describe("compactModelLabel", () => {
  test("uses the curated short label when there is one", () => {
    expect(compactModelLabel("claude-fable-5")).toBe("Fable 5");
  });

  // The trailing .replace(/-/g," ") also eats the hyphen the ^gpt- rule just inserted.
  // Pinned so a future "tidy-up" of the chain is a visible change, not a silent one.
  test("prettifies a raw gpt slug", () => {
    expect(compactModelLabel("gpt-5.6-sol")).toBe("GPT 5.6 sol");
  });

  test("falls back to Model when there is nothing", () => {
    expect(compactModelLabel(null)).toBe("Model");
  });
});

describe("entryMeta", () => {
  test("covers every menu entry", () => {
    expect(Object.keys(entryMeta).sort()).toEqual(["claude", "codex", "gemini", "zai"]);
  });

  // Tailwind purges anything it cannot see as a literal and there is no safelist in
  // tailwind.config.js, so these must be complete class strings, never interpolated fragments.
  test("accents are complete class strings", () => {
    for (const meta of Object.values(entryMeta)) {
      expect(meta.accent).toMatch(/^bg-\S+ text-\S+$/);
      expect(meta.muted).toContain("dark:");
    }
  });

  test("keeps the colours the chip has today", () => {
    expect(entryMeta.claude.accent).toBe("bg-orange-500 text-white");
    expect(entryMeta.zai.accent).toBe("bg-fuchsia-600 text-white");
    expect(entryMeta.codex.accent).toBe("bg-emerald-600 text-white");
    expect(entryMeta.gemini.accent).toBe("bg-blue-600 text-white");
  });
});

describe("reasoningLabel", () => {
  test("maps each effort to its label", () => {
    expect(reasoningLabel("xhigh")).toBe("Extra High");
    expect(reasoningLabel("medium")).toBe("Medium");
  });
});
