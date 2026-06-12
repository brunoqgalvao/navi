#!/usr/bin/env bun
/**
 * spike-spawn.ts — LIVE SPIKE for cross-backend agent spawning.
 *
 * Verifies end-to-end: Claude session (root) uses spawn_agent MCP tool to
 * spawn a Codex child agent. Child creates add.py with an add(a,b) function.
 * Claude checks result. Script prints PASS/FAIL.
 *
 * Usage:
 *   bun run packages/gateway/scripts/spike-spawn.ts
 *
 * Requirements:
 *   - claude CLI authenticated
 *   - codex CLI authenticated
 *   - NAVI_SPIKE_CWD env (default: /tmp/navi-spike-spawn)
 */

import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { createDefaultRegistry } from "../src/default-registry.js";
import { AgentTree } from "../src/spawn/tree.js";
import { startSpawnControlServer, spawnServerConfigFor } from "../src/spawn/mcp-server.js";
import type { ControlServer } from "../src/spawn/mcp-server.js";
import type { GatewayEvent } from "../src/events.js";

const CWD = process.env.NAVI_SPIKE_CWD ?? "/tmp/navi-spike-spawn";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

mkdirSync(CWD, { recursive: true });

console.log("[spike] Starting cross-backend spawn spike");
console.log(`[spike] CWD: ${CWD}`);

// ── Setup ─────────────────────────────────────────────────────────────────────

const registry = createDefaultRegistry();

const permissionEvents: GatewayEvent[] = [];
const tree = new AgentTree(registry, {
  defaultPermissionMode: "acceptAll",
  cwd: CWD,
  onRootEvent: (e) => {
    permissionEvents.push(e);
    if (e.type === "permission-request") {
      console.log(`[spike] child permission-request bubbled: tool=${e.tool} requestId=${e.requestId}`);
    }
  },
});

// Start control server
const ctrl = startSpawnControlServer(tree) as ControlServer & { _token: string };
console.log(`[spike] Control server on port ${ctrl.port}`);

const controlUrl = `http://127.0.0.1:${ctrl.port}`;
const mcpConfig = spawnServerConfigFor(controlUrl, ctrl._token);
console.log(`[spike] MCP config: ${JSON.stringify(mcpConfig)}`);

// ── Run Claude session ────────────────────────────────────────────────────────

const claudeBackend = registry.get("claude");
const session = claudeBackend.createSession({
  cwd: CWD,
  permissionMode: "acceptAll",
  mcpServers: [mcpConfig],
});

console.log(`[spike] Claude session id: ${session.id}`);
console.log("[spike] Sending prompt...\n");

const prompt = `Use the spawn_agent tool to have a codex agent create a file called add.py in the current directory (${CWD}). The file should contain a Python function called add(a, b) that returns a + b. After spawning, use get_agent_result to check if the agent finished and tell me what happened.`;

let fullText = "";
let hasError = false;
let spawnCalled = false;
let getResultCalled = false;

const startTime = Date.now();

try {
  for await (const evt of session.send({ text: prompt })) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.error("[spike] TIMEOUT exceeded");
      hasError = true;
      break;
    }

    switch (evt.type) {
      case "text-delta":
        process.stdout.write(evt.text);
        fullText += evt.text;
        break;
      case "tool-start":
        console.log(`\n[spike] tool-start: ${evt.tool}`);
        if (evt.tool === "mcp__navi-spawn__spawn_agent" || evt.tool === "spawn_agent") {
          spawnCalled = true;
        }
        if (evt.tool === "mcp__navi-spawn__get_agent_result" || evt.tool === "get_agent_result") {
          getResultCalled = true;
        }
        break;
      case "tool-end":
        console.log(`[spike] tool-end: ${evt.toolId} isError=${evt.isError}`);
        break;
      case "error":
        console.error(`\n[spike] ERROR: ${evt.message}`);
        hasError = true;
        break;
      case "usage":
        console.log(`\n[spike] usage: in=${evt.usage.inputTokens} out=${evt.usage.outputTokens} cost=$${(evt.usage.costUsd ?? 0).toFixed(5)}`);
        break;
      case "session-meta":
        console.log(`[spike] session-meta: backendSessionId=${evt.backendSessionId} model=${evt.model}`);
        break;
      case "done":
        console.log(`\n[spike] done: reason=${evt.reason}`);
        break;
      case "permission-request":
        // Root session permission-request (Claude itself)
        console.log(`[spike] root permission-request: tool=${evt.tool}`);
        session.respondToPermission(evt.requestId, "allow");
        break;
    }
  }
} catch (err) {
  console.error(`[spike] Exception: ${err}`);
  hasError = true;
}

// ── Verify results ────────────────────────────────────────────────────────────

console.log("\n\n--- VERIFICATION ---\n");

const addPyPath = `${CWD}/add.py`;
const addPyExists = existsSync(addPyPath);
let addPyContent = "";
if (addPyExists) {
  addPyContent = readFileSync(addPyPath, "utf-8");
  console.log(`[spike] add.py exists: YES`);
  console.log(`[spike] add.py content:\n${addPyContent}`);
} else {
  console.log(`[spike] add.py exists: NO (looking in ${addPyPath})`);
}

const hasAddFunction = addPyExists && (
  addPyContent.includes("def add(a, b)") ||
  addPyContent.includes("def add(a,b)") ||
  addPyContent.includes("def add( a, b)") ||
  addPyContent.includes("def add(a ,b)")
);

const claudeMentionsOutcome =
  fullText.toLowerCase().includes("add") ||
  fullText.toLowerCase().includes("created") ||
  fullText.toLowerCase().includes("spawn") ||
  fullText.toLowerCase().includes("codex") ||
  fullText.toLowerCase().includes("result");

// Check tree for any spawned agents
const agents = tree.listAgents();
console.log(`\n[spike] Agents in tree: ${agents.length}`);
for (const a of agents) {
  console.log(`  - ${a.id} backend=${a.backend} status=${a.status} task="${a.task.slice(0, 60)}"`);
}

const hasChildAgent = agents.length > 0;

console.log(`\n[spike] CHECKS:`);
console.log(`  spawnCalled:          ${spawnCalled}`);
console.log(`  getResultCalled:      ${getResultCalled}`);
console.log(`  hasChildAgent:        ${hasChildAgent}`);
console.log(`  addPyExists:          ${addPyExists}`);
console.log(`  hasAddFunction:       ${hasAddFunction}`);
console.log(`  claudeMentionsOutcome: ${claudeMentionsOutcome}`);
console.log(`  hasError:             ${hasError}`);

// Stop the control server
ctrl.stop();

// ── Print PASS/FAIL ───────────────────────────────────────────────────────────

const passed =
  !hasError &&
  spawnCalled &&
  hasChildAgent &&
  addPyExists &&
  hasAddFunction &&
  claudeMentionsOutcome;

console.log(`\n${"=".repeat(50)}`);
if (passed) {
  console.log("PASS");
} else {
  console.log("FAIL");
  const failures: string[] = [];
  if (hasError) failures.push("error events during execution");
  if (!spawnCalled) failures.push("spawn_agent was not called");
  if (!hasChildAgent) failures.push("no child agents in tree");
  if (!addPyExists) failures.push("add.py does not exist");
  if (!hasAddFunction) failures.push("add.py does not contain def add function");
  if (!claudeMentionsOutcome) failures.push("claude's text does not mention outcome");
  console.log(`Failures:\n  - ${failures.join("\n  - ")}`);
}
console.log("=".repeat(50));

process.exit(passed ? 0 : 1);
