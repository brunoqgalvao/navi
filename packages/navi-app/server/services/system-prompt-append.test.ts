import { describe, expect, test } from "bun:test";
import {
  UI_INSTRUCTIONS,
  buildSkillsMetadataPrompt,
  buildSystemPromptAppend,
} from "./system-prompt-append";

describe("system prompt append", () => {
  test("mentions Navi workflows in the base UI instructions", () => {
    expect(UI_INSTRUCTIONS).toContain("## Navi Workflows");
    expect(UI_INSTRUCTIONS).toContain("`navi-workflows`");
    expect(UI_INSTRUCTIONS).toContain("root session, and child run sessions");
  });

  test("includes available skills metadata after the base UI instructions", () => {
    const skills = [
      {
        name: "navi-workflows",
        description: "Create, edit, run, and inspect Navi workflows.",
        basePath: "/tmp/navi-workflows",
      },
    ];

    const metadataPrompt = buildSkillsMetadataPrompt(skills);
    expect(metadataPrompt).toContain('<skill name="navi-workflows" path="/tmp/navi-workflows/SKILL.md">');
    expect(metadataPrompt).toContain("IMMEDIATELY use the Read tool");

    const promptAppend = buildSystemPromptAppend(skills);
    expect(promptAppend).toContain("## Navi Workflows");
    expect(promptAppend).toContain('<skill name="navi-workflows" path="/tmp/navi-workflows/SKILL.md">');
  });
});
