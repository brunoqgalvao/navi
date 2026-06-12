/**
 * tree.ts — cross-backend agent tree orchestration.
 *
 * Pure orchestration logic. NO MCP dependency.
 *
 * AgentTree manages a hierarchy of agent sessions across any registered
 * backend. It enforces:
 *   - maxDepth: root is depth 0; spawning at depth >= maxDepth is rejected
 *   - maxChildren: max concurrent children per parent
 *   - costCeilingUsd: when accumulated cost across all agents exceeds this,
 *     all running children are cancelled
 *   - permission bubbling: child permission-request events are re-emitted via
 *     onRootEvent; respondToPermission routes back to the originating child
 */

import { randomUUID } from "node:crypto";
import type { GatewayEvent } from "../events.js";
import type { AgentSession, BackendId, SessionOptions } from "../types.js";
import type { BackendRegistry } from "../registry.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentStatus = "running" | "done" | "error" | "cancelled";

export interface AgentNode {
  id: string;
  backend: BackendId;
  task: string;
  depth: number;
  parentId: string | null;
  status: AgentStatus;
  costUsd: number;
  textChunks: string[];
  errorMessage?: string;
  session: AgentSession;
  childIds: Set<string>;
  permissionMode: SessionOptions["permissionMode"];
}

export interface SpawnOptions {
  backend: BackendId;
  model?: string;
  task: string;
  cwd?: string;
  permissionMode?: SessionOptions["permissionMode"];
  parentId?: string;
}

export interface SpawnResult {
  childId: string;
}

export interface AgentInfo {
  id: string;
  backend: BackendId;
  status: AgentStatus;
  task: string;
  depth: number;
  costUsd: number;
}

export interface AgentResult {
  status: AgentStatus;
  text?: string;
  error?: string;
}

export interface AgentTreeOptions {
  maxDepth?: number;
  maxChildren?: number;
  costCeilingUsd?: number;
  defaultPermissionMode: SessionOptions["permissionMode"];
  cwd: string;
  onRootEvent?: (e: GatewayEvent) => void;
}

// ── AgentTree ─────────────────────────────────────────────────────────────────

export class AgentTree {
  private readonly _registry: BackendRegistry;
  private readonly _maxDepth: number;
  private readonly _maxChildren: number;
  private readonly _costCeilingUsd: number | undefined;
  private readonly _defaultPermissionMode: SessionOptions["permissionMode"];
  private readonly _cwd: string;
  private readonly _onRootEvent: ((e: GatewayEvent) => void) | undefined;

  private readonly _agents = new Map<string, AgentNode>();
  // rootId is null if no agent has been spawned yet
  private _rootId: string | null = null;
  private _totalCostUsd = 0;
  private _ceilingExceeded = false;

  constructor(registry: BackendRegistry, opts: AgentTreeOptions) {
    this._registry = registry;
    this._maxDepth = opts.maxDepth ?? 2;
    this._maxChildren = opts.maxChildren ?? 5;
    this._costCeilingUsd = opts.costCeilingUsd;
    this._defaultPermissionMode = opts.defaultPermissionMode;
    this._cwd = opts.cwd;
    this._onRootEvent = opts.onRootEvent;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  spawnAgent(opts: SpawnOptions): SpawnResult {
    const backend = this._registry.get(opts.backend);

    // Determine depth
    let depth = 0;
    let parent: AgentNode | null = null;
    if (opts.parentId) {
      parent = this._agents.get(opts.parentId) ?? null;
      if (!parent) {
        throw new Error(`Parent agent ${opts.parentId} not found`);
      }
      depth = parent.depth + 1;
    }

    // Enforce depth limit
    if (depth > this._maxDepth) {
      throw new Error(
        `Depth limit exceeded: cannot spawn at depth ${depth} (maxDepth=${this._maxDepth})`
      );
    }

    // Enforce concurrent children limit per parent
    if (parent) {
      const runningChildren = Array.from(parent.childIds).filter((id) => {
        const child = this._agents.get(id);
        return child?.status === "running";
      }).length;
      if (runningChildren >= this._maxChildren) {
        throw new Error(
          `Children limit exceeded: parent ${opts.parentId} already has ${runningChildren} running children (maxChildren=${this._maxChildren})`
        );
      }
    }

    // Determine permission mode: use explicit opt, else inherit from parent node,
    // else fall back to the tree default.
    const permissionMode =
      opts.permissionMode ?? parent?.permissionMode ?? this._defaultPermissionMode;

    const sessionOpts: SessionOptions = {
      cwd: opts.cwd ?? this._cwd,
      model: opts.model,
      permissionMode,
    };

    const session = backend.createSession(sessionOpts);
    const childId = session.id;

    const node: AgentNode = {
      id: childId,
      backend: opts.backend,
      task: opts.task,
      depth,
      parentId: opts.parentId ?? null,
      status: "running",
      costUsd: 0,
      textChunks: [],
      session,
      childIds: new Set(),
      permissionMode,
    };

    this._agents.set(childId, node);

    if (parent) {
      parent.childIds.add(childId);
    } else {
      this._rootId = childId;
    }

    // Run the session in background
    this._runAgent(node);

    return { childId };
  }

  listAgents(): AgentInfo[] {
    return Array.from(this._agents.values()).map((n) => ({
      id: n.id,
      backend: n.backend,
      status: n.status,
      task: n.task,
      depth: n.depth,
      costUsd: n.costUsd,
    }));
  }

  getAgentResult(id: string): AgentResult {
    const node = this._agents.get(id);
    if (!node) {
      return { status: "error", error: `Agent ${id} not found` };
    }
    if (node.status === "running") {
      return { status: "running" };
    }
    return {
      status: node.status,
      text: node.textChunks.join(""),
      error: node.errorMessage,
    };
  }

  sendToAgent(id: string, message: string): void {
    const node = this._agents.get(id);
    if (!node) throw new Error(`Agent ${id} not found`);
    if (node.status !== "running") throw new Error(`Agent ${id} is not running`);
    // Fire and forget follow-up turn
    void this._runTurn(node, message);
  }

  respondToPermission(requestId: string, decision: "allow" | "allow-session" | "deny"): void {
    // Route to whichever agent has this pending permission
    for (const node of this._agents.values()) {
      node.session.respondToPermission(requestId, decision);
    }
  }

  async cancelAll(): Promise<void> {
    const cancels: Promise<void>[] = [];
    for (const node of this._agents.values()) {
      if (node.status === "running") {
        node.status = "cancelled";
        cancels.push(node.session.cancel());
      }
    }
    await Promise.all(cancels);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _runAgent(node: AgentNode): void {
    // Fire and forget — errors are captured into node.status
    void this._runTurn(node, node.task);
  }

  private async _runTurn(node: AgentNode, message: string): Promise<void> {
    try {
      const stream = node.session.send({ text: message });
      for await (const evt of stream) {
        this._handleChildEvent(node, evt);
      }
    } catch (err) {
      if (node.status !== "cancelled") {
        node.status = "error";
        node.errorMessage = err instanceof Error ? err.message : String(err);
      }
    }
  }

  private _handleChildEvent(node: AgentNode, evt: GatewayEvent): void {
    switch (evt.type) {
      case "text-delta":
        node.textChunks.push(evt.text);
        break;

      case "usage":
        if (evt.usage.costUsd !== undefined) {
          node.costUsd += evt.usage.costUsd;
          this._totalCostUsd += evt.usage.costUsd;
          this._checkCostCeiling();
        }
        break;

      case "done":
        if (node.status === "running") {
          node.status = evt.reason === "complete" ? "done" : evt.reason === "cancelled" ? "cancelled" : "error";
        }
        break;

      case "error":
        if (evt.fatal) {
          node.status = "error";
          node.errorMessage = evt.message;
        }
        break;

      case "permission-request":
        // Bubble permission-request events to the root event handler
        // The caller can respond via respondToPermission which routes back
        this._onRootEvent?.(evt);
        break;

      default:
        // Other events (tool-start, tool-end, etc.) also bubble if needed
        break;
    }

    // Emit agent-spawned events for the root observer
    if (evt.type === "agent-spawned") {
      this._onRootEvent?.(evt);
    }
  }

  private _checkCostCeiling(): void {
    if (this._ceilingExceeded) return;
    if (this._costCeilingUsd === undefined) return;
    if (this._totalCostUsd >= this._costCeilingUsd) {
      this._ceilingExceeded = true;
      // Cancel all running agents
      void this.cancelAll();
    }
  }

  get totalCostUsd(): number {
    return this._totalCostUsd;
  }
}
