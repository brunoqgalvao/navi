import type { Node } from "@xyflow/svelte";
import type { SessionStatusType } from "$lib/stores";

export type ProjectCanvasNodeType = "session-card" | "file-card" | "text-label";

export interface ProjectCanvasBaseData {
  [key: string]: unknown;
  type: ProjectCanvasNodeType;
}

export interface ProjectCanvasSessionData extends ProjectCanvasBaseData {
  type: "session-card";
  sessionId: string;
  title: string;
  model: string | null;
  updatedAt: number;
  totalTurns: number;
  totalCostUsd: number;
  worktreeBranch: string | null;
  status: SessionStatusType | "review" | "idle";
  onOpen?: (sessionId: string) => void;
  onArchive?: (sessionId: string) => void;
}

export interface ProjectCanvasFileData extends ProjectCanvasBaseData {
  type: "file-card";
  filePath: string;
  name: string;
  relativePath: string;
  onOpen?: (filePath: string) => void;
  onRemove?: (filePath: string) => void;
}

export interface ProjectCanvasTextLabelData extends ProjectCanvasBaseData {
  type: "text-label";
  text: string;
  width: number;
  height: number;
  onTextChange?: (text: string) => void;
  onResize?: (width: number, height: number) => void;
  onRemove?: () => void;
}

export type ProjectCanvasNodeData = ProjectCanvasSessionData | ProjectCanvasFileData | ProjectCanvasTextLabelData;

export type ProjectCanvasNode = Node<ProjectCanvasNodeData>;

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasViewportState extends CanvasPoint {
  zoom: number;
}

export interface PersistedSessionCard {
  id: string;
  type: "session";
  sessionId: string;
  position: CanvasPoint;
}

export interface PersistedFileCard {
  id: string;
  type: "file";
  filePath: string;
  position: CanvasPoint;
}

export interface PersistedTextLabelCard {
  id: string;
  type: "text-label";
  text: string;
  width: number;
  height: number;
  position: CanvasPoint;
}

export type PersistedCanvasCard = PersistedSessionCard | PersistedFileCard | PersistedTextLabelCard;

export interface PersistedProjectCanvasLayout {
  version: number;
  viewport: CanvasViewportState;
  items: PersistedCanvasCard[];
}
