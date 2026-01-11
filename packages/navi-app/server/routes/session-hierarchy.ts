/**
 * Session Hierarchy Routes
 *
 * REST endpoints for managing multi-session agent hierarchy
 */

import { json, error } from "../utils/response";
import {
  sessions,
  sessionHierarchy,
  sessionDecisions,
  sessionArtifacts,
  messages,
  pendingQuestions,
  type AgentStatus,
} from "../db";
import { sessionManager } from "../services/session-manager";

export async function handleSessionHierarchyRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // GET /api/sessions/:id/tree - Get full session tree
  const treeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/tree$/);
  if (treeMatch && method === "GET") {
    const sessionId = treeMatch[1];
    const tree = sessionHierarchy.getTree(sessionId);

    if (!tree) {
      return error("Session not found", 404);
    }

    return json(tree);
  }

  // GET /api/sessions/:id/children - Get direct children with preview data
  const childrenMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/children$/);
  if (childrenMatch && method === "GET") {
    const sessionId = childrenMatch[1];
    const children = sessionHierarchy.getChildren(sessionId);

    // Enrich children with preview data and waiting status
    const enrichedChildren = children.map((child) => {
      const preview = messages.getLatestPreview(child.id);
      const pendingQuestion = pendingQuestions.getBySession(child.id);

      return {
        ...child,
        // Latest activity preview
        latestPreview: preview,
        // Whether this child is waiting for user input
        isWaitingForInput: !!pendingQuestion,
        pendingQuestionType: pendingQuestion
          ? JSON.parse(pendingQuestion.questions)?.[0]?.header || "Question"
          : null,
      };
    });

    return json(enrichedChildren);
  }

  // GET /api/sessions/:id/siblings - Get sibling sessions
  const siblingsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/siblings$/);
  if (siblingsMatch && method === "GET") {
    const sessionId = siblingsMatch[1];
    const siblings = sessionHierarchy.getSiblings(sessionId);
    return json(siblings);
  }

  // GET /api/sessions/:id/ancestors - Get ancestor chain
  const ancestorsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/ancestors$/);
  if (ancestorsMatch && method === "GET") {
    const sessionId = ancestorsMatch[1];
    const ancestors = sessionHierarchy.getAncestors(sessionId);
    return json(ancestors);
  }

  // POST /api/sessions/:id/spawn - Spawn a child session
  const spawnMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/spawn$/);
  if (spawnMatch && method === "POST") {
    const parentId = spawnMatch[1];

    try {
      const body = await req.json();
      const { title, role, task, model } = body;

      if (!title || !role || !task) {
        return error("Missing required fields: title, role, task", 400);
      }

      const canSpawn = sessionManager.canSpawn(parentId);
      if (!canSpawn.can) {
        return error(canSpawn.reason || "Cannot spawn child session", 400);
      }

      const child = sessionManager.spawn(parentId, { title, role, task, model });
      if (!child) {
        return error("Failed to spawn child session", 500);
      }

      return json(child, 201);
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // PATCH /api/sessions/:id/status - Update agent status
  const statusMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/status$/);
  if (statusMatch && method === "PATCH") {
    const sessionId = statusMatch[1];

    try {
      const body = await req.json();
      const { status } = body;

      const validStatuses: AgentStatus[] = [
        "working",
        "waiting",
        "blocked",
        "delivered",
        "failed",
        "archived",
      ];

      if (!status || !validStatuses.includes(status)) {
        return error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
      }

      sessionManager.updateStatus(sessionId, status);
      const updated = sessions.get(sessionId);
      return json(updated);
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // POST /api/sessions/:id/escalate - Escalate to parent
  const escalateMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/escalate$/);
  if (escalateMatch && method === "POST") {
    const sessionId = escalateMatch[1];

    try {
      const body = await req.json();
      const { type, summary, context, options } = body;

      if (!type || !summary || !context) {
        return error("Missing required fields: type, summary, context", 400);
      }

      const success = sessionManager.escalate(sessionId, {
        type,
        summary,
        context,
        options,
      });

      if (!success) {
        return error("Failed to escalate", 500);
      }

      return json({ success: true, message: "Escalation sent" });
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // POST /api/sessions/:id/resolve-escalation - Resolve an escalation
  const resolveMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/resolve-escalation$/);
  if (resolveMatch && method === "POST") {
    const sessionId = resolveMatch[1];

    try {
      const body = await req.json();
      const { action, content } = body;

      if (!action || !content) {
        return error("Missing required fields: action, content", 400);
      }

      sessionManager.resolveEscalation(sessionId, { action, content });
      return json({ success: true, message: "Escalation resolved" });
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // POST /api/sessions/:id/deliver - Deliver results
  const deliverMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/deliver$/);
  if (deliverMatch && method === "POST") {
    const sessionId = deliverMatch[1];

    try {
      const body = await req.json();
      const { type, summary, content, artifacts } = body;

      if (!type || !summary || !content) {
        return error("Missing required fields: type, summary, content", 400);
      }

      sessionManager.deliver(sessionId, { type, summary, content, artifacts });
      return json({ success: true, message: "Deliverable sent" });
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // POST /api/sessions/:id/archive - Archive a session
  const archiveMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/archive$/);
  if (archiveMatch && method === "POST") {
    const sessionId = archiveMatch[1];

    try {
      const body = await req.json().catch(() => ({}));
      const archiveDescendants = body.archiveDescendants !== false;

      sessionManager.archive(sessionId, archiveDescendants);
      return json({ success: true, message: "Session archived" });
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // GET /api/sessions/:id/active - Get all active sessions in tree
  const activeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/active$/);
  if (activeMatch && method === "GET") {
    const rootId = activeMatch[1];
    const active = sessionManager.getActiveSessions(rootId);
    return json(active);
  }

  // GET /api/sessions/:id/blocked - Get all blocked sessions
  const blockedMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/blocked$/);
  if (blockedMatch && method === "GET") {
    const rootId = blockedMatch[1];
    const blocked = sessionManager.getBlockedSessions(rootId);
    return json(blocked);
  }

  // GET /api/sessions/:id/context - Get immediate context for session
  const contextMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/context$/);
  if (contextMatch && method === "GET") {
    const sessionId = contextMatch[1];
    const context = sessionManager.getImmediateContext(sessionId);

    if (!context) {
      return error("Session not found", 404);
    }

    return json(context);
  }

  // POST /api/sessions/:id/query-context - Query context
  const queryContextMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/query-context$/);
  if (queryContextMatch && method === "POST") {
    const sessionId = queryContextMatch[1];

    try {
      const body = await req.json();
      const { source, query, siblingRole } = body;

      if (!source || !query) {
        return error("Missing required fields: source, query", 400);
      }

      const result = await sessionManager.getContext(sessionId, {
        source,
        query,
        siblingRole,
      });

      if (!result) {
        return error("Failed to retrieve context", 500);
      }

      return json(result);
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // GET /api/sessions/:rootId/decisions - Get all decisions
  const decisionsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/decisions$/);
  if (decisionsMatch && method === "GET") {
    const rootId = decisionsMatch[1];
    const category = url.searchParams.get("category");

    const decisions = category
      ? sessionDecisions.listByCategory(rootId, category)
      : sessionDecisions.listByRoot(rootId);

    return json(decisions);
  }

  // POST /api/sessions/:id/decisions - Log a decision
  const logDecisionMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/decisions$/);
  if (logDecisionMatch && method === "POST") {
    const sessionId = logDecisionMatch[1];

    try {
      const body = await req.json();
      const { decision, category, rationale } = body;

      if (!decision) {
        return error("Missing required field: decision", 400);
      }

      const logged = sessionManager.logDecision(sessionId, decision, category, rationale);
      if (!logged) {
        return error("Failed to log decision", 500);
      }

      return json(logged, 201);
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // GET /api/sessions/:rootId/artifacts - Get all artifacts
  const artifactsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/artifacts$/);
  if (artifactsMatch && method === "GET") {
    const rootId = artifactsMatch[1];
    const artifactType = url.searchParams.get("type");

    const artifacts = artifactType
      ? sessionArtifacts.listByType(rootId, artifactType)
      : sessionArtifacts.listByRoot(rootId);

    return json(artifacts);
  }

  // POST /api/sessions/:id/artifacts - Log an artifact
  const logArtifactMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/artifacts$/);
  if (logArtifactMatch && method === "POST") {
    const sessionId = logArtifactMatch[1];

    try {
      const body = await req.json();
      const { path, content, description, artifactType } = body;

      if (!path) {
        return error("Missing required field: path", 400);
      }

      const logged = sessionManager.logArtifact(
        sessionId,
        path,
        content,
        description,
        artifactType
      );

      if (!logged) {
        return error("Failed to log artifact", 500);
      }

      return json(logged, 201);
    } catch (e) {
      return error("Invalid request body", 400);
    }
  }

  // GET /api/sessions/:id/can-spawn - Check if session can spawn children
  const canSpawnMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/can-spawn$/);
  if (canSpawnMatch && method === "GET") {
    const sessionId = canSpawnMatch[1];
    const result = sessionManager.canSpawn(sessionId);
    return json(result);
  }

  // Not a session hierarchy route
  return null;
}
