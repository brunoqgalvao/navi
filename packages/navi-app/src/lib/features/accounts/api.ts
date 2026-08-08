import type { AccountsStatus, UsageResponse } from "./types";
import { getApiBase } from "../../config";

export async function getAccountsStatus(force = false): Promise<AccountsStatus> {
  const res = await fetch(`${getApiBase()}/accounts/status${force ? "?force=1" : ""}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getUsage(force = false): Promise<UsageResponse> {
  const res = await fetch(`${getApiBase()}/accounts/usage${force ? "?force=1" : ""}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function swapAccount(account: string): Promise<{ ok: boolean; output: string }> {
  const res = await fetch(`${getApiBase()}/accounts/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "swap failed");
  return data;
}
