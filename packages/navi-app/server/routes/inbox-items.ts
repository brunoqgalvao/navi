import { randomUUID } from "crypto"
import { error, json } from "../utils/response"
import { inboxItems, projects, type InboxItem } from "../db"

function toJsonString(value: unknown, fallback: string = "{}"): string {
  if (value === undefined) return fallback
  if (value === null) return "null"
  return typeof value === "string" ? value : JSON.stringify(value)
}

export async function handleInboxItemRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  if (url.pathname === "/api/inbox" && method === "GET") {
    return json(inboxItems.listAll())
  }

  const projectInboxMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inbox$/)
  if (projectInboxMatch) {
    const projectId = projectInboxMatch[1]
    const project = projects.get(projectId)
    if (!project) return error("Project not found", 404)

    if (method === "GET") {
      return json(inboxItems.listByProject(projectId))
    }

    if (method === "POST") {
      const body = await req.json()
      if (!body.kind || !String(body.kind).trim()) return error("kind is required", 400)
      if (!body.title || !String(body.title).trim()) return error("title is required", 400)

      const now = Date.now()
      const item: InboxItem = {
        id: randomUUID(),
        project_id: projectId,
        kind: body.kind,
        title: String(body.title).trim(),
        body: body.body ? String(body.body) : null,
        status: body.status || "open",
        priority: body.priority || "medium",
        source_agent_id: body.sourceAgentId ?? null,
        source_session_id: body.sourceSessionId ?? null,
        work_item_id: body.workItemId ?? null,
        requires_response: body.requiresResponse ? 1 : 0,
        response_options: body.responseOptions === undefined ? null : toJsonString(body.responseOptions, "[]"),
        metadata: toJsonString(body.metadata),
        created_at: now,
        updated_at: now,
        resolved_at:
          body.status === "resolved" || body.status === "dismissed" ? now : null,
      }

      inboxItems.create(item)
      return json(inboxItems.get(item.id), 201)
    }
  }

  const inboxItemMatch = url.pathname.match(/^\/api\/inbox\/([^/]+)$/)
  if (inboxItemMatch) {
    const id = inboxItemMatch[1]
    const existing = inboxItems.get(id)
    if (!existing) return error("Inbox item not found", 404)

    if (method === "GET") {
      return json(existing)
    }

    if (method === "PATCH") {
      const body = await req.json()
      const nextStatus = body.status ?? existing.status
      inboxItems.update(id, {
        kind: body.kind,
        title: body.title === undefined ? undefined : String(body.title).trim(),
        body: body.body === undefined ? undefined : (body.body ? String(body.body) : null),
        status: nextStatus,
        priority: body.priority,
        source_agent_id: body.sourceAgentId,
        source_session_id: body.sourceSessionId,
        work_item_id: body.workItemId,
        requires_response: body.requiresResponse === undefined ? undefined : (body.requiresResponse ? 1 : 0),
        response_options:
          body.responseOptions === undefined ? undefined : toJsonString(body.responseOptions, "[]"),
        metadata: body.metadata === undefined ? undefined : toJsonString(body.metadata),
        resolved_at:
          body.resolvedAt !== undefined
            ? body.resolvedAt
            : nextStatus === "resolved" || nextStatus === "dismissed"
              ? existing.resolved_at || Date.now()
              : null,
      })
      return json(inboxItems.get(id))
    }

    if (method === "DELETE") {
      inboxItems.delete(id)
      return json({ success: true })
    }
  }

  return null
}
