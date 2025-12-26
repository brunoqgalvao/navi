import { json } from "../utils/response";

export async function handleGitRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  if (url.pathname === "/api/git/status") {
    const repoPath = url.searchParams.get("path") || process.cwd();
    try {
      const { execSync } = await import("child_process");

      try {
        execSync("git rev-parse --git-dir", { cwd: repoPath, stdio: "pipe" });
      } catch {
        return json({ error: "Not a git repository" }, 400);
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

      return json({ branch, staged, modified, untracked, ahead, behind });
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

  if (url.pathname === "/api/git/generate-commit-message" && method === "POST") {
    const body = await req.json();
    const { path: repoPath } = body;
    try {
      const { execSync } = await import("child_process");
      const cwd = repoPath || process.cwd();

      // Get staged diff
      const stagedDiff = execSync("git diff --cached", { cwd, encoding: "utf-8", maxBuffer: 1024 * 1024 });

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
      const prompt = `Analyze this git diff and generate a concise, conventional commit message.

Files changed:
${stagedFiles}

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\`

Rules:
- Use conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, style, test, chore
- Keep the first line under 72 characters
- Be specific about what changed
- Don't include the diff in your response
- Only respond with the commit message, nothing else`;

      const systemPrompt = "You are a helpful assistant that generates git commit messages. Respond only with the commit message, no explanations or markdown.";

      // Use ephemeral chat endpoint internally
      const response = await fetch("http://localhost:3001/api/ephemeral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemPrompt,
          maxTokens: 150,
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

  return null;
}
