import type { GitStatus, GitCommit, GitBranches } from "./types";

const API_BASE = "http://localhost:3001/api/git";

export async function getStatus(repoPath: string): Promise<GitStatus> {
  const res = await fetch(`${API_BASE}/status?path=${encodeURIComponent(repoPath)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function getLog(repoPath: string, limit = 50): Promise<GitCommit[]> {
  const res = await fetch(`${API_BASE}/log?path=${encodeURIComponent(repoPath)}&limit=${limit}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.commits;
}

export async function getBranches(repoPath: string): Promise<GitBranches> {
  const res = await fetch(`${API_BASE}/branches?path=${encodeURIComponent(repoPath)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function getDiff(repoPath: string, file?: string, staged = false): Promise<string> {
  const params = new URLSearchParams({ path: repoPath });
  if (file) params.set("file", file);
  if (staged) params.set("staged", "true");

  const res = await fetch(`${API_BASE}/diff?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.diff;
}

export async function getCommitDiff(repoPath: string, commit: string): Promise<string> {
  const res = await fetch(`${API_BASE}/diff-commit?path=${encodeURIComponent(repoPath)}&commit=${commit}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.diff;
}

export async function checkout(repoPath: string, branch: string): Promise<void> {
  const res = await fetch(`${API_BASE}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath, branch }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to checkout");
}

export async function stageFiles(repoPath: string, files: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/stage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath, files }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to stage");
}

export async function unstageFiles(repoPath: string, files: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/unstage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath, files }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to unstage");
}

export async function commit(repoPath: string, message: string): Promise<void> {
  const res = await fetch(`${API_BASE}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath, message }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to commit");
}

export async function stageAll(repoPath: string): Promise<void> {
  const res = await fetch(`${API_BASE}/stage-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to stage all");
}

export async function generateCommitMessage(repoPath: string): Promise<string> {
  const res = await fetch(`${API_BASE}/generate-commit-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: repoPath }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.message;
}
