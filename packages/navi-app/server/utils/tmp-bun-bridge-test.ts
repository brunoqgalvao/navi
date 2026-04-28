import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildClaudeCodeEnv } from "./claude-code";

const bridge = `
const { spawn } = require("node:child_process");
const nativeClaudePath = process.argv[1];
const claudeArgs = process.argv.slice(2);
const child = spawn(nativeClaudePath, claudeArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
process.stdin.resume();
process.stdin.on("data", (chunk) => child.stdin.write(chunk));
process.stdin.on("end", () => child.stdin.end());
child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("error", (error) => {
  process.stderr.write("[bridge] " + error.message + "\\n");
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
`;

function loadEnvFile(path: string) {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
}

const mode = process.argv[2] ?? "bun";
const includeExtraArg = process.argv[3] === "extra-arg";
const baseEnv = mode === "node-env"
  ? loadEnvFile("/tmp/node-env-full.txt")
  : mode === "minimal"
    ? {
      HOME: process.env.HOME ?? "",
      PATH: process.env.PATH ?? "",
      SHELL: process.env.SHELL ?? "",
      TMPDIR: process.env.TMPDIR ?? "",
      TERM: process.env.TERM ?? "",
      __CFBundleIdentifier: process.env.__CFBundleIdentifier ?? "",
      __CF_USER_TEXT_ENCODING: process.env.__CF_USER_TEXT_ENCODING ?? "",
    }
    : process.env;
const env = buildClaudeCodeEnv(baseEnv);
console.error(`[tmp-bun-bridge-test] mode=${mode}`);
console.error(
  `[tmp-bun-bridge-test] env_keys=${Object.keys(env)
    .sort()
    .filter((key) =>
      key === "_" ||
      key.startsWith("BUN") ||
      key.startsWith("NODE") ||
      key.startsWith("NAVI") ||
      key.startsWith("CLAUDE") ||
      key.startsWith("ANTHROPIC") ||
      key.endsWith("_API_KEY")
    )
    .join(",")}`
);
const claudeArgs = [
  "/Users/brunogalvao/.local/bin/claude",
  ...(includeExtraArg ? ["packages/navi-app/server/utils/claude-code.ts"] : []),
  "--output-format",
  "stream-json",
  "--verbose",
  "--input-format",
  "stream-json",
  "--model",
  "sonnet",
];

const child = mode === "shell-wrap"
  ? spawn("/bin/zsh", [
    "-lc",
    'exec "$@"',
    "zsh",
    "node",
    "-e",
    bridge,
    ...claudeArgs,
  ], {
    cwd: process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  })
  : spawn("node", [
    "-e",
    bridge,
    ...claudeArgs,
  ], {
    cwd: process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

child.stdin.write(JSON.stringify({
  type: "user",
  session_id: "",
  message: {
    role: "user",
    content: [{ type: "text", text: "Reply with exactly OK" }],
  },
  parent_tool_use_id: null,
}) + "\n");
child.stdin.end();

child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("exit", (code, signal) => {
  console.error(`[tmp-bun-bridge-test] code=${code} signal=${signal}`);
});
