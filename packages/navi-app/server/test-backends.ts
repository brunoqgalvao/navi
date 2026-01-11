/**
 * Quick test script for multi-backend system
 * Run with: bun run server/test-backends.ts
 */

import { detectBackends, getAdapter } from "./backends";

async function testBackends() {
  console.log("🔍 Detecting installed backends...\n");

  const backends = await detectBackends();

  for (const backend of backends) {
    const status = backend.installed ? "✅" : "❌";
    console.log(`${status} ${backend.name} (${backend.id})`);
    if (backend.installed) {
      console.log(`   Version: ${backend.version}`);
      console.log(`   Path: ${backend.path}`);
    }
  }

  console.log("\n📋 Available models by backend:\n");

  for (const backend of backends.filter(b => b.installed)) {
    const adapter = getAdapter(backend.id);
    console.log(`${backend.name}:`);
    for (const model of adapter.models) {
      const isDefault = model === adapter.defaultModel ? " (default)" : "";
      console.log(`   - ${model}${isDefault}`);
    }
    console.log();
  }

  console.log("✅ Backend system ready!\n");
  console.log("To test a query, use the WebSocket with:");
  console.log(`{
  type: "query",
  prompt: "Hello!",
  sessionId: "...",
  backend: "codex" // or "gemini" or "claude"
}`);
}

testBackends().catch(console.error);
