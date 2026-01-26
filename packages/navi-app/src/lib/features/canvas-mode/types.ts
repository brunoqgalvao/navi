/**
 * Canvas Mode Types
 *
 * Types for the infinite canvas workspace visualization
 * @experimental
 */

import type { Node, Edge } from "@xyflow/svelte";
import type { AgentStatus } from "../session-hierarchy/types";

// Index signature helper for xyflow compatibility
export interface IndexableRecord {
  [key: string]: unknown;
}

// =============================================================================
// CANVAS NODE TYPES
// =============================================================================

export type CanvasNodeType = "workspace" | "project" | "session" | "agent";

export interface BaseNodeData extends IndexableRecord {
  label: string;
  type: CanvasNodeType;
}

export interface WorkspaceNodeData extends BaseNodeData {
  type: "workspace";
  folderId: string;
  projectCount: number;
  sessionCount: number;
  collapsed?: boolean;
}

export interface ProjectNodeData extends BaseNodeData {
  type: "project";
  projectId: string;
  projectPath: string;
  sessionCount: number;
  activeCount: number;
  totalCost: number;
  folderId?: string;
}

export interface SessionNodeData extends BaseNodeData {
  type: "session";
  sessionId: string;
  projectId: string;
  model: string | null;
  status: AgentStatus | "idle" | "running" | "permission";
  childCount: number;
  updatedAt: number;
  isRoot: boolean;
}

export interface AgentNodeData extends BaseNodeData {
  type: "agent";
  sessionId: string;
  parentSessionId: string;
  role: string | null;
  task: string | null;
  agentType: string | null; // browser, coding, runner, etc.
  status: AgentStatus;
  depth: number;
}

export type CanvasNodeData =
  | WorkspaceNodeData
  | ProjectNodeData
  | SessionNodeData
  | AgentNodeData;

// Svelte Flow node with our data
export type CanvasNode = Node<CanvasNodeData>;

// =============================================================================
// CANVAS EDGE TYPES
// =============================================================================

export type CanvasEdgeType = "hierarchy" | "contains" | "spawned";

export interface CanvasEdgeData extends IndexableRecord {
  edgeType: CanvasEdgeType;
  animated?: boolean;
}

export type CanvasEdge = Edge<CanvasEdgeData>;

// =============================================================================
// CANVAS STATE
// =============================================================================

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface CanvasPositions {
  nodes: Record<string, NodePosition>;
  viewport: CanvasViewport;
}

// localStorage structure
export interface CanvasStorage {
  positions: CanvasPositions;
  version: number;
}

// =============================================================================
// CANVAS EVENTS
// =============================================================================

export interface CanvasNodeSelectEvent {
  nodeId: string;
  nodeType: CanvasNodeType;
  data: CanvasNodeData;
}

export interface CanvasNodeDoubleClickEvent {
  nodeId: string;
  nodeType: CanvasNodeType;
  data: CanvasNodeData;
}

// =============================================================================
// LAYOUT
// =============================================================================

export type LayoutDirection = "TB" | "LR" | "BT" | "RL"; // Top-Bottom, Left-Right, etc.

export interface LayoutOptions {
  direction: LayoutDirection;
  nodeSpacing: number;
  rankSpacing: number;
}
