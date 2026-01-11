// Kanban API routes

import { json, error } from "../utils/response";
import { kanbanCards, sessions, type KanbanStatus } from "../db";

export async function handleKanbanRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // GET /api/projects/:projectId/kanban/cards - List all cards for a project
  const listMatch = pathname.match(/^\/api\/projects\/([^/]+)\/kanban\/cards$/);
  if (listMatch && method === "GET") {
    const projectId = listMatch[1];
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const cards = kanbanCards.listByProject(projectId, includeArchived);
    return json({ cards });
  }

  // POST /api/projects/:projectId/kanban/cards - Create a new card
  const createMatch = pathname.match(/^\/api\/projects\/([^/]+)\/kanban\/cards$/);
  if (createMatch && method === "POST") {
    const projectId = createMatch[1];
    try {
      const body = await req.json();
      const id = crypto.randomUUID();

      kanbanCards.create({
        id,
        project_id: projectId,
        session_id: body.session_id || null,
        title: body.title || "New Task",
        spec: body.spec || null,
        status: (body.status as KanbanStatus) || "spec",
        status_message: body.status_message || null,
        blocked: body.blocked ? 1 : 0,
        sort_order: body.sort_order ?? 0,
      });

      const card = kanbanCards.get(id);
      return json({ card });
    } catch (e: any) {
      return error(e.message || "Failed to create card", 500);
    }
  }

  // GET /api/projects/:projectId/kanban/cards/:cardId - Get a specific card
  const cardMatch = pathname.match(/^\/api\/projects\/([^/]+)\/kanban\/cards\/([^/]+)$/);
  if (cardMatch && method === "GET") {
    const [, , cardId] = cardMatch;
    const card = kanbanCards.get(cardId);
    if (!card) {
      return error("Card not found", 404);
    }
    return json({ card });
  }

  // PUT /api/projects/:projectId/kanban/cards/:cardId - Update a card
  if (cardMatch && method === "PUT") {
    const [, , cardId] = cardMatch;
    try {
      const body = await req.json();
      const card = kanbanCards.get(cardId);
      if (!card) {
        return error("Card not found", 404);
      }

      kanbanCards.update(cardId, {
        title: body.title,
        spec: body.spec,
        status: body.status,
        status_message: body.status_message,
        sort_order: body.sort_order,
        session_id: body.session_id,
      });

      const updated = kanbanCards.get(cardId);
      return json({ card: updated });
    } catch (e: any) {
      return error(e.message || "Failed to update card", 500);
    }
  }

  // DELETE /api/projects/:projectId/kanban/cards/:cardId - Delete a card
  if (cardMatch && method === "DELETE") {
    const [, , cardId] = cardMatch;
    try {
      const card = kanbanCards.get(cardId);
      if (!card) {
        return error("Card not found", 404);
      }
      kanbanCards.delete(cardId);
      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to delete card", 500);
    }
  }

  // PUT /api/projects/:projectId/kanban/cards/:cardId/status - Update card status
  const statusMatch = pathname.match(/^\/api\/projects\/([^/]+)\/kanban\/cards\/([^/]+)\/status$/);
  if (statusMatch && method === "PUT") {
    const [, , cardId] = statusMatch;
    try {
      const body = await req.json();
      const card = kanbanCards.get(cardId);
      if (!card) {
        return error("Card not found", 404);
      }

      kanbanCards.updateStatus(cardId, body.status, body.status_message);
      const updated = kanbanCards.get(cardId);
      return json({ card: updated });
    } catch (e: any) {
      return error(e.message || "Failed to update status", 500);
    }
  }

  // POST /api/projects/:projectId/kanban/cards/:cardId/dispatch - Dispatch card to chat
  const dispatchMatch = pathname.match(/^\/api\/projects\/([^/]+)\/kanban\/cards\/([^/]+)\/dispatch$/);
  if (dispatchMatch && method === "POST") {
    const [, projectId, cardId] = dispatchMatch;
    try {
      const card = kanbanCards.get(cardId);
      if (!card) {
        return error("Card not found", 404);
      }

      // Create a new session for this task
      const sessionId = crypto.randomUUID();
      const now = Date.now();
      const sessionTitle = `Task: ${card.title}`;

      sessions.create(sessionId, projectId, sessionTitle, now, now);

      // Link the card to the session
      kanbanCards.linkSession(cardId, sessionId);

      // Update card status to execute
      kanbanCards.updateStatus(cardId, "execute", "Chat started");

      // Build structured prompt from the card
      const promptLines = [
        `Task: ${card.title}`,
        "",
        `Spec:`,
        card.spec || "(no detailed spec provided)",
        "",
        "Ask questions if you need clarification before proceeding.",
      ];
      const prompt = promptLines.join("\n");

      return json({
        sessionId,
        prompt,
        autoSend: true, // Signal to auto-send the message
        card: kanbanCards.get(cardId),
      });
    } catch (e: any) {
      return error(e.message || "Failed to dispatch card", 500);
    }
  }

  // PUT /api/projects/:projectId/kanban/reorder - Reorder cards
  const reorderMatch = pathname.match(/^\/api\/projects\/([^/]+)\/kanban\/reorder$/);
  if (reorderMatch && method === "PUT") {
    try {
      const body = await req.json();
      if (!Array.isArray(body.cardIds)) {
        return error("cardIds array is required", 400);
      }
      kanbanCards.reorder(body.cardIds);
      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to reorder cards", 500);
    }
  }

  // POST /api/projects/:projectId/kanban/cards/:cardId/archive - Archive a card
  const archiveMatch = pathname.match(/^\/api\/projects\/([^/]+)\/kanban\/cards\/([^/]+)\/archive$/);
  if (archiveMatch && method === "POST") {
    const [, , cardId] = archiveMatch;
    try {
      const card = kanbanCards.get(cardId);
      if (!card) {
        return error("Card not found", 404);
      }
      kanbanCards.archive(cardId);
      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to archive card", 500);
    }
  }

  // GET /api/sessions/:sessionId/kanban - Get kanban card for a session
  const sessionKanbanMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/kanban$/);
  if (sessionKanbanMatch && method === "GET") {
    const sessionId = sessionKanbanMatch[1];
    const card = kanbanCards.getBySession(sessionId);
    return json({ card: card || null });
  }

  // PUT /api/sessions/:sessionId/kanban/status - Update kanban status from session (agent-driven)
  const sessionStatusMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/kanban\/status$/);
  if (sessionStatusMatch && method === "PUT") {
    const sessionId = sessionStatusMatch[1];
    try {
      const body = await req.json();
      const card = kanbanCards.getBySession(sessionId);
      if (!card) {
        return json({ success: false, message: "No kanban card linked to this session" });
      }

      kanbanCards.updateStatus(card.id, body.status, body.status_message);
      const updated = kanbanCards.get(card.id);
      return json({ card: updated });
    } catch (e: any) {
      return error(e.message || "Failed to update status", 500);
    }
  }

  return null;
}
