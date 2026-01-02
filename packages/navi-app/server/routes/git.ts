import { json } from "../utils/response";

// Check if git is installed and available
async function isGitInstalled(): Promise<boolean> {
  try {
    const { execSync } = await import("child_process");
    execSync("git --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function handleGitRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  // Check git installation for status endpoint (initial load)
  if (url.pathname === "/api/git/status") {
    const repoPath = url.searchParams.get("path") || process.cwd();
    try {
      // First check if git is even installed
      if (!(await isGitInstalled())) {
        return json({ gitNotInstalled: true, isGitRepo: false });
      }

      const { execSync } = await import("child_process");

      try {
        execSync("git rev-parse --git-dir", { cwd: repoPath, stdio: "pipe" });
      } catch {
        // Not a git repo - return a valid response with isGitRepo: false
        return json({ isGitRepo: false });
      }

      const branch = execSync("git branch --show-current", { cwd: repoPath, encoding: "utf-8" }).trim();
      const statusOutput = execSync("git status --porcelain", { cwd: repoPath, encoding: "utf-8" });

      const staged: { path: string; status: string }[] = [];
      const modified: { path: string; status: string }[] = [];
      const untracked: { path: string }[] = [];

      for (const line of statusOutput.split("\n").filter(Boolean)) {
        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const filePath = line.slice(3);

        if (indexStatus === "?" && workTreeStatus === "?") {
          untracked.push({ path: filePath });
        } else {
          if (indexStatus !== " " && indexStatus !== "?") {
            staged.push({ path: filePath, status: indexStatus });
          }
          if (workTreeStatus !== " " && workTreeStatus !== "?") {
            modified.push({ path: filePath, status: workTreeStatus });
          }
        }
      }

      let ahead = 0;
      let behind = 0;
      try {
        const upstream = execSync("git rev-parse --abbrev-ref @{upstream}", { cwd: repoPath, encoding: "utf-8", stdio: "pipe" }).trim();
        if (upstream) {
          const aheadBehind = execSync(`git rev-list --left-right --count HEAD...@{upstream}`, { cwd: repoPath, encoding: "utf-8" }).trim();
          const [a, b] = aheadBehind.split("\t").map(Number);
          ahead = a || 0;
          behind = b || 0;
        }
      } catch {}

      return json({ isGitRepo: true, branch, staged, modified, untracked, ahead, behind });
    } catch (e) {
      console.error("Git status error:", e);
      return json({ error: "Failed to get git status" }, 500);
    }
  }

  if (url.pathname === "/api/git/log") {
    const repoPath = url.searchParams.get("path") || process.cwd();
    const limit = parseInt(url.searchParams.get("limit") || "50");
    try {
      const { execSync } = await import("child_process");

      // Check if it's a git repo first
      try {
        execSync("git rev-parse --git-dir", { cwd: repoPath, stdio: "pipe" });
      } catch {
        return json({ isGitRepo: false, commits: [] });
      }

      const format = "%H|%h|%an|%ae|%ar|%s";
      const output = execSync(`git log -${limit} --format="${format}"`, { cwd: repoPath, encoding: "utf-8" });

      const commits = output.split("\n").filter(Boolean).map(line => {
        const [hash, shortHash, author, email, date, ...messageParts] = line.split("|");
        return {
          hash,
          shortHash,
          author,
          email,
          date,
          message: messageParts.join("|")
        };
      });

      return json({ commits });
    } catch (e) {
      console.error("Git log error:", e);
      return json({ error: "Failed to get git log" }, 500);
    }
  }

  if (url.pathname === "/api/git/branches") {
    const repoPath = url.searchParams.get("path") || process.cwd();
    try {
      const { execSync } = await import("child_process");

      // Check if it's a git repo first
      try {
        execSync("git rev-parse --git-dir", { cwd: repoPath, stdio: "pipe" });
      } catch {
        return json({ isGitRepo: false, current: "", local: [], remote: [] });
      }

      const current = execSync("git branch --show-current", { cwd: repoPath, encoding: "utf-8" }).trim();
      const localOutput = execSync("git branch --format='%(refname:short)'", { cwd: repoPath, encoding: "utf-8" });
      const local = localOutput.split("\n").filter(Boolean).map(b => b.replace(/^'|'$/g, ""));
      const remoteOutput = execSync("git branch -r --format='%(refname:short)'", { cwd: repoPath, encoding: "utf-8" });
      const remote = remoteOutput.split("\n").filter(Boolean).map(b => b.replace(/^'|'$/g, ""));

      return json({ current, local, remote });
    } catch (e) {
      console.error("Git branches error:", e);
      return json({ error: "Failed to get branches" }, 500);
    }
  }

  if (url.pathname === "/api/git/diff") {
    const repoPath = url.searchParams.get("path") || process.cwd();
    const file = url.searchParams.get("file");
    const staged = url.searchParams.get("staged") === "true";
    try {
      const { execSync } = await import("child_process");

      let cmd = staged ? "git diff --cached" : "git diff";
      if (file) {
        cmd += ` -- "${file}"`;
      }

      const diff = execSync(cmd, { cwd: repoPath, encoding: "utf-8" });
      return json({ diff });
    } catch (e) {
      console.error("Git diff error:", e);
      return json({ error: "Failed to get diff" }, 500);
    }
  }

  if (url.pathname === "/api/git/diff-commit") {
    const repoPath = url.searchParams.get("path") || process.cwd();
    const commit = url.searchParams.get("commit");
    if (!commit) {
      return json({ error: "commit hash required" }, 400);
    }
    try {
      const { execSync } = await import("child_process");
      const diff = execSync(`git show ${commit} --format="" --patch`, { cwd: repoPath, encoding: "utf-8" });
      return json({ diff });
    } catch (e) {
      console.error("Git diff-commit error:", e);
      return json({ error: "Failed to get commit diff" }, 500);
    }
  }

  if (url.pathname === "/api/git/checkout" && method === "POST") {
    const body = await req.json();
    const { path: repoPath, branch } = body;
    if (!branch) {
      return json({ error: "branch required" }, 400);
    }
    try {
      const { execSync } = await import("child_process");
      execSync(`git checkout "${branch}"`, { cwd: repoPath || process.cwd(), encoding: "utf-8" });
      return json({ success: true, branch });
    } catch (e: any) {
      console.error("Git checkout error:", e);
      return json({ error: e.message || "Failed to checkout branch" }, 500);
    }
  }

  if (url.pathname === "/api/git/stage" && method === "POST") {
    const body = await req.json();
    const { path: repoPath, files } = body;
    if (!files || !Array.isArray(files)) {
      return json({ error: "files array required" }, 400);
    }
    try {
      const { execSync } = await import("child_process");
      for (const file of files) {
        execSync(`git add "${file}"`, { cwd: repoPath || process.cwd() });
      }
      return json({ success: true });
    } catch (e: any) {
      console.error("Git stage error:", e);
      return json({ error: e.message || "Failed to stage files" }, 500);
    }
  }

  if (url.pathname === "/api/git/unstage" && method === "POST") {
    const body = await req.json();
    const { path: repoPath, files } = body;
    if (!files || !Array.isArray(files)) {
      return json({ error: "files array required" }, 400);
    }
    try {
      const { execSync } = await import("child_process");
      for (const file of files) {
        execSync(`git reset HEAD "${file}"`, { cwd: repoPath || process.cwd() });
      }
      return json({ success: true });
    } catch (e: any) {
      console.error("Git unstage error:", e);
      return json({ error: e.message || "Failed to unstage files" }, 500);
    }
  }

  if (url.pathname === "/api/git/commit" && method === "POST") {
    const body = await req.json();
    const { path: repoPath, message } = body;
    if (!message || typeof message !== "string") {
      return json({ error: "commit message required" }, 400);
    }
    try {
      const { execSync } = await import("child_process");
      // Escape message for shell safety
      const safeMessage = message.replace(/"/g, '\\"');
      execSync(`git commit -m "${safeMessage}"`, { cwd: repoPath || process.cwd(), encoding: "utf-8" });
      return json({ success: true });
    } catch (e: any) {
      console.error("Git commit error:", e);
      return json({ error: e.message || "Failed to commit" }, 500);
    }
  }

  if (url.pathname === "/api/git/stage-all" && method === "POST") {
    const body = await req.json();
    const { path: repoPath } = body;
    try {
      const { execSync } = await import("child_process");
      execSync("git add -A", { cwd: repoPath || process.cwd() });
      return json({ success: true });
    } catch (e: any) {
      console.error("Git stage-all error:", e);
      return json({ error: e.message || "Failed to stage all" }, 500);
    }
  }

  if (url.pathname === "/api/git/init" && method === "POST") {
    const body = await req.json();
    const { path: repoPath } = body;
    try {
      const { execSync } = await import("child_process");
      const cwd = repoPath || process.cwd();
      execSync("git init", { cwd, encoding: "utf-8" });
      return json({ success: true });
    } catch (e: any) {
      console.error("Git init error:", e);
      return json({ error: e.message || "Failed to initialize git repository" }, 500);
    }
  }

  if (url.pathname === "/api/git/summarize-changes" && method === "POST") {
    const body = await req.json();
    const { path: repoPath } = body;
    try {
      const { execSync } = await import("child_process");
      const cwd = repoPath || process.cwd();

      // Get working tree diff (both staged and unstaged)
      const workingDiff = execSync("git diff HEAD", { cwd, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });

      // Also get untracked files
      const untrackedFiles = execSync("git ls-files --others --exclude-standard", { cwd, encoding: "utf-8" }).trim();

      if (!workingDiff.trim() && !untrackedFiles) {
        return json({ summary: ["No changes to summarize"] });
      }

      // Truncate diff if too large
      const truncatedDiff = workingDiff.length > 10000
        ? workingDiff.slice(0, 10000) + "\n\n... (diff truncated)"
        : workingDiff;

      // Get list of changed files
      const changedFiles = execSync("git diff HEAD --name-only", { cwd, encoding: "utf-8" }).trim();

      const prompt = `Analyze this git diff and summarize WHAT FEATURES/CHANGES are being implemented.

Changed files:
${changedFiles}
${untrackedFiles ? `\nNew files:\n${untrackedFiles}` : ""}

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\`

## Instructions

1. Identify the HIGH-LEVEL features or changes being made
2. Focus on WHAT the user gains or what functionality changes - NOT code details
3. Group related changes together into single feature descriptions
4. Use clear, non-technical language where possible
5. Each bullet should describe a distinct feature or change

## Output Format

Return ONLY a bulleted list (3-6 items max), one feature/change per line:
• Implemented X feature that does Y
• Added ability to Z
• Fixed issue where A happened
• Improved B by doing C

NO explanations, NO code references, NO file names. Just the feature descriptions.`;

      const systemPrompt = "You are an expert at understanding code changes and explaining them in terms of features and functionality. Focus on WHAT changes, not HOW. Be concise.";

      const response = await fetch("http://localhost:3001/api/ephemeral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemPrompt,
          maxTokens: 500,
          projectPath: cwd,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Parse bullets from response
      const result = data.result?.trim() || "";
      const bullets = result
        .split("\n")
        .map((line: string) => line.replace(/^[•\-\*]\s*/, "").trim())
        .filter((line: string) => line.length > 0);

      return json({ summary: bullets, usage: data.usage, costUsd: data.costUsd });
    } catch (e: any) {
      console.error("Summarize changes error:", e);
      return json({ error: e.message || "Failed to summarize changes" }, 500);
    }
  }

  if (url.pathname === "/api/git/generate-commit-message" && method === "POST") {
    const body = await req.json();
    const { path: repoPath } = body;
    try {
      const { execSync } = await import("child_process");
      const cwd = repoPath || process.cwd();

      // Get staged diff (50MB buffer to handle large diffs - we truncate anyway)
      const stagedDiff = execSync("git diff --cached", { cwd, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });

      if (!stagedDiff.trim()) {
        return json({ error: "No staged changes to analyze" }, 400);
      }

      // Truncate diff if too large (keep first 8000 chars for context)
      const truncatedDiff = stagedDiff.length > 8000
        ? stagedDiff.slice(0, 8000) + "\n\n... (diff truncated)"
        : stagedDiff;

      // Get list of staged files for additional context
      const stagedFiles = execSync("git diff --cached --name-only", { cwd, encoding: "utf-8" }).trim();

      // Call ephemeral chat to generate message
      const prompt = `Analyze this git diff and generate a commit message as a LIST of conventional commit lines - one line per distinct change.

Files changed:
${stagedFiles}

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\`

## Format

Each line follows: <type>[optional scope]: <description>

## Types:
- feat: A new feature
- fix: A bug fix
- docs: Documentation only
- style: Formatting, no code change
- refactor: Code restructuring
- perf: Performance improvement
- test: Adding/fixing tests
- build: Build system changes
- ci: CI config changes
- chore: Other maintenance

## Rules:
1. One line per distinct change/feature/fix
2. Each line max 72 characters
3. Imperative mood ("add" not "added")
4. No periods at end
5. Scope is optional: feat(auth): or fix(api):
6. IMPORTANT: Describe the OUTCOME/BENEFIT, not the code change
   - BAD: "add maxTokens parameter to API call"
   - GOOD: "allow longer AI-generated commit messages"
   - BAD: "change condition in auth middleware"
   - GOOD: "prevent users from being logged out unexpectedly"

## Example output for a commit with multiple changes:

feat(git): generate comprehensive multi-line commit messages
fix(auth): prevent session timeout during active use
refactor(api): improve request validation reliability
perf(search): reduce search latency for large repos

IMPORTANT: Output ONLY the list of commit lines, one per line. No explanations, no markdown, no bullets, no dashes at the start. Just the conventional commit lines. Focus on WHAT the user gains, not WHAT the code does.`;

      const systemPrompt = "You are an expert at writing git commit messages following the Conventional Commits specification. Output ONLY the commit message, nothing else. No markdown, no quotes, no explanations.";

      // Use ephemeral chat endpoint internally
      const response = await fetch("http://localhost:3001/api/ephemeral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemPrompt,
          maxTokens: 1000,
          projectPath: cwd,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Clean up the result (remove quotes, trim)
      let message = data.result?.trim() || "";
      message = message.replace(/^["']|["']$/g, "").trim();

      return json({ message, usage: data.usage, costUsd: data.costUsd });
    } catch (e: any) {
      console.error("Generate commit message error:", e);
      return json({ error: e.message || "Failed to generate commit message" }, 500);
    }
  }

  // Get remotes
  if (url.pathname === "/api/git/remotes") {
    const repoPath = url.searchParams.get("path") || process.cwd();
    try {
      const { execSync } = await import("child_process");

      // Check if it's a git repo first
      try {
        execSync("git rev-parse --git-dir", { cwd: repoPath, stdio: "pipe" });
      } catch {
        return json({ remotes: [] });
      }

      const output = execSync("git remote -v", { cwd: repoPath, encoding: "utf-8" });
      const remotes: { name: string; url: string; type: "fetch" | "push" }[] = [];
      const seen = new Set<string>();

      for (const line of output.split("\n").filter(Boolean)) {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
        if (match) {
          const key = `${match[1]}-${match[3]}`;
          if (!seen.has(key)) {
            seen.add(key);
            remotes.push({
              name: match[1],
              url: match[2],
              type: match[3] as "fetch" | "push",
            });
          }
        }
      }

      return json({ remotes });
    } catch (e) {
      console.error("Git remotes error:", e);
      return json({ error: "Failed to get remotes" }, 500);
    }
  }

  // Add remote
  if (url.pathname === "/api/git/remote/add" && method === "POST") {
    const body = await req.json();
    const { path: repoPath, name, url: remoteUrl } = body;
    if (!name || !remoteUrl) {
      return json({ error: "name and url required" }, 400);
    }
    try {
      const { execSync } = await import("child_process");
      execSync(`git remote add "${name}" "${remoteUrl}"`, { cwd: repoPath || process.cwd() });
      return json({ success: true });
    } catch (e: any) {
      console.error("Git remote add error:", e);
      return json({ error: e.message || "Failed to add remote" }, 500);
    }
  }

  // Push
  if (url.pathname === "/api/git/push" && method === "POST") {
    const body = await req.json();
    const { path: repoPath, remote = "origin", branch, setUpstream = false } = body;
    try {
      const { execSync } = await import("child_process");
      const cwd = repoPath || process.cwd();

      // Get current branch if not specified
      const targetBranch = branch || execSync("git branch --show-current", { cwd, encoding: "utf-8" }).trim();

      let cmd = `git push ${remote} ${targetBranch}`;
      if (setUpstream) {
        cmd = `git push -u ${remote} ${targetBranch}`;
      }

      execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe" });
      return json({ success: true, branch: targetBranch });
    } catch (e: any) {
      console.error("Git push error:", e);
      const errorMsg = e.stderr?.toString() || e.message || "Failed to push";
      return json({ error: errorMsg }, 500);
    }
  }

  // Pull
  if (url.pathname === "/api/git/pull" && method === "POST") {
    const body = await req.json();
    const { path: repoPath, remote = "origin", branch } = body;
    try {
      const { execSync } = await import("child_process");
      const cwd = repoPath || process.cwd();

      // Get current branch if not specified
      const targetBranch = branch || execSync("git branch --show-current", { cwd, encoding: "utf-8" }).trim();

      execSync(`git pull ${remote} ${targetBranch}`, { cwd, encoding: "utf-8", stdio: "pipe" });
      return json({ success: true });
    } catch (e: any) {
      console.error("Git pull error:", e);
      const errorMsg = e.stderr?.toString() || e.message || "Failed to pull";
      return json({ error: errorMsg }, 500);
    }
  }

  return null;
}
