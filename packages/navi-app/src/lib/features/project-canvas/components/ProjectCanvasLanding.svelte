<script lang="ts">
  import {
    SvelteFlow,
    Background,
    MiniMap,
    BackgroundVariant,
    type NodeTypes,
    type Node,
  } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import "@xyflow/svelte/dist/style.css";
  import type { Session } from "$lib/api";
  import { sessionStatus } from "$lib/stores";
  import type {
    ProjectCanvasNode,
    ProjectCanvasNodeData,
    PersistedCanvasCard,
    PersistedTextLabelCard,
    PersistedProjectCanvasLayout,
    CanvasPoint,
    CanvasViewportState,
  } from "../types";
  import SessionCanvasNode from "./nodes/SessionCanvasNode.svelte";
  import FileCanvasNode from "./nodes/FileCanvasNode.svelte";
  import TextLabelNode from "./nodes/TextLabelNode.svelte";

  interface Props {
    projectId: string;
    projectName: string;
    projectPath: string;
    sessions: Session[];
    onSelectSession?: (session: Session) => void;
    onNewSession?: () => void;
    onPreviewFile?: (path: string) => void;
    onOpenFiles?: () => void;
    onSwitchView?: () => void;
  }

  const STORAGE_VERSION = 1;
  const DEFAULT_VIEWPORT: CanvasViewportState = { x: 0, y: 0, zoom: 0.9 };
  const SESSION_COLUMN_GAP = 320;
  const SESSION_ROW_GAP = 210;
  const FILE_STACK_OFFSET = 28;
  const DOUBLE_CLICK_THRESHOLD = 280;

  let {
    projectId,
    projectName,
    projectPath,
    sessions,
    onSelectSession,
    onNewSession,
    onPreviewFile,
    onOpenFiles,
    onSwitchView,
  }: Props = $props();

  let persistedItems = $state<PersistedCanvasCard[]>([]);
  let savedViewport = $state<CanvasViewportState>(DEFAULT_VIEWPORT);
  let selectedNodeId = $state<string | null>(null);
  let draggingFileOver = $state(false);
  let dragDepth = $state(0);
  let canvasKey = $state(0);
  let canvasVersion = 0;
  let lastClickedNodeId = $state("");
  let lastClickedAt = $state(0);
  let canvasElement: HTMLDivElement | null = $state(null);

  // Context menu state
  let contextMenu = $state<{ x: number; y: number; canvasPos: CanvasPoint } | null>(null);
  let labelCounter = $state(0);

  const nodeTypes = {
    "session-card": SessionCanvasNode,
    "file-card": FileCanvasNode,
    "text-label": TextLabelNode,
  } as NodeTypes;

  function storageKey(id: string): string {
    return `navi-project-canvas:${id}`;
  }

  function getSessionNodeId(sessionId: string): string {
    return `session:${sessionId}`;
  }

  function getFileNodeId(filePath: string): string {
    return `file:${encodeURIComponent(filePath)}`;
  }

  function getRelativePath(filePath: string): string {
    if (projectPath && filePath.startsWith(projectPath)) {
      const relative = filePath.slice(projectPath.length).replace(/^\/+/, "");
      return relative || filePath.split("/").pop() || filePath;
    }
    return filePath;
  }

  function getFileName(filePath: string): string {
    return filePath.split("/").pop() || filePath;
  }

  function getSessionPosition(index: number): CanvasPoint {
    return {
      x: 56 + (index % 3) * SESSION_COLUMN_GAP,
      y: 64 + Math.floor(index / 3) * SESSION_ROW_GAP,
    };
  }

  function getFallbackFilePosition(fileIndex: number): CanvasPoint {
    return {
      x: 110 + fileIndex * FILE_STACK_OFFSET,
      y: 420 + fileIndex * FILE_STACK_OFFSET,
    };
  }

  function loadLayout(id: string): PersistedProjectCanvasLayout {
    if (typeof window === "undefined") {
      return { version: STORAGE_VERSION, viewport: DEFAULT_VIEWPORT, items: [] };
    }

    try {
      const raw = localStorage.getItem(storageKey(id));
      if (!raw) {
        return { version: STORAGE_VERSION, viewport: DEFAULT_VIEWPORT, items: [] };
      }

      const parsed = JSON.parse(raw) as PersistedProjectCanvasLayout;
      if (parsed.version !== STORAGE_VERSION) {
        return { version: STORAGE_VERSION, viewport: DEFAULT_VIEWPORT, items: [] };
      }

      return {
        version: STORAGE_VERSION,
        viewport: parsed.viewport ?? DEFAULT_VIEWPORT,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return { version: STORAGE_VERSION, viewport: DEFAULT_VIEWPORT, items: [] };
    }
  }

  function saveLayout(items: PersistedCanvasCard[], viewport: CanvasViewportState = savedViewport) {
    if (typeof window === "undefined") return;

    localStorage.setItem(
      storageKey(projectId),
      JSON.stringify({
        version: STORAGE_VERSION,
        viewport,
        items,
      } satisfies PersistedProjectCanvasLayout)
    );
  }

  function updateItemPosition(id: string, position: CanvasPoint) {
    const nextItems = persistedItems.map((item) => (item.id === id ? { ...item, position } : item));
    persistedItems = nextItems;
    saveLayout(nextItems);
  }

  function upsertFileCard(filePath: string, position: CanvasPoint) {
    const nodeId = getFileNodeId(filePath);
    const existing = persistedItems.find((item) => item.id === nodeId);
    let nextItems: PersistedCanvasCard[];

    if (existing && existing.type === "file") {
      nextItems = persistedItems.map((item) =>
        item.id === nodeId ? { ...item, position } : item
      );
    } else {
      nextItems = [
        ...persistedItems,
        {
          id: nodeId,
          type: "file",
          filePath,
          position,
        },
      ];
    }

    persistedItems = nextItems;
    saveLayout(nextItems);
    selectedNodeId = nodeId;
  }

  function removeFileCard(filePath: string) {
    const nodeId = getFileNodeId(filePath);
    const nextItems = persistedItems.filter((item) => item.id !== nodeId);
    persistedItems = nextItems;
    selectedNodeId = selectedNodeId === nodeId ? null : selectedNodeId;
    saveLayout(nextItems);
  }

  function addTextLabel(position: CanvasPoint) {
    labelCounter += 1;
    const id = `text-label:${Date.now()}-${labelCounter}`;
    const newItem: PersistedTextLabelCard = {
      id,
      type: "text-label",
      text: "Label",
      width: 160,
      height: 48,
      position,
    };
    const nextItems = [...persistedItems, newItem];
    persistedItems = nextItems;
    saveLayout(nextItems);
    selectedNodeId = id;
  }

  function updateTextLabel(id: string, text: string) {
    const nextItems = persistedItems.map((item) =>
      item.id === id && item.type === "text-label" ? { ...item, text } : item
    );
    persistedItems = nextItems;
    saveLayout(nextItems);
  }

  function resizeTextLabel(id: string, width: number, height: number) {
    const nextItems = persistedItems.map((item) =>
      item.id === id && item.type === "text-label" ? { ...item, width, height } : item
    );
    persistedItems = nextItems;
    saveLayout(nextItems);
  }

  function removeTextLabel(id: string) {
    const nextItems = persistedItems.filter((item) => item.id !== id);
    persistedItems = nextItems;
    selectedNodeId = selectedNodeId === id ? null : selectedNodeId;
    saveLayout(nextItems);
  }

  function screenToCanvasPosition(screenX: number, screenY: number): CanvasPoint {
    if (!canvasElement) return { x: 120, y: 120 };
    const rect = canvasElement.getBoundingClientRect();
    return {
      x: (screenX - rect.left - savedViewport.x) / savedViewport.zoom,
      y: (screenY - rect.top - savedViewport.y) / savedViewport.zoom,
    };
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    const canvasPos = screenToCanvasPosition(event.clientX, event.clientY);
    contextMenu = { x: event.clientX, y: event.clientY, canvasPos };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleContextNewSession() {
    closeContextMenu();
    onNewSession?.();
  }

  function handleContextAddText() {
    if (!contextMenu) return;
    addTextLabel(contextMenu.canvasPos);
    closeContextMenu();
  }

  function repackSessions() {
    const nextItems = persistedItems.filter((item) => item.type === "file" || item.type === "text-label");
    persistedItems = nextItems;
    selectedNodeId = null;
    savedViewport = DEFAULT_VIEWPORT;
    saveLayout(nextItems, DEFAULT_VIEWPORT);
    bumpCanvasKey();
  }

  function bumpCanvasKey() {
    canvasVersion += 1;
    canvasKey = canvasVersion;
  }

  function resetTransientDropState() {
    draggingFileOver = false;
    dragDepth = 0;
  }

  function readDroppedPath(event: DragEvent): string {
    const filePath =
      event.dataTransfer?.getData("application/x-file-path") ||
      event.dataTransfer?.getData("text/plain") ||
      "";

    const trimmed = filePath.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
      return trimmed;
    }

    return "";
  }

  function getDropPosition(event: DragEvent): CanvasPoint {
    if (!canvasElement) {
      return { x: 120, y: 120 };
    }

    const rect = canvasElement.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - savedViewport.x) / savedViewport.zoom,
      y: (event.clientY - rect.top - savedViewport.y) / savedViewport.zoom,
    };
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    dragDepth += 1;
    draggingFileOver = Boolean(readDroppedPath(event));
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    const hasFilePath = Boolean(readDroppedPath(event));

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = hasFilePath ? "copy" : "none";
    }

    draggingFileOver = hasFilePath;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      draggingFileOver = false;
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const filePath = readDroppedPath(event);

    resetTransientDropState();

    if (!filePath) return;
    upsertFileCard(filePath, getDropPosition(event));
  }

  function handleNodeDragStop({
    targetNode,
  }: {
    targetNode: Node | null;
    nodes: Node[];
    event: MouseEvent | TouchEvent;
  }) {
    if (!targetNode) return;
    updateItemPosition(targetNode.id, targetNode.position);
  }

  function handleNodeClick({ node }: { node: Node; event: MouseEvent | TouchEvent }) {
    const clickedAt = Date.now();
    const isDoubleClick =
      node.id === lastClickedNodeId && clickedAt - lastClickedAt < DOUBLE_CLICK_THRESHOLD;
    const data = node.data as ProjectCanvasNodeData;

    selectedNodeId = node.id;
    lastClickedNodeId = node.id;
    lastClickedAt = clickedAt;

    if (!isDoubleClick) return;

    if (data.type === "session-card") {
      data.onOpen?.(data.sessionId);
      return;
    }

    if (data.type === "file-card") {
      data.onOpen?.(data.filePath);
    }
  }

  function handlePaneClick() {
    selectedNodeId = null;
    closeContextMenu();
  }

  function handleMove(_event: MouseEvent | TouchEvent | null, viewport: CanvasViewportState) {
    savedViewport = viewport;
  }

  function handleMoveEnd(_event: MouseEvent | TouchEvent | null, viewport: CanvasViewportState) {
    savedViewport = viewport;
    saveLayout(persistedItems, viewport);
  }

  const rootSessions = $derived.by(() => {
    return [...sessions]
      .filter((session) => !session.archived && !session.parent_session_id)
      .sort((a, b) => b.updated_at - a.updated_at);
  });

  // Only track session identity (add/remove/archive), NOT updated_at.
  // Including updated_at caused the sync effect to fire on every session activity,
  // rebuilding persistedItems and resetting positions in SvelteFlow.
  // Sort by ID so reordering (from updated_at sort) doesn't trigger the effect.
  const rootSessionSignature = $derived.by(() =>
    rootSessions
      .map((session) => `${session.id}:${session.archived ? 1 : 0}`)
      .sort()
      .join("|")
  );

  const activeCount = $derived.by(() => {
    return rootSessions.filter((session) => {
      const liveStatus = $sessionStatus.get(session.id)?.status;
      return liveStatus === "running" || liveStatus === "permission" || liveStatus === "awaiting_input";
    }).length;
  });

  const pinnedFileCount = $derived.by(() => persistedItems.filter((item) => item.type === "file").length);

  const canvasNodes = $derived.by(() => {
    const sessionLayout = new Map(
      persistedItems
        .filter((item): item is Extract<PersistedCanvasCard, { type: "session" }> => item.type === "session")
        .map((item) => [item.sessionId, item.position])
    );

    const fileCards = persistedItems.filter(
      (item): item is Extract<PersistedCanvasCard, { type: "file" }> => item.type === "file"
    );

    const sessionNodes: ProjectCanvasNode[] = rootSessions.map((session, index) => {
      const liveStatus = $sessionStatus.get(session.id)?.status;
      const status =
        liveStatus === "running" ||
        liveStatus === "permission" ||
        liveStatus === "awaiting_input" ||
        liveStatus === "unread"
          ? liveStatus
          : session.marked_for_review
            ? "review"
            : "idle";

      return {
        id: getSessionNodeId(session.id),
        type: "session-card",
        draggable: true,
        selectable: true,
        selected: selectedNodeId === getSessionNodeId(session.id),
        position: sessionLayout.get(session.id) ?? getSessionPosition(index),
        data: {
          type: "session-card",
          sessionId: session.id,
          title: session.title,
          model: session.model,
          updatedAt: session.updated_at,
          totalTurns: session.total_turns,
          totalCostUsd: session.total_cost_usd,
          worktreeBranch: session.worktree_branch ?? null,
          status,
          onOpen: (sessionId: string) => {
            if (sessionId === session.id) {
              onSelectSession?.(session);
            }
          },
        },
      };
    });

    const fileNodes: ProjectCanvasNode[] = fileCards.map((item, index) => ({
      id: item.id,
      type: "file-card",
      draggable: true,
      selectable: true,
      selected: selectedNodeId === item.id,
      position: item.position ?? getFallbackFilePosition(index),
      data: {
        type: "file-card",
        filePath: item.filePath,
        name: getFileName(item.filePath),
        relativePath: getRelativePath(item.filePath),
        onOpen: (filePath: string) => onPreviewFile?.(filePath),
        onRemove: (filePath: string) => removeFileCard(filePath),
      },
    }));

    const textLabelCards = persistedItems.filter(
      (item): item is PersistedTextLabelCard => item.type === "text-label"
    );

    const textLabelNodes: ProjectCanvasNode[] = textLabelCards.map((item) => ({
      id: item.id,
      type: "text-label",
      draggable: true,
      selectable: true,
      selected: selectedNodeId === item.id,
      position: item.position,
      data: {
        type: "text-label" as const,
        text: item.text,
        width: item.width,
        height: item.height,
        onTextChange: (text: string) => updateTextLabel(item.id, text),
        onResize: (width: number, height: number) => resizeTextLabel(item.id, width, height),
        onRemove: () => removeTextLabel(item.id),
      },
    }));

    return [...sessionNodes, ...fileNodes, ...textLabelNodes];
  });

  $effect(() => {
    if (!projectId) return;
    const layout = loadLayout(projectId);
    persistedItems = layout.items;
    savedViewport = layout.viewport ?? DEFAULT_VIEWPORT;
    selectedNodeId = null;
    resetTransientDropState();
    bumpCanvasKey();
  });

  $effect(() => {
    const activeProjectId = projectId;
    if (!activeProjectId) return;

    rootSessionSignature;
    const currentItems = untrack(() => persistedItems);
    const currentRootSessions = untrack(() => rootSessions);

    const liveRootIds = new Set(currentRootSessions.map((session) => getSessionNodeId(session.id)));
    const persistedSessionCards = currentRootSessions.map((session, index) => ({
      id: getSessionNodeId(session.id),
      type: "session" as const,
      sessionId: session.id,
      position:
        currentItems.find((item) => item.type === "session" && item.sessionId === session.id)?.position ??
        getSessionPosition(index),
    }));
    const persistedFileCards = currentItems.filter((item) => item.type === "file");
    const persistedTextLabels = currentItems.filter((item) => item.type === "text-label");
    const nextItems = [...persistedSessionCards, ...persistedFileCards, ...persistedTextLabels];

    const currentSignature = JSON.stringify(
      currentItems
        .filter((item) => item.type === "session" || item.type === "file" || item.type === "text-label")
        .map((item) => {
          if (item.type === "session") {
            return `${item.id}:${item.position.x}:${item.position.y}`;
          }
          return `${item.id}:${item.position.x}:${item.position.y}`;
        })
    );

    const nextSignature = JSON.stringify(
      nextItems.map((item) => `${item.id}:${item.position.x}:${item.position.y}`)
    );

    if (
      currentSignature === nextSignature &&
      currentItems.every((item) => item.type !== "session" || liveRootIds.has(item.id))
    ) {
      return;
    }

    persistedItems = nextItems;
    saveLayout(nextItems);
  });
</script>

<div
  bind:this={canvasElement}
  role="region"
  aria-label={`${projectName} project canvas`}
  class={`relative h-full w-full overflow-hidden bg-slate-50 ${
    draggingFileOver ? "ring-2 ring-inset ring-sky-400/40" : ""
  }`}
  oncontextmenu={handleContextMenu}
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  {#if canvasNodes.length === 0}
    <div class="flex h-full items-center justify-center px-6 text-center">
      <div class="max-w-sm">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <svg class="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 class="mt-4 text-base font-semibold text-slate-900">No sessions yet</h3>
        <p class="mt-1.5 text-sm leading-relaxed text-slate-500">
          Start a new chat to see it here, or drop files from the Files panel.
        </p>
      </div>
    </div>
  {:else}
    {#key `${projectId}:${canvasKey}`}
      <div class="h-full w-full">
        <SvelteFlow
          nodes={canvasNodes as Node[]}
          edges={[]}
          {nodeTypes}
          initialViewport={savedViewport}
          minZoom={0.25}
          maxZoom={2}
          panOnScroll
          zoomOnDoubleClick={false}
          onnodedragstop={handleNodeDragStop}
          onnodeclick={handleNodeClick}
          onpaneclick={handlePaneClick}
          onmove={handleMove}
          onmoveend={handleMoveEnd}
          class="project-canvas-flow"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => {
              const data = node.data as ProjectCanvasNodeData;
              return data.type === "session-card" ? "#0f172a" : "#0ea5e9";
            }}
            class="project-canvas-minimap"
          />
        </SvelteFlow>
      </div>
    {/key}
  {/if}

  <!-- Floating controls - bottom left -->
  <div class="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-1.5">
    <button
      type="button"
      class="pointer-events-auto rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur transition-all hover:bg-white hover:text-slate-900 hover:shadow"
      onclick={() => onOpenFiles?.()}
      title="Open Files panel"
    >
      <svg class="mr-1 inline h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      Files
    </button>

    <button
      type="button"
      class="pointer-events-auto rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur transition-all hover:bg-white hover:text-slate-900 hover:shadow"
      onclick={repackSessions}
      title="Reset card positions"
    >
      <svg class="mr-1 inline h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Repack
    </button>

    {#if onSwitchView}
      <button
        type="button"
        class="pointer-events-auto rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur transition-all hover:bg-white hover:text-slate-900 hover:shadow"
        onclick={() => onSwitchView?.()}
        title="Switch to list view"
      >
        <svg class="mr-1 inline h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        List
      </button>
    {/if}
  </div>

  <!-- Floating info - top left -->
  <div class="pointer-events-none absolute left-4 top-3 z-10">
    <div class="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white/80 px-2.5 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur">
      <span class="font-medium text-slate-700">{projectName}</span>
      <span class="text-slate-300">|</span>
      <span>{rootSessions.length} session{rootSessions.length === 1 ? "" : "s"}</span>
      {#if activeCount > 0}
        <span class="text-slate-300">|</span>
        <span class="flex items-center gap-1 text-cyan-600">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500"></span>
          {activeCount} active
        </span>
      {/if}
    </div>
  </div>

  <!-- Drop overlay -->
  {#if draggingFileOver}
    <div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-sky-500/8 backdrop-blur-[1px]">
      <div class="rounded-2xl border border-sky-300 bg-white/95 px-6 py-5 text-center shadow-xl">
        <div class="text-sm font-semibold text-sky-700">Drop to pin file</div>
        <div class="mt-1 text-xs text-slate-500">It will stay on this canvas until you remove it.</div>
      </div>
    </div>
  {/if}

  <!-- Context menu -->
  {#if contextMenu}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      class="fixed inset-0 z-50"
      onclick={closeContextMenu}
      oncontextmenu={(e) => { e.preventDefault(); closeContextMenu(); }}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
      <div
        class="absolute min-w-[160px] rounded-xl border border-slate-200 bg-white/95 py-1 shadow-xl backdrop-blur"
        style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
        onclick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-slate-700 transition-colors hover:bg-slate-50"
          onclick={handleContextNewSession}
        >
          <svg class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </button>
        <div class="mx-2 my-1 border-t border-slate-100"></div>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-slate-700 transition-colors hover:bg-slate-50"
          onclick={handleContextAddText}
        >
          <svg class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h8m-8 6h16" />
          </svg>
          Text
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(.project-canvas-flow) {
    width: 100%;
    height: 100%;
  }

  :global(.project-canvas-flow .svelte-flow__renderer) {
    background: transparent;
  }

  :global(.project-canvas-flow .svelte-flow__node) {
    cursor: grab;
  }

  :global(.project-canvas-flow .svelte-flow__node:active) {
    cursor: grabbing;
  }

  :global(.project-canvas-flow .svelte-flow__controls) {
    display: none;
  }

  :global(.project-canvas-minimap) {
    background: rgba(255, 255, 255, 0.88) !important;
    border-radius: 12px !important;
    border: 1px solid rgba(226, 232, 240, 0.8) !important;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06) !important;
    bottom: 14px !important;
    right: 14px !important;
  }
</style>
