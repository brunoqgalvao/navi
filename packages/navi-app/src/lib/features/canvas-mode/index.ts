/**
 * Canvas Mode Feature
 *
 * Infinite canvas visualization for workspaces, projects, sessions, and agents
 * @experimental
 */

// Types
export type {
  CanvasNodeType,
  CanvasNodeData,
  WorkspaceNodeData,
  ProjectNodeData,
  SessionNodeData,
  AgentNodeData,
  CanvasNode,
  CanvasEdge,
  CanvasEdgeData,
  CanvasEdgeType,
  CanvasViewport,
  NodePosition,
  CanvasPositions,
  CanvasStorage,
  CanvasNodeSelectEvent,
  CanvasNodeDoubleClickEvent,
  LayoutDirection,
  LayoutOptions,
} from "./types";

// Stores
export {
  canvasNodes,
  canvasEdges,
  canvasPositions,
  selectedNodeId,
} from "./stores";

// Constants
export {
  NODE_DIMENSIONS,
  NODE_COLORS,
  AGENT_TYPE_COLORS,
  STATUS_COLORS,
  DEFAULT_LAYOUT,
  DEFAULT_VIEWPORT,
  ZOOM_LIMITS,
  FIT_VIEW_OPTIONS,
  EDGE_STYLES,
  CANVAS_STORAGE_KEY,
  CANVAS_STORAGE_VERSION,
} from "./constants";

// Components
export { default as CanvasView } from "./components/CanvasView.svelte";
export { default as CanvasToolbar } from "./components/CanvasToolbar.svelte";
export { default as WorkspaceNode } from "./components/nodes/WorkspaceNode.svelte";
export { default as ProjectNode } from "./components/nodes/ProjectNode.svelte";
export { default as SessionNode } from "./components/nodes/SessionNode.svelte";
export { default as AgentNode } from "./components/nodes/AgentNode.svelte";
