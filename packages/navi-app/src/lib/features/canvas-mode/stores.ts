/**
 * Canvas Mode Stores
 *
 * State management for the infinite canvas
 * @experimental
 */

import { writable, derived, get } from "svelte/store";
import type {
  CanvasNode,
  CanvasEdge,
  CanvasPositions,
  CanvasStorage,
  CanvasViewport,
  NodePosition,
  WorkspaceNodeData,
  ProjectNodeData,
  SessionNodeData,
  AgentNodeData,
} from "./types";
import {
  CANVAS_STORAGE_KEY,
  CANVAS_STORAGE_VERSION,
  DEFAULT_VIEWPORT,
  NODE_DIMENSIONS,
} from "./constants";
import { projects, sessions } from "$lib/stores/projects";
import { workspaceFolders, type WorkspaceFolder } from "$lib/stores/workspace";
import type { Project, Session } from "$lib/stores/types";

// =============================================================================
// POSITION PERSISTENCE (localStorage)
// =============================================================================

function loadCanvasStorage(): CanvasStorage {
  if (typeof window === "undefined") {
    return { positions: { nodes: {}, viewport: DEFAULT_VIEWPORT }, version: CANVAS_STORAGE_VERSION };
  }

  try {
    const stored = localStorage.getItem(CANVAS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as CanvasStorage;
      if (parsed.version === CANVAS_STORAGE_VERSION) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to load canvas positions:", e);
  }

  return { positions: { nodes: {}, viewport: DEFAULT_VIEWPORT }, version: CANVAS_STORAGE_VERSION };
}

function saveCanvasStorage(storage: CanvasStorage): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(storage));
  } catch (e) {
    console.warn("Failed to save canvas positions:", e);
  }
}

// =============================================================================
// CANVAS POSITIONS STORE
// =============================================================================

function createCanvasPositionsStore() {
  const initial = loadCanvasStorage();
  const { subscribe, set, update } = writable<CanvasPositions>(initial.positions);

  return {
    subscribe,

    setNodePosition(nodeId: string, position: NodePosition) {
      update(state => {
        const newState = {
          ...state,
          nodes: { ...state.nodes, [nodeId]: position },
        };
        saveCanvasStorage({ positions: newState, version: CANVAS_STORAGE_VERSION });
        return newState;
      });
    },

    setViewport(viewport: CanvasViewport) {
      update(state => {
        const newState = { ...state, viewport };
        saveCanvasStorage({ positions: newState, version: CANVAS_STORAGE_VERSION });
        return newState;
      });
    },

    getNodePosition(nodeId: string): NodePosition | undefined {
      return get({ subscribe }).nodes[nodeId];
    },

    clear() {
      const empty: CanvasPositions = { nodes: {}, viewport: DEFAULT_VIEWPORT };
      set(empty);
      saveCanvasStorage({ positions: empty, version: CANVAS_STORAGE_VERSION });
    },
  };
}

export const canvasPositions = createCanvasPositionsStore();

// =============================================================================
// SELECTED NODE STORE
// =============================================================================

export const selectedNodeId = writable<string | null>(null);

// =============================================================================
// CANVAS NODES (derived from projects, sessions, folders)
// =============================================================================

export const canvasNodes = derived(
  [projects, sessions, workspaceFolders, canvasPositions],
  ([$projects, $sessions, $folders, $positions]) => {
    const nodes: CanvasNode[] = [];
    let yOffset = 0;

    // Group projects by folder
    const projectsByFolder = new Map<string | null, Project[]>();
    $projects.forEach(p => {
      const folderId = p.folder_id || null;
      if (!projectsByFolder.has(folderId)) {
        projectsByFolder.set(folderId, []);
      }
      projectsByFolder.get(folderId)!.push(p);
    });

    // Create workspace nodes for folders
    $folders.forEach((folder, folderIndex) => {
      const folderProjects = projectsByFolder.get(folder.id) || [];
      const folderSessions = $sessions.filter(s =>
        folderProjects.some(p => p.id === s.project_id)
      );

      const nodeId = `workspace-${folder.id}`;
      const savedPosition = $positions.nodes[nodeId];

      const workspaceData: WorkspaceNodeData = {
        label: folder.name,
        type: "workspace",
        folderId: folder.id,
        projectCount: folderProjects.length,
        sessionCount: folderSessions.length,
        collapsed: folder.collapsed === 1,
      };

      nodes.push({
        id: nodeId,
        type: "workspace",
        position: savedPosition || { x: 50, y: yOffset },
        data: workspaceData,
      });

      // Create project nodes within this workspace
      folderProjects.forEach((project, projectIndex) => {
        const projectSessions = $sessions.filter(s => s.project_id === project.id);
        const activeSessions = projectSessions.filter(s => {
          const status = (s as any).agent_status;
          return status === "working" || status === "waiting";
        });

        const projectNodeId = `project-${project.id}`;
        const projectSavedPosition = $positions.nodes[projectNodeId];

        const projectData: ProjectNodeData = {
          label: project.name,
          type: "project",
          projectId: project.id,
          projectPath: project.path,
          sessionCount: projectSessions.length,
          activeCount: activeSessions.length,
          totalCost: projectSessions.reduce((sum, s) => sum + (s.total_cost_usd || 0), 0),
          folderId: folder.id,
        };

        nodes.push({
          id: projectNodeId,
          type: "project",
          position: projectSavedPosition || {
            x: 100 + NODE_DIMENSIONS.workspace.width + 50,
            y: yOffset + projectIndex * (NODE_DIMENSIONS.project.height + 30),
          },
          data: projectData,
        });

        // Create session nodes for this project (only root sessions)
        const rootSessions = projectSessions.filter(s => !(s as any).parent_session_id);
        rootSessions.forEach((session, sessionIndex) => {
          const childSessions = projectSessions.filter(s =>
            (s as any).parent_session_id === session.id
          );

          const sessionNodeId = `session-${session.id}`;
          const sessionSavedPosition = $positions.nodes[sessionNodeId];

          // Determine status
          let status: SessionNodeData["status"] = "idle";
          const agentStatus = (session as any).agent_status;
          if (agentStatus) {
            status = agentStatus;
          }

          const sessionData: SessionNodeData = {
            label: session.title || "Untitled",
            type: "session",
            sessionId: session.id,
            projectId: project.id,
            model: session.model,
            status,
            childCount: childSessions.length,
            updatedAt: session.updated_at,
            isRoot: true,
          };

          nodes.push({
            id: sessionNodeId,
            type: "session",
            position: sessionSavedPosition || {
              x: 100 + NODE_DIMENSIONS.workspace.width + NODE_DIMENSIONS.project.width + 100,
              y: yOffset + projectIndex * (NODE_DIMENSIONS.project.height + 30) + sessionIndex * (NODE_DIMENSIONS.session.height + 20),
            },
            data: sessionData,
          });

          // Create agent nodes for child sessions
          childSessions.forEach((child, childIndex) => {
            const agentNodeId = `agent-${child.id}`;
            const agentSavedPosition = $positions.nodes[agentNodeId];

            const agentData: AgentNodeData = {
              label: (child as any).role || child.title || "Agent",
              type: "agent",
              sessionId: child.id,
              parentSessionId: session.id,
              role: (child as any).role,
              task: (child as any).task,
              agentType: (child as any).agent_type,
              status: (child as any).agent_status || "idle",
              depth: (child as any).depth || 1,
            };

            nodes.push({
              id: agentNodeId,
              type: "agent",
              position: agentSavedPosition || {
                x: 100 + NODE_DIMENSIONS.workspace.width + NODE_DIMENSIONS.project.width + NODE_DIMENSIONS.session.width + 150,
                y: yOffset + projectIndex * (NODE_DIMENSIONS.project.height + 30) + sessionIndex * (NODE_DIMENSIONS.session.height + 20) + childIndex * (NODE_DIMENSIONS.agent.height + 15),
              },
              data: agentData,
            });
          });
        });
      });

      yOffset += Math.max(
        NODE_DIMENSIONS.workspace.height + 50,
        folderProjects.length * (NODE_DIMENSIONS.project.height + 30) + 50
      );
    });

    // Handle projects without a folder (unfiled)
    const unfiledProjects = projectsByFolder.get(null) || [];
    if (unfiledProjects.length > 0) {
      const nodeId = "workspace-unfiled";
      const savedPosition = $positions.nodes[nodeId];

      const unfiledSessions = $sessions.filter(s =>
        unfiledProjects.some(p => p.id === s.project_id)
      );

      const workspaceData: WorkspaceNodeData = {
        label: "Unfiled Projects",
        type: "workspace",
        folderId: "unfiled",
        projectCount: unfiledProjects.length,
        sessionCount: unfiledSessions.length,
      };

      nodes.push({
        id: nodeId,
        type: "workspace",
        position: savedPosition || { x: 50, y: yOffset },
        data: workspaceData,
      });

      unfiledProjects.forEach((project, projectIndex) => {
        const projectSessions = $sessions.filter(s => s.project_id === project.id);
        const activeSessions = projectSessions.filter(s => {
          const status = (s as any).agent_status;
          return status === "working" || status === "waiting";
        });

        const projectNodeId = `project-${project.id}`;
        const projectSavedPosition = $positions.nodes[projectNodeId];

        const projectData: ProjectNodeData = {
          label: project.name,
          type: "project",
          projectId: project.id,
          projectPath: project.path,
          sessionCount: projectSessions.length,
          activeCount: activeSessions.length,
          totalCost: projectSessions.reduce((sum, s) => sum + (s.total_cost_usd || 0), 0),
        };

        nodes.push({
          id: projectNodeId,
          type: "project",
          position: projectSavedPosition || {
            x: 100 + NODE_DIMENSIONS.workspace.width + 50,
            y: yOffset + projectIndex * (NODE_DIMENSIONS.project.height + 30),
          },
          data: projectData,
        });

        // Sessions for unfiled projects
        const rootSessions = projectSessions.filter(s => !(s as any).parent_session_id);
        rootSessions.forEach((session, sessionIndex) => {
          const childSessions = projectSessions.filter(s =>
            (s as any).parent_session_id === session.id
          );

          const sessionNodeId = `session-${session.id}`;
          const sessionSavedPosition = $positions.nodes[sessionNodeId];

          let status: SessionNodeData["status"] = "idle";
          const agentStatus = (session as any).agent_status;
          if (agentStatus) {
            status = agentStatus;
          }

          const sessionData: SessionNodeData = {
            label: session.title || "Untitled",
            type: "session",
            sessionId: session.id,
            projectId: project.id,
            model: session.model,
            status,
            childCount: childSessions.length,
            updatedAt: session.updated_at,
            isRoot: true,
          };

          nodes.push({
            id: sessionNodeId,
            type: "session",
            position: sessionSavedPosition || {
              x: 100 + NODE_DIMENSIONS.workspace.width + NODE_DIMENSIONS.project.width + 100,
              y: yOffset + projectIndex * (NODE_DIMENSIONS.project.height + 30) + sessionIndex * (NODE_DIMENSIONS.session.height + 20),
            },
            data: sessionData,
          });
        });
      });
    }

    return nodes;
  }
);

// =============================================================================
// CANVAS EDGES (derived from nodes)
// =============================================================================

export const canvasEdges = derived(
  [canvasNodes],
  ([$nodes]) => {
    const edges: CanvasEdge[] = [];

    // Create edges from workspaces to projects
    $nodes.forEach(node => {
      if (node.data.type === "project") {
        const projectData = node.data as ProjectNodeData;
        const workspaceId = projectData.folderId
          ? `workspace-${projectData.folderId}`
          : "workspace-unfiled";

        edges.push({
          id: `edge-${workspaceId}-${node.id}`,
          source: workspaceId,
          target: node.id,
          type: "smoothstep",
          data: { edgeType: "contains" },
        });
      }

      // Create edges from projects to sessions
      if (node.data.type === "session") {
        const sessionData = node.data as SessionNodeData;
        const projectId = `project-${sessionData.projectId}`;

        edges.push({
          id: `edge-${projectId}-${node.id}`,
          source: projectId,
          target: node.id,
          type: "smoothstep",
          data: { edgeType: "hierarchy" },
        });
      }

      // Create edges from sessions to agents
      if (node.data.type === "agent") {
        const agentData = node.data as AgentNodeData;
        const parentId = `session-${agentData.parentSessionId}`;

        edges.push({
          id: `edge-${parentId}-${node.id}`,
          source: parentId,
          target: node.id,
          type: "smoothstep",
          animated: agentData.status === "working",
          data: { edgeType: "spawned", animated: agentData.status === "working" },
        });
      }
    });

    return edges;
  }
);
