/**
 * Test queries for each backend
 * Run with: bun run server/test-backend-queries.ts
 */

import { getAdapter, type BackendId } from "./backends";

const TEST_PROMPT = "Say hello and tell me which AI model you are in one sentence.";
const TEST_CWD = process.cwd();

async function testBackend(backendId: BackendId) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🧪 Testing ${backendId.toUpperCase()} backend`);
  console.log("=".repeat(60));

  const adapter = getAdapter(backendId);
  const info = await adapter.detect();

  if (!info.installed) {
    console.log(`❌ ${backendId} is not installed, skipping...`);
    return false;
  }

  console.log(`✅ ${info.name} v${info.version}`);
  console.log(`📍 Path: ${info.path}`);
  console.log(`🤖 Model: ${adapter.defaultModel}`);
  console.log(`\n📝 Prompt: "${TEST_PROMPT}"\n`);

  const sessionId = `test-${backendId}-${Date.now()}`;
  let responseText = "";
  let eventCount = 0;

  try {
    const startTime = Date.now();

    for await (const event of adapter.query({
      prompt: TEST_PROMPT,
      cwd: TEST_CWD,
      sessionId,
      permissionMode: "auto",
    })) {
      eventCount++;

      // Log event type
      if (event.type === "system") {
        console.log(`   [system] ${event.subtype}`);
      } else if (event.type === "assistant") {
        // Extract text from content
        for (const block of event.content) {
          if (block.type === "text") {
            responseText += block.text;
            process.stdout.write(block.text);
          } else if (block.type === "thinking") {
            console.log(`   [thinking] ${block.thinking.slice(0, 50)}...`);
          }
        }
      } else if (event.type === "tool_progress") {
        console.log(`   [tool] ${event.toolName}`);
      } else if (event.type === "error") {
        console.log(`   ❌ [error] ${event.error}`);
      } else if (event.type === "complete") {
        console.log(`\n   [complete]`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n\n✅ Completed in ${(duration / 1000).toFixed(1)}s (${eventCount} events)`);

    return true;
  } catch (error: any) {
    console.log(`\n❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("🚀 Multi-Backend Test Suite\n");

  const backends: BackendId[] = ["claude", "codex", "gemini"];
  const results: Record<string, boolean> = {};

  for (const backend of backends) {
    results[backend] = await testBackend(backend);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 RESULTS");
  console.log("=".repeat(60));

  for (const [backend, success] of Object.entries(results)) {
    const status = success ? "✅ PASS" : "❌ FAIL";
    console.log(`   ${backend}: ${status}`);
  }

  console.log();
}

main().catch(console.error);
