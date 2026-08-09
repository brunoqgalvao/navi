/**
 * Why each harness (and the Z.ai model group) can or cannot run, and what would fix it.
 *
 * Joins three sources that already existed but were never combined: the backend list, the
 * Codex health probe, and the auth status. Before this, a harness that genuinely could not
 * run was either unmarked or — for Z.ai — hidden entirely, with no route to fixing it.
 */
import { writable } from "svelte/store";
import type { BackendId } from "./session";
import { api, backendsApi, type BackendInfo, type CodexHealthInfo } from "../api";

export type ProviderAuthStatus = Awaited<ReturnType<typeof api.auth.status>>;

/** What the menu can offer: the three harnesses, plus Z.ai as a model group. */
export type MenuEntryId = BackendId | "zai";

export type AvailabilityFix = { kind: "settings" } | { kind: "command"; command: string };

export type EntryAvailability =
  | { state: "ready" }
  | { state: "needs-setup"; reason: string; fix: AvailabilityFix };

const READY: EntryAvailability = { state: "ready" };

const INSTALL_COMMAND: Record<BackendId, string> = {
  claude: "npm i -g @anthropic-ai/claude-code",
  codex: "npm i -g @openai/codex",
  gemini: "npm i -g @google/gemini-cli",
};

const notFound = (id: BackendId, label: string): EntryAvailability => ({
  state: "needs-setup",
  reason: `${label} CLI not found`,
  fix: { kind: "command", command: INSTALL_COMMAND[id] },
});

const needsSettings = (reason: string): EntryAvailability => ({
  state: "needs-setup",
  reason,
  fix: { kind: "settings" },
});

export function deriveRunAvailability(
  backends: BackendInfo[],
  codexHealth: CodexHealthInfo | null,
  auth: ProviderAuthStatus
): Record<MenuEntryId, EntryAvailability> {
  const installed = (id: BackendId) => backends.find((b) => b.id === id)?.installed ?? false;

  const claude = !installed("claude")
    ? notFound("claude", "Claude")
    : !auth.hasOAuth && !auth.hasApiKey
      ? needsSettings("Not signed in")
      : READY;

  // The installed guard matters: with no path, detectCodexAuthMode returns "unknown"
  // (server/routes/backends.ts:70), so an uninstalled Codex would otherwise report the
  // wrong reason with the wrong fix.
  const codex = !installed("codex")
    ? notFound("codex", "Codex")
    : codexHealth?.authMode === "not_logged_in"
      ? needsSettings("Not signed in")
      : codexHealth == null || codexHealth.authMode === "unknown"
        ? needsSettings("Couldn't read sign-in state")
        : READY;

  const gemini = !installed("gemini") ? notFound("gemini", "Gemini") : READY;

  // Z.ai models run on the Claude runtime, so a key without a usable Claude is not runnable.
  const zai =
    claude.state !== "ready"
      ? claude
      : !auth.hasZaiKey
        ? needsSettings("No Z.ai API key")
        : READY;

  return { claude, codex, gemini, zai };
}

/**
 * Lazily fetched because the Codex probe is expensive: it spawns `codex login status` with a
 * 4s timeout and `codex --version`, scans ~/.codex/skills parsing YAML per skill, and tails
 * 256KB of log. Mounting the composer must not pay that; opening the menu may.
 */
const TTL_MS = 60_000;

function createRunAvailability() {
  const { subscribe, set } = writable<Record<MenuEntryId, EntryAvailability> | null>(null);
  let fetchedAt = 0;
  let inFlight: Promise<void> | null = null;

  async function refresh(force = false): Promise<void> {
    if (!force && Date.now() - fetchedAt < TTL_MS) return;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const [backends, codexHealth, auth] = await Promise.all([
          backendsApi.list(),
          backendsApi.getCodexHealth().catch(() => null),
          api.auth.status(),
        ]);
        set(deriveRunAvailability(backends, codexHealth, auth));
        fetchedAt = Date.now();
      } catch (e) {
        console.error("Failed to load harness availability:", e);
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  return {
    subscribe,
    refresh,
    invalidate: () => {
      fetchedAt = 0;
    },
  };
}

export const runAvailability = createRunAvailability();
