#!/usr/bin/env bun
/**
 * Integration Setup Helper
 *
 * CLI tool for the integration-setup skill to save and test credentials.
 *
 * Usage:
 *   bun run save-credential.ts save <provider> <key> <value> [--project <projectId>]
 *   bun run save-credential.ts test <provider> [--project <projectId>]
 *   bun run save-credential.ts status <provider> [--project <projectId>]
 *   bun run save-credential.ts list [--project <projectId>]
 */

const API_BASE = process.env.NAVI_API_URL || "http://localhost:3001";

async function saveCredential(
  provider: string,
  key: string,
  value: string,
  projectId?: string
) {
  const url = projectId
    ? `${API_BASE}/api/credentials/${provider}?projectId=${projectId}`
    : `${API_BASE}/api/credentials/${provider}`;

  const body: any = {
    credentials: { [key]: value },
  };

  if (projectId) {
    body.scope = "project";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`Error: ${data.error || "Failed to save credential"}`);
    process.exit(1);
  }

  console.log(`✓ ${data.message}`);
  return data;
}

async function testCredential(provider: string, projectId?: string) {
  const url = projectId
    ? `${API_BASE}/api/credentials/${provider}/test?projectId=${projectId}`
    : `${API_BASE}/api/credentials/${provider}/test`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();

  if (res.ok && data.success) {
    console.log(`✓ ${data.message}`);
    return { success: true, message: data.message };
  } else {
    console.error(`✗ ${data.error || data.message || "Test failed"}`);
    return { success: false, message: data.error || data.message };
  }
}

async function getStatus(provider: string, projectId?: string) {
  const url = projectId
    ? `${API_BASE}/api/credentials/${provider}?projectId=${projectId}`
    : `${API_BASE}/api/credentials/${provider}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    console.error(`Error: ${data.error || "Failed to get status"}`);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function listProviders(projectId?: string) {
  const url = projectId
    ? `${API_BASE}/api/credentials/providers?projectId=${projectId}`
    : `${API_BASE}/api/credentials/providers`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    console.error(`Error: Failed to list providers`);
    process.exit(1);
  }

  // Format output
  console.log("\nIntegration Status:\n");
  for (const provider of data) {
    const status = provider.hasCredentials ? "✓ Connected" : "○ Not connected";
    const scope = provider.hasProjectCredentials
      ? " (project)"
      : provider.hasUserCredentials
      ? " (global)"
      : "";
    console.log(`  ${provider.name.padEnd(12)} ${status}${scope}`);
  }
  console.log("");

  return data;
}

// Parse args
const args = process.argv.slice(2);
const command = args[0];

// Extract --project flag
let projectId: string | undefined;
const projectIdx = args.indexOf("--project");
if (projectIdx !== -1 && args[projectIdx + 1]) {
  projectId = args[projectIdx + 1];
  args.splice(projectIdx, 2);
}

switch (command) {
  case "save":
    if (args.length < 4) {
      console.error("Usage: save <provider> <key> <value> [--project <id>]");
      process.exit(1);
    }
    await saveCredential(args[1], args[2], args[3], projectId);
    break;

  case "test":
    if (args.length < 2) {
      console.error("Usage: test <provider> [--project <id>]");
      process.exit(1);
    }
    await testCredential(args[1], projectId);
    break;

  case "status":
    if (args.length < 2) {
      console.error("Usage: status <provider> [--project <id>]");
      process.exit(1);
    }
    await getStatus(args[1], projectId);
    break;

  case "list":
    await listProviders(projectId);
    break;

  default:
    console.log(`
Integration Setup Helper

Commands:
  save <provider> <key> <value>   Save a credential
  test <provider>                 Test saved credentials
  status <provider>               Get credential status
  list                            List all providers

Options:
  --project <id>                  Use project-specific scope

Examples:
  bun run save-credential.ts save linear apiKey lin_api_xxx
  bun run save-credential.ts test linear
  bun run save-credential.ts list
  bun run save-credential.ts save notion integrationToken ntn_xxx --project proj123
`);
}
