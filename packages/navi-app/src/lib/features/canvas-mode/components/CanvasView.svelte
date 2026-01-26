<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    SvelteFlow,
    Background,
    MiniMap,
    BackgroundVariant,
    useSvelteFlow,
    type NodeTypes,
    type Node,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";

  import { canvasNodes, canvasEdges, canvasPositions, selectedNodeId } from "../stores";
  import { FIT_VIEW_OPTIONS, ZOOM_LIMITS, DEFAULT_VIEWPORT } from "../constants";
  import type { CanvasNodeData, SessionNodeData, ProjectNodeData } from "../types";

  import WorkspaceNode from "./nodes/WorkspaceNode.svelte";
  import ProjectNode from "./nodes/ProjectNode.svelte";
  import SessionNode from "./nodes/SessionNode.svelte";
  import AgentNode from "./nodes/AgentNode.svelte";
  import CanvasToolbar from "./CanvasToolbar.svelte";

  interface Props {
    onClose: () => void;
    onSessionSelect?: (sessionId: string, projectId: string) => void;
    onProjectSelect?: (projectId: string) => void;
  }

  let { onClose, onSessionSelect, onProjectSelect }: Props = $props();

  // Current zoom level
  let currentZoom = $state(DEFAULT_VIEWPORT.zoom);

  // Node types mapping - cast to satisfy xyflow types
  const nodeTypes = {
    workspace: WorkspaceNode,
    project: ProjectNode,
    session: SessionNode,
    agent: AgentNode,
  } as NodeTypes;

  // Handle node drag end - persist position
  // NodeTargetEventWithPointer signature: { targetNode, nodes, event }
  function handleNodeDragStop({ targetNode }: { targetNode: Node | null; nodes: Node[]; event: MouseEvent | TouchEvent }) {
    if (targetNode) {
      canvasPositions.setNodePosition(targetNode.id, targetNode.position);
    }
  }

  // Track for double-click detection
  let lastClickTime = 0;
  let lastClickedNodeId = "";
  const DOUBLE_CLICK_THRESHOLD = 300; // ms

  // Handle node click (with double-click detection)
  // NodeEventWithPointer signature: { node, event }
  function handleNodeClick({ node }: { node: Node; event: MouseEvent | TouchEvent }) {
    const now = Date.now();
    const isDoubleClick = node.id === lastClickedNodeId && (now - lastClickTime) < DOUBLE_CLICK_THRESHOLD;

    lastClickTime = now;
    lastClickedNodeId = node.id;

    if (isDoubleClick) {
      // Handle double-click - open session/project
      const data = node.data as CanvasNodeData;

      if (data.type === "session" || data.type === "agent") {
        const sessionData = data as SessionNodeData;
        onSessionSelect?.(sessionData.sessionId, sessionData.projectId);
        onClose();
      } else if (data.type === "project") {
        const projectData = data as ProjectNodeData;
        onProjectSelect?.(projectData.projectId);
        onClose();
      }
    } else {
      // Single click - just select
      selectedNodeId.set(node.id);
    }
  }

  // Handle viewport change (panning/zooming)
  function handleMoveEnd(_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) {
    currentZoom = viewport.zoom;
    canvasPositions.setViewport(viewport);
  }

  // Keyboard handler
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
  });
</script>

<div class="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-900">
  <CanvasToolbar
    zoom={currentZoom}
    onZoomIn={() => {/* handled via useSvelteFlow inside if needed */}}
    onZoomOut={() => {}}
    onFitView={() => {}}
    onResetPositions={() => {
      canvasPositions.clear();
    }}
    {onClose}
  />

  <SvelteFlow
    nodes={$canvasNodes as Node[]}
    edges={$canvasEdges as any[]}
    {nodeTypes}
    fitView
    fitViewOptions={FIT_VIEW_OPTIONS}
    minZoom={ZOOM_LIMITS.min}
    maxZoom={ZOOM_LIMITS.max}
    initialViewport={DEFAULT_VIEWPORT}
    onnodedragstop={handleNodeDragStop}
    onnodeclick={handleNodeClick}
    onmoveend={handleMoveEnd}
    class="canvas-flow"
  >
    <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
    <MiniMap
      nodeColor={(node) => {
        const data = node.data as unknown as CanvasNodeData;
        switch (data?.type) {
          case "workspace":
            return "#64748b"; // slate-500
          case "project":
            return "#3b82f6"; // blue-500
          case "session":
            return "#10b981"; // emerald-500
          case "agent":
            return "#8b5cf6"; // violet-500
          default:
            return "#94a3b8"; // slate-400
        }
      }}
      class="minimap-custom"
    />
  </SvelteFlow>
</div>

<style>
  :global(.canvas-flow) {
    width: 100%;
    height: 100%;
  }

  :global(.canvas-flow .svelte-flow__node) {
    cursor: grab;
  }

  :global(.canvas-flow .svelte-flow__node:active) {
    cursor: grabbing;
  }

  :global(.canvas-flow .svelte-flow__edge-path) {
    stroke-width: 2;
  }

  :global(.canvas-flow .svelte-flow__minimap) {
    bottom: 60px;
    right: 16px;
  }

  :global(.minimap-custom) {
    background: rgba(255, 255, 255, 0.8) !important;
    border-radius: 8px !important;
    border: 1px solid rgb(229, 231, 235) !important;
  }

  :global(.dark .minimap-custom) {
    background: rgba(31, 41, 55, 0.8) !important;
    border-color: rgb(55, 65, 81) !important;
  }

  :global(.canvas-flow .svelte-flow__controls) {
    display: none; /* We use our custom toolbar */
  }
</style>
