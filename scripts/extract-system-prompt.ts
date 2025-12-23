import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const claudeDir = join(homedir(), ".claude", "projects");

function findLatestSession(): string | null {
  let latestFile: string | null = null;
  let latestTime = 0;

  function searchDir(dir: string) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            searchDir(fullPath);
          } else if (entry.endsWith(".jsonl") && stat.mtimeMs > latestTime) {
            latestTime = stat.mtimeMs;
            latestFile = fullPath;
          }
        } catch {}
      }
    } catch {}
  }

  searchDir(claudeDir);
  return latestFile;
}

function extractSystemPrompt(sessionFile: string) {
  const content = readFileSync(sessionFile, "utf-8");
  const lines = content.trim().split("\n");

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      if (entry.type === "summary" && entry.apiConversationHistory) {
        for (const msg of entry.apiConversationHistory) {
          if (msg.role === "user" && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === "text" && block.text?.length > 5000) {
                console.log("=".repeat(80));
                console.log("SYSTEM PROMPT FOUND:");
                console.log("=".repeat(80));
                console.log(block.text);
                console.log("=".repeat(80));
                return block.text;
              }
            }
          }
        }
      }

      if (entry.message?.content && Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === "text" && block.text?.length > 5000 && block.text.includes("You are Claude Code")) {
            console.log("=".repeat(80));
            console.log("SYSTEM PROMPT FOUND:");
            console.log("=".repeat(80));
            console.log(block.text);
            console.log("=".repeat(80));
            return block.text;
          }
        }
      }
    } catch {}
  }

  return null;
}

const sessionFile = process.argv[2] || findLatestSession();

if (!sessionFile) {
  console.error("No session file found. Run Claude Code first to create a session.");
  process.exit(1);
}

console.log(`\n📂 Reading session: ${sessionFile}\n`);
const prompt = extractSystemPrompt(sessionFile);

if (!prompt) {
  console.log("No system prompt found in session. The prompt may be in a different format.");
  console.log("\nTrying to dump all large text blocks...\n");

  const content = readFileSync(sessionFile, "utf-8");
  const lines = content.trim().split("\n");

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const str = JSON.stringify(entry);
      if (str.includes("You are Claude Code") || str.includes("claude-code")) {
        console.log("\n" + "=".repeat(80));
        console.log(JSON.stringify(entry, null, 2).slice(0, 10000));
        console.log("=".repeat(80));
      }
    } catch {}
  }
}
