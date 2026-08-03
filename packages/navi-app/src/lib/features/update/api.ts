import { getApiBase } from "../../config";

export interface UpdateStatus {
  version: string;
  branch: string;
  commit: string;
  behind: number;
  commits: { hash: string; subject: string }[];
  managedByLaunchd: boolean;
  checkedAt: number;
  error?: string;
}

export async function getUpdateStatus(force = false): Promise<UpdateStatus> {
  const res = await fetch(`${getApiBase()}/update/status${force ? "?force=1" : ""}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function applyUpdate(): Promise<{ ok: boolean; restarting: boolean; message?: string }> {
  const res = await fetch(`${getApiBase()}/update/apply`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "update failed");
  return data;
}
