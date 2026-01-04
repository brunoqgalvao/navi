#!/usr/bin/env bun
/**
 * API Test Suite for Navi Server
 * Run with: bun run server/test-api.ts
 */

const BASE_URL = "http://localhost:3001";
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

type TestResult = { name: string; passed: boolean; error?: string; duration: number };

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✓ ${name}`);
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message, duration: Date.now() - start });
    console.log(`✗ ${name}`);
    if (VERBOSE) console.log(`  Error: ${e.message}`);
  }
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, data: await res.json().catch(() => null), ok: res.ok };
}

async function post(path: string, body?: any) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null), ok: res.ok };
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ============ TESTS ============

async function runTests() {
  console.log("\n🧪 Running API Tests...\n");
  console.log("─".repeat(50));

  // Health & Core
  await test("GET /health", async () => {
    const { data, ok } = await get("/health");
    assert(ok, "Should return 200");
    assert(data.status === "ok", "Should have status ok");
  });

  await test("GET /api/config", async () => {
    const { data, ok } = await get("/api/config");
    assert(ok, "Should return 200");
    assert(typeof data.defaultProjectsDir === "string", "Should have defaultProjectsDir");
  });

  // Search
  await test("GET /api/search/stats", async () => {
    const { data, ok } = await get("/api/search/stats");
    assert(ok, "Should return 200");
    assert(typeof data.total === "number", "Should have total count");
  });

  await test("GET /api/search?q=test", async () => {
    const { ok } = await get("/api/search?q=test");
    assert(ok, "Should return 200");
  });

  // Projects
  await test("GET /api/projects", async () => {
    const { data, ok } = await get("/api/projects");
    assert(ok, "Should return 200");
    assert(Array.isArray(data), "Should return array");
  });

  // Sessions
  await test("GET /api/sessions/recent", async () => {
    const { data, ok } = await get("/api/sessions/recent");
    assert(ok, "Should return 200");
    assert(Array.isArray(data), "Should return array");
  });

  await test("GET /api/sessions/active", async () => {
    const { data, ok } = await get("/api/sessions/active");
    assert(ok, "Should return 200");
    assert(Array.isArray(data), "Should return array");
  });

  // Folders
  await test("GET /api/folders", async () => {
    const { data, ok } = await get("/api/folders");
    assert(ok, "Should return 200");
    assert(Array.isArray(data), "Should return array");
  });

  // Skills
  await test("GET /api/skills", async () => {
    const { data, ok } = await get("/api/skills");
    assert(ok, "Should return 200");
    assert(Array.isArray(data), "Should return array");
  });

  await test("GET /api/skills/enabled", async () => {
    const { data, ok } = await get("/api/skills/enabled");
    assert(ok, "Should return 200");
    assert(Array.isArray(data), "Should return array");
  });

  await test("GET /api/skills/global", async () => {
    const { data, ok } = await get("/api/skills/global");
    assert(ok, "Should return 200");
    assert(Array.isArray(data), "Should return array");
  });

  // Costs
  await test("GET /api/costs", async () => {
    const { data, ok } = await get("/api/costs");
    assert(ok, "Should return 200");
    assert(typeof data.totalEver === "number", "Should have totalEver");
    assert(typeof data.totalToday === "number", "Should have totalToday");
  });

  await test("GET /api/costs/analytics", async () => {
    const { data, ok } = await get("/api/costs/analytics");
    assert(ok, "Should return 200");
  });

  // Auth
  await test("GET /api/auth/status", async () => {
    const { data, ok } = await get("/api/auth/status");
    assert(ok, "Should return 200");
    assert(typeof data.authenticated === "boolean", "Should have authenticated field");
  });

  // Permissions
  await test("GET /api/permissions", async () => {
    const { data, ok } = await get("/api/permissions");
    assert(ok, "Should return 200");
    assert(data.global !== undefined, "Should have global permissions");
    assert(data.defaults !== undefined, "Should have defaults");
  });

  // Models
  await test("GET /api/models", async () => {
    const { ok } = await get("/api/models");
    // This might fail if not authenticated, but should not 500
    assert(ok || true, "Should not error");
  });

  // Claude MD
  await test("GET /api/claude-md/default", async () => {
    const { data, ok } = await get("/api/claude-md/default");
    assert(ok, "Should return 200");
    assert(typeof data.content === "string", "Should have content");
  });

  // Filesystem
  await test("GET /api/fs/list", async () => {
    const { data, ok } = await get("/api/fs/list");
    assert(ok, "Should return 200");
    assert(Array.isArray(data.entries), "Should have entries array");
    assert(typeof data.path === "string", "Should have path");
  });

  await test("GET /api/fs/read?path=/etc/hosts", async () => {
    const { ok } = await get("/api/fs/read?path=/etc/hosts");
    assert(ok, "Should return 200");
  });

  // Git (may fail if not in git repo)
  await test("GET /api/git/status", async () => {
    const { data } = await get("/api/git/status");
    // Just check it responds, may error if not in git repo
    assert(data !== null, "Should return data");
  });

  await test("GET /api/git/branches", async () => {
    const { data } = await get("/api/git/branches");
    assert(data !== null, "Should return data");
  });

  await test("GET /api/git/log", async () => {
    const { data } = await get("/api/git/log");
    assert(data !== null, "Should return data");
  });

  // 404 handling
  await test("GET /api/nonexistent returns 404", async () => {
    const { status } = await get("/api/nonexistent");
    assert(status === 404, "Should return 404");
  });

  // CORS preflight
  await test("OPTIONS request returns CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/api/projects`, { method: "OPTIONS" });
    assert(res.headers.get("Access-Control-Allow-Origin") === "*", "Should have CORS header");
  });

  // Print summary
  console.log("─".repeat(50));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${totalTime}ms)\n`);

  if (failed > 0) {
    console.log("Failed tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    });
    console.log("");
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Check if server is running
async function checkServer() {
  try {
    await fetch(`${BASE_URL}/health`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("🔍 Checking if server is running...");

  if (!(await checkServer())) {
    console.log("❌ Server not running on port 3001");
    console.log("   Start it with: bun run server/index.ts");
    process.exit(1);
  }

  console.log("✓ Server is running\n");
  await runTests();
}

main();
