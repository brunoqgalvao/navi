/**
 * skills.test.ts
 *
 * Tests for loadSkillIndex, buildSkillsContext, and registerUseSkillTool.
 * Uses temporary directories so tests are deterministic and isolated.
 */

import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  loadSkillIndex,
  buildSkillsContext,
  registerUseSkillTool,
} from "../src/skills.js";

// ── Temp directory helpers ────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = join("/tmp", `navi-skills-test-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeSkillDir(
  baseDir: string,
  skillName: string,
  content: string
): string {
  const skillDir = join(baseDir, skillName);
  mkdirSync(skillDir, { recursive: true });
  const filePath = join(skillDir, "SKILL.md");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function skillContent(name: string, description: string, body = "# Instructions\n\nDo the thing."): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
}

// ── loadSkillIndex tests ──────────────────────────────────────────────────────

describe("loadSkillIndex", () => {
  test("returns empty array for empty directory", () => {
    const index = loadSkillIndex([tmpDir]);
    expect(index).toEqual([]);
  });

  test("returns empty array for nonexistent directory", () => {
    const index = loadSkillIndex(["/nonexistent/path/that/does/not/exist"]);
    expect(index).toEqual([]);
  });

  test("parses a skill with name and description from frontmatter", () => {
    makeSkillDir(tmpDir, "my-skill", skillContent("my-skill", "Does something useful"));
    const index = loadSkillIndex([tmpDir]);
    expect(index).toHaveLength(1);
    expect(index[0]!.name).toBe("my-skill");
    expect(index[0]!.description).toBe("Does something useful");
    expect(index[0]!.filePath).toContain("SKILL.md");
  });

  test("parses multiple skills", () => {
    makeSkillDir(tmpDir, "skill-a", skillContent("skill-a", "Skill A"));
    makeSkillDir(tmpDir, "skill-b", skillContent("skill-b", "Skill B"));
    const index = loadSkillIndex([tmpDir]);
    expect(index).toHaveLength(2);
    const names = index.map((e) => e.name).sort();
    expect(names).toEqual(["skill-a", "skill-b"]);
  });

  test("earlier dirs shadow later dirs by name", () => {
    const dir1 = join(tmpDir, "project");
    const dir2 = join(tmpDir, "global");
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });

    makeSkillDir(dir1, "deploy", skillContent("deploy", "Project deploy"));
    makeSkillDir(dir2, "deploy", skillContent("deploy", "Global deploy"));
    makeSkillDir(dir2, "test", skillContent("test", "Global test"));

    const index = loadSkillIndex([dir1, dir2]);
    expect(index).toHaveLength(2);

    const deploy = index.find((e) => e.name === "deploy");
    expect(deploy?.description).toBe("Project deploy"); // earlier wins

    const test = index.find((e) => e.name === "test");
    expect(test?.description).toBe("Global test");
  });

  test("skips directories without SKILL.md", () => {
    // Create a directory without SKILL.md
    mkdirSync(join(tmpDir, "not-a-skill"), { recursive: true });
    writeFileSync(join(tmpDir, "not-a-skill", "README.md"), "hello");

    // Create a valid skill
    makeSkillDir(tmpDir, "real-skill", skillContent("real-skill", "A real skill"));

    const index = loadSkillIndex([tmpDir]);
    expect(index).toHaveLength(1);
    expect(index[0]!.name).toBe("real-skill");
  });

  test("skips non-directory entries", () => {
    writeFileSync(join(tmpDir, "SKILL.md"), skillContent("file-skill", "not in subdir"));
    makeSkillDir(tmpDir, "real-skill", skillContent("real-skill", "A real skill"));

    const index = loadSkillIndex([tmpDir]);
    expect(index).toHaveLength(1);
    expect(index[0]!.name).toBe("real-skill");
  });

  test("malformed frontmatter: no --- block falls back to directory name", () => {
    const skillDir = join(tmpDir, "fallback-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "No frontmatter here. Just content.");

    const index = loadSkillIndex([tmpDir]);
    expect(index).toHaveLength(1);
    expect(index[0]!.name).toBe("fallback-skill"); // uses directory name
    expect(index[0]!.description).toBe(""); // no description
  });

  test("unclosed frontmatter gets warning entry but is not skipped", () => {
    const skillDir = join(tmpDir, "broken-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: broken-skill\ndescription: broken\n(no closing ---)"
    );

    const index = loadSkillIndex([tmpDir]);
    expect(index).toHaveLength(1);
    expect(index[0]!.name).toBe("broken-skill");
    expect(index[0]!.warning).toBeDefined();
    expect(index[0]!.warning).toContain("unclosed");
  });

  test("frontmatter name takes precedence over directory name", () => {
    makeSkillDir(tmpDir, "dir-name", skillContent("frontmatter-name", "Has different names"));

    const index = loadSkillIndex([tmpDir]);
    expect(index).toHaveLength(1);
    expect(index[0]!.name).toBe("frontmatter-name");
  });
});

// ── buildSkillsContext tests ──────────────────────────────────────────────────

describe("buildSkillsContext", () => {
  test("returns empty string for empty index", () => {
    expect(buildSkillsContext([])).toBe("");
  });

  test("includes skill names and descriptions", () => {
    const index = [
      { name: "deploy", description: "Deploy to production", filePath: "/fake/deploy/SKILL.md" },
      { name: "test", description: "Run test suite", filePath: "/fake/test/SKILL.md" },
    ];
    const ctx = buildSkillsContext(index);
    expect(ctx).toContain("deploy");
    expect(ctx).toContain("Deploy to production");
    expect(ctx).toContain("test");
    expect(ctx).toContain("Run test suite");
  });

  test("mentions use_skill tool", () => {
    const index = [
      { name: "skill-a", description: "A skill", filePath: "/fake/SKILL.md" },
    ];
    const ctx = buildSkillsContext(index);
    expect(ctx.toLowerCase()).toContain("use_skill");
  });

  test("handles skill with empty description", () => {
    const index = [
      { name: "no-desc-skill", description: "", filePath: "/fake/SKILL.md" },
    ];
    const ctx = buildSkillsContext(index);
    expect(ctx).toContain("no-desc-skill");
    // Should not have trailing " — " with empty desc
    expect(ctx).not.toContain("no-desc-skill —");
  });
});

// ── registerUseSkillTool tests ────────────────────────────────────────────────

async function makeTestClient(
  index: ReturnType<typeof loadSkillIndex>
): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const mcpServer = new McpServer({ name: "test-skills", version: "0.0.1" });
  registerUseSkillTool(mcpServer, index);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await mcpServer.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await mcpServer.server.close();
    },
  };
}

describe("registerUseSkillTool", () => {
  test("use_skill returns full SKILL.md content for known skill", async () => {
    const body = "# Deploy\n\nRun `bun deploy`.";
    makeSkillDir(tmpDir, "deploy", `---\nname: deploy\ndescription: Deploy\n---\n\n${body}`);
    const index = loadSkillIndex([tmpDir]);

    const { client, cleanup } = await makeTestClient(index);
    try {
      const result = await client.callTool({
        name: "use_skill",
        arguments: { name: "deploy" },
      });
      expect(result.isError).toBeFalsy();
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      expect(content?.text).toContain("Deploy");
      expect(content?.text).toContain("bun deploy");
    } finally {
      await cleanup();
    }
  });

  test("use_skill returns isError for unknown skill name", async () => {
    makeSkillDir(tmpDir, "deploy", skillContent("deploy", "Deploy"));
    const index = loadSkillIndex([tmpDir]);

    const { client, cleanup } = await makeTestClient(index);
    try {
      const result = await client.callTool({
        name: "use_skill",
        arguments: { name: "nonexistent-skill" },
      });
      expect(result.isError).toBe(true);
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      expect(content?.text).toContain("nonexistent-skill");
      expect(content?.text).toContain("deploy"); // mentions available skills
    } finally {
      await cleanup();
    }
  });

  test("use_skill with empty index returns isError with (none)", async () => {
    const { client, cleanup } = await makeTestClient([]);
    try {
      const result = await client.callTool({
        name: "use_skill",
        arguments: { name: "any-skill" },
      });
      expect(result.isError).toBe(true);
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      expect(content?.text).toContain("(none)");
    } finally {
      await cleanup();
    }
  });

  test("tool is listed in available tools", async () => {
    const { client, cleanup } = await makeTestClient([]);
    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((t) => t.name);
      expect(toolNames).toContain("use_skill");
    } finally {
      await cleanup();
    }
  });

  test("shadowed skills: use_skill returns project-level version", async () => {
    const dir1 = join(tmpDir, "project");
    const dir2 = join(tmpDir, "global");
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });

    makeSkillDir(dir1, "deploy", skillContent("deploy", "Project deploy", "# Project Deploy\nProject-specific steps."));
    makeSkillDir(dir2, "deploy", skillContent("deploy", "Global deploy", "# Global Deploy\nGeneric steps."));

    const index = loadSkillIndex([dir1, dir2]);
    const { client, cleanup } = await makeTestClient(index);
    try {
      const result = await client.callTool({
        name: "use_skill",
        arguments: { name: "deploy" },
      });
      expect(result.isError).toBeFalsy();
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      expect(content?.text).toContain("Project-specific steps");
      expect(content?.text).not.toContain("Generic steps");
    } finally {
      await cleanup();
    }
  });
});
