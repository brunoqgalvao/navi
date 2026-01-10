#!/usr/bin/env bun
/**
 * Navi Integrations CLI
 *
 * A CLI tool for accessing OAuth-authenticated services from skills/agents.
 * This runs as a standalone command that agents can invoke via Bash.
 *
 * Usage:
 *   navi-integrations list                           # List all connected integrations
 *   navi-integrations token google                   # Get access token for Google
 *   navi-integrations token google --service gmail   # Get token for specific service
 *   navi-integrations gmail list                     # List recent emails
 *   navi-integrations gmail read <id>                # Read specific email
 *   navi-integrations gmail search "query"           # Search emails
 *   navi-integrations sheets list                    # List spreadsheets
 *   navi-integrations sheets read <id>               # Read spreadsheet data
 *   navi-integrations drive list                     # List Drive files
 *   navi-integrations drive read <id>                # Read file content
 *
 * Environment:
 *   NAVI_SERVER_URL - URL of the Navi server (default: http://localhost:3001)
 */

const NAVI_SERVER = process.env.NAVI_SERVER_URL || "http://localhost:3001";

interface TokenResponse {
  access_token: string;
  expires_at?: number;
  account_id: string;
  scopes: string[];
}

interface Integration {
  id: string;
  provider: string;
  account_id: string;
  account_label: string;
  services: string[];
  last_used_at?: number;
}

/**
 * Fetch token from Navi server
 */
async function getToken(
  provider: string,
  service?: string
): Promise<TokenResponse | null> {
  try {
    const response = await fetch(`${NAVI_SERVER}/api/integrations/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, service }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to get token: ${error}`);
      return null;
    }

    return await response.json();
  } catch (e) {
    console.error(`Error connecting to Navi server: ${e}`);
    return null;
  }
}

/**
 * List all integrations
 */
async function listIntegrations(): Promise<void> {
  try {
    const response = await fetch(`${NAVI_SERVER}/api/integrations`);
    if (!response.ok) {
      console.error("Failed to list integrations");
      process.exit(1);
    }

    const integrations: Integration[] = await response.json();

    if (integrations.length === 0) {
      console.log("No integrations configured.");
      console.log("Connect integrations via Navi Settings > Integrations");
      return;
    }

    console.log("Connected integrations:\n");
    for (const i of integrations) {
      console.log(`  ${i.provider}:`);
      console.log(`    Account: ${i.account_label} (${i.account_id})`);
      console.log(`    Services: ${i.services.join(", ")}`);
      if (i.last_used_at) {
        console.log(`    Last used: ${new Date(i.last_used_at).toLocaleString()}`);
      }
      console.log();
    }
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
}

/**
 * Output token (for piping to other commands)
 */
async function outputToken(provider: string, service?: string): Promise<void> {
  const token = await getToken(provider, service);
  if (!token) {
    process.exit(1);
  }

  // Just output the token for easy piping
  console.log(token.access_token);
}

/**
 * Output token as JSON
 */
async function outputTokenJson(provider: string, service?: string): Promise<void> {
  const token = await getToken(provider, service);
  if (!token) {
    process.exit(1);
  }

  console.log(JSON.stringify(token, null, 2));
}

// =============================================================================
// Gmail Commands
// =============================================================================

async function gmailList(maxResults: number = 10): Promise<void> {
  const token = await getToken("google", "gmail");
  if (!token) {
    console.error("Gmail not connected. Connect via Navi Settings > Integrations");
    process.exit(1);
  }

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!response.ok) {
    console.error(`Gmail API error: ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  const messages = data.messages || [];

  if (messages.length === 0) {
    console.log("No messages found.");
    return;
  }

  // Fetch message details
  console.log("Recent emails:\n");
  for (const msg of messages.slice(0, maxResults)) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    const msgData = await detail.json();

    const headers = msgData.payload?.headers || [];
    const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
    const date = headers.find((h: any) => h.name === "Date")?.value || "";

    console.log(`  ID: ${msg.id}`);
    console.log(`  From: ${from}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Date: ${date}`);
    console.log();
  }
}

async function gmailRead(messageId: string): Promise<void> {
  const token = await getToken("google", "gmail");
  if (!token) {
    console.error("Gmail not connected.");
    process.exit(1);
  }

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!response.ok) {
    console.error(`Gmail API error: ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  const headers = data.payload?.headers || [];

  console.log(`From: ${headers.find((h: any) => h.name === "From")?.value || "Unknown"}`);
  console.log(`To: ${headers.find((h: any) => h.name === "To")?.value || "Unknown"}`);
  console.log(`Subject: ${headers.find((h: any) => h.name === "Subject")?.value || "(no subject)"}`);
  console.log(`Date: ${headers.find((h: any) => h.name === "Date")?.value || ""}`);
  console.log();

  // Decode body
  const body = extractBody(data.payload);
  console.log(body);
}

async function gmailSearch(query: string, maxResults: number = 10): Promise<void> {
  const token = await getToken("google", "gmail");
  if (!token) {
    console.error("Gmail not connected.");
    process.exit(1);
  }

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!response.ok) {
    console.error(`Gmail API error: ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  const messages = data.messages || [];

  if (messages.length === 0) {
    console.log(`No messages found matching: ${query}`);
    return;
  }

  console.log(`Found ${messages.length} messages matching: ${query}\n`);
  for (const msg of messages) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    const msgData = await detail.json();

    const headers = msgData.payload?.headers || [];
    const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";

    console.log(`  ${msg.id}: ${subject}`);
    console.log(`    From: ${from}`);
    console.log();
  }
}

function extractBody(payload: any): string {
  if (!payload) return "";

  // Check for plain text body
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Check parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      // Recurse into nested parts
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  // Fall back to HTML
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = Buffer.from(payload.body.data, "base64").toString("utf-8");
    // Strip HTML tags for readability
    return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }

  return "(no readable body)";
}

// =============================================================================
// Google Sheets Commands
// =============================================================================

async function sheetsList(): Promise<void> {
  const token = await getToken("google", "sheets");
  if (!token) {
    console.error("Google Sheets not connected.");
    process.exit(1);
  }

  // Use Drive API to list spreadsheets
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!response.ok) {
    console.error(`API error: ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  const files = data.files || [];

  if (files.length === 0) {
    console.log("No spreadsheets found.");
    return;
  }

  console.log("Spreadsheets:\n");
  for (const file of files) {
    console.log(`  ${file.name}`);
    console.log(`    ID: ${file.id}`);
    console.log(`    Modified: ${file.modifiedTime}`);
    console.log();
  }
}

async function sheetsRead(spreadsheetId: string, range?: string): Promise<void> {
  const token = await getToken("google", "sheets");
  if (!token) {
    console.error("Google Sheets not connected.");
    process.exit(1);
  }

  // First get spreadsheet metadata
  const metaResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!metaResponse.ok) {
    console.error(`Sheets API error: ${await metaResponse.text()}`);
    process.exit(1);
  }

  const meta = await metaResponse.json();
  console.log(`Spreadsheet: ${meta.properties.title}\n`);

  // If no range specified, read first sheet
  const actualRange = range || meta.sheets?.[0]?.properties?.title || "Sheet1";

  const dataResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(actualRange)}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!dataResponse.ok) {
    console.error(`Sheets API error: ${await dataResponse.text()}`);
    process.exit(1);
  }

  const data = await dataResponse.json();
  const values = data.values || [];

  if (values.length === 0) {
    console.log("No data found.");
    return;
  }

  // Output as TSV for easy parsing
  for (const row of values) {
    console.log(row.join("\t"));
  }
}

// =============================================================================
// Google Drive Commands
// =============================================================================

async function driveList(folderId?: string, maxResults: number = 20): Promise<void> {
  const token = await getToken("google", "drive");
  if (!token) {
    console.error("Google Drive not connected.");
    process.exit(1);
  }

  let query = "trashed=false";
  if (folderId) {
    query += ` and '${folderId}' in parents`;
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=${maxResults}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!response.ok) {
    console.error(`Drive API error: ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  const files = data.files || [];

  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  console.log("Files:\n");
  for (const file of files) {
    const isFolder = file.mimeType === "application/vnd.google-apps.folder";
    const icon = isFolder ? "📁" : "📄";
    console.log(`  ${icon} ${file.name}`);
    console.log(`    ID: ${file.id}`);
    console.log(`    Type: ${file.mimeType}`);
    if (file.size) {
      console.log(`    Size: ${formatBytes(parseInt(file.size))}`);
    }
    console.log();
  }
}

async function driveRead(fileId: string): Promise<void> {
  const token = await getToken("google", "drive");
  if (!token) {
    console.error("Google Drive not connected.");
    process.exit(1);
  }

  // Get file metadata first
  const metaResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!metaResponse.ok) {
    console.error(`Drive API error: ${await metaResponse.text()}`);
    process.exit(1);
  }

  const meta = await metaResponse.json();

  // For Google Docs, export as plain text
  if (meta.mimeType.startsWith("application/vnd.google-apps")) {
    let exportMime = "text/plain";
    if (meta.mimeType.includes("spreadsheet")) {
      exportMime = "text/csv";
    } else if (meta.mimeType.includes("presentation")) {
      exportMime = "text/plain";
    }

    const exportResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );

    if (!exportResponse.ok) {
      console.error(`Export error: ${await exportResponse.text()}`);
      process.exit(1);
    }

    console.log(await exportResponse.text());
  } else {
    // Regular file, download content
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );

    if (!downloadResponse.ok) {
      console.error(`Download error: ${await downloadResponse.text()}`);
      process.exit(1);
    }

    console.log(await downloadResponse.text());
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// =============================================================================
// Main CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    console.log(`
Navi Integrations CLI

Usage:
  navi-integrations list                           List connected integrations
  navi-integrations token <provider> [--json]      Get access token
  navi-integrations token <provider> --service <s> Get token for specific service

Gmail:
  navi-integrations gmail list [count]             List recent emails
  navi-integrations gmail read <id>                Read email by ID
  navi-integrations gmail search "query" [count]   Search emails

Google Sheets:
  navi-integrations sheets list                    List spreadsheets
  navi-integrations sheets read <id> [range]       Read spreadsheet data

Google Drive:
  navi-integrations drive list [folderId]          List files
  navi-integrations drive read <id>                Read file content

Environment:
  NAVI_SERVER_URL    Navi server URL (default: http://localhost:3001)
`);
    return;
  }

  const command = args[0];

  switch (command) {
    case "list":
      await listIntegrations();
      break;

    case "token":
      if (!args[1]) {
        console.error("Provider required. Usage: navi-integrations token <provider>");
        process.exit(1);
      }
      const jsonFlag = args.includes("--json");
      const serviceIdx = args.indexOf("--service");
      const service = serviceIdx >= 0 ? args[serviceIdx + 1] : undefined;
      if (jsonFlag) {
        await outputTokenJson(args[1], service);
      } else {
        await outputToken(args[1], service);
      }
      break;

    case "gmail":
      if (args[1] === "list") {
        await gmailList(parseInt(args[2]) || 10);
      } else if (args[1] === "read" && args[2]) {
        await gmailRead(args[2]);
      } else if (args[1] === "search" && args[2]) {
        await gmailSearch(args[2], parseInt(args[3]) || 10);
      } else {
        console.error("Usage: navi-integrations gmail [list|read|search]");
        process.exit(1);
      }
      break;

    case "sheets":
      if (args[1] === "list") {
        await sheetsList();
      } else if (args[1] === "read" && args[2]) {
        await sheetsRead(args[2], args[3]);
      } else {
        console.error("Usage: navi-integrations sheets [list|read]");
        process.exit(1);
      }
      break;

    case "drive":
      if (args[1] === "list") {
        await driveList(args[2], parseInt(args[3]) || 20);
      } else if (args[1] === "read" && args[2]) {
        await driveRead(args[2]);
      } else {
        console.error("Usage: navi-integrations drive [list|read]");
        process.exit(1);
      }
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'navi-integrations help' for usage");
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
