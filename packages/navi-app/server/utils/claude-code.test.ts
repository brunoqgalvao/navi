import { describe, expect, test } from "bun:test";

import {
  buildClaudeCodeRuntimeOptions,
  getClaudeCodeCommonSearchBases,
  isScriptClaudeCodeExecutable,
} from "./claude-code";

describe("isScriptClaudeCodeExecutable", () => {
  test("detects Claude JS entrypoints", () => {
    expect(isScriptClaudeCodeExecutable("/tmp/claude-agent-sdk/cli.js")).toBe(true);
    expect(isScriptClaudeCodeExecutable("/tmp/claude-agent-sdk/cli.mjs")).toBe(true);
    expect(isScriptClaudeCodeExecutable("/tmp/claude-agent-sdk/cli.ts")).toBe(true);
  });

  test("treats native Claude binaries as non-script executables", () => {
    expect(isScriptClaudeCodeExecutable("/Users/test/.local/bin/claude")).toBe(false);
    expect(isScriptClaudeCodeExecutable("C:\\Program Files\\ClaudeCode\\claude.exe")).toBe(false);
    expect(isScriptClaudeCodeExecutable(null)).toBe(false);
  });
});

describe("buildClaudeCodeRuntimeOptions", () => {
  test("does not inject bun executable args for native Claude binaries", () => {
    const result = buildClaudeCodeRuntimeOptions({
      isBun: true,
      bunPath: "/opt/homebrew/bin/bun",
      claudePath: "/Users/test/.local/bin/claude",
    });

    expect(result.executable).toBeUndefined();
    expect(result.executableArgs).toBeUndefined();
    expect(result.pathToClaudeCodeExecutable).toBe("/Users/test/.local/bin/claude");
    expect(typeof result.spawnClaudeCodeProcess).toBe("function");
  });

  test("uses bun with env-file when Claude path is a JS entrypoint", () => {
    const result = buildClaudeCodeRuntimeOptions({
      isBun: true,
      bunPath: "/opt/homebrew/bin/bun",
      claudePath: "/tmp/claude-agent-sdk/cli.js",
    });

    expect(result).toEqual({
      executable: "/opt/homebrew/bin/bun",
      executableArgs: ["--env-file=/dev/null"],
      pathToClaudeCodeExecutable: "/tmp/claude-agent-sdk/cli.js",
    });
  });

  test("uses bun with env-file when the Claude path is unresolved", () => {
    const result = buildClaudeCodeRuntimeOptions({
      isBun: true,
      bunPath: "/opt/homebrew/bin/bun",
      claudePath: null,
    });

    expect(result).toEqual({
      executable: "/opt/homebrew/bin/bun",
      executableArgs: ["--env-file=/dev/null"],
    });
  });

  test("uses node outside bun", () => {
    const result = buildClaudeCodeRuntimeOptions({
      isBun: false,
      bunPath: "/opt/homebrew/bin/bun",
      claudePath: "/tmp/claude-agent-sdk/cli.js",
    });

    expect(result).toEqual({
      executable: "node",
      pathToClaudeCodeExecutable: "/tmp/claude-agent-sdk/cli.js",
    });
  });
});

describe("getClaudeCodeCommonSearchBases", () => {
  test("includes Claude Code's self-managed local install before generic user bins", () => {
    const result = getClaudeCodeCommonSearchBases(["/Users/test"]);

    expect(result.slice(0, 5)).toEqual([
      "/Users/test/.claude/local",
      "/Users/test/.claude/local/node_modules/.bin",
      "/Users/test/.npm-global/bin",
      "/Users/test/.local/bin",
      "/Users/test/bin",
    ]);
  });
});
