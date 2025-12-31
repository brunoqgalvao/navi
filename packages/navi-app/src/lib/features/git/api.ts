import type { GitStatus, GitCommit, GitBranches } from "./types";
import { getApiBase } from "../../config";

const getGitApiBase = () => `${getApiBase()}/git`;

export async function getStatus(repoPath: string): Promise<GitStatus> {
  const res = await fetch(`${getGitApiBase()}/status?path=${encodeURIComponent(repoPath)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  // Handle non-git repo response
  if (data.isGitRepo === false) {
    return {
      isGitRepo: false,
      branch: "",
      staged: [],
      modified: [],
      untracked: [],
      ahead: 0,
      behind: 0,
    };
  }
  return { isGitRepo: true, ...data };
}

export async function getLog(repoPath: string, limit = 50): Promise<GitCommit[]> {
  const res = await fetch(`${getGitApiBase()}/log?path=${encodeURIComponent(repoPath)}&limit=${limit}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.commits;
}

export async function getBranches(repoPath: string): Promise<GitBranches> {
  const res = await fetch(`${getGitApiBase()}/branches?path=${encodeURIComponent(repoPath)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function getDiff(repoPath: string, file?: string, staged = false): Promise<string> {
  const params = new URLSearchParams({ path: repoPath });
  if (file) params.set("file", file);
  if (staged) params.set("staged", "true");

  const res = await fetch(`${getGitApiBase()}/diff?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.diff;
}

export async function getCommitDiff(repoPath: string, commit: string): Promise<string> {
  const res = await fetch(`${getGitApiBase()}/diff-commit?path=${encodeURIComponent(repoPath)}&commit=${commit}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.diff;
}

export async function checkout(repoPath: string, branch: string): Promise<void> {
  const res = await fetch(`${getGitApiBase()}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath, branch }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to checkout");
}

export async function stageFiles(repoPath: string, files: string[]): Promise<void> {
  const res = await fetch(`${getGitApiBase()}/stage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath, files }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to stage");
}

export async function unstageFiles(repoPath: string, files: string[]): Promise<void> {
  const res = await fetch(`${getGitApiBase()}/unstage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath, files }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to unstage");
}

export async function commit(repoPath: string, message: string): Promise<void> {
  const res = await fetch(`${getGitApiBase()}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath, message }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to commit");
}

export async function stageAll(repoPath: string): Promise<void> {
  const res = await fetch(`${getGitApiBase()}/stage-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to stage all");
}

export async function generateCommitMessage(repoPath: string): Promise<string> {
  const res = await fetch(`${getGitApiBase()}/generate-commit-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.message;
}

export async function summarizeChanges(repoPath: string): Promise<string[]> {
  const res = await fetch(`${getGitApiBase()}/summarize-changes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.summary;
}

export async function initRepo(repoPath: string): Promise<void> {
  const res = await fetch(`${getGitApiBase()}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to init repository");
}
