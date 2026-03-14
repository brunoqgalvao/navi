import { randomUUID } from "crypto"
import { error, json } from "../utils/response"
import { projects, sessions, workItems, workItemEvents, type WorkItem, type WorkItemEvent } from "../db"

function toJsonString(value: unknown, fallback: string = "{}"): string {
  if (value === undefined) return fallback
  if (value === null) return "null"
  return typeof value === "string" ? value : JSON.stringify(value)
}

function createEvent(input: Omit<WorkItemEvent, "id" | "created_at">): WorkItemEvent {
  return {
    id: randomUUID(),
    created_at: Date.now(),
    ...input,
  }
}

function syncPrimarySessionLink(
  workItemId: string,
  nextSessionId: string | null,
  previousSessionId?: string | null
) {
  if (previousSessionId && previousSessionId !== nextSessionId) {
    const previous = sessions.get(previousSessionId)
    if (previous?.work_item_id === workItemId) {
      sessions.setWorkspaceLinks(previousSessionId, { work_item_id: null })
    }
  }

  if (nextSessionId) {
    sessions.setWorkspaceLinks(nextSessionId, { work_item_id: workItemId })
  }
}

export async function handleWorkItemRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const projectItemsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/work-items$/)
  if (projectItemsMatch) {
    const projectId = projectItemsMatch[1]
    const project = projects.get(projectId)
    if (!project) return error("Project not found", 404)

    if (method === "GET") {
      return json(workItems.listByProject(projectId))
    }

    if (method === "POST") {
      const body = await req.json()
      if (!body.title || !String(body.title).trim()) {
        return error("title is required", 400)
      }

      const now = Date.now()
      const item: WorkItem = {
        id: randomUUID(),
        project_id: projectId,
        title: String(body.title).trim(),
        description: body.description ? String(body.description) : null,
        status: body.status || "todo",
        priority: body.priority || "medium",
        assignee_agent_id: body.assigneeAgentId ?? null,
        reporter_type: body.reporterType || "user",
        reporter_id: body.reporterId ?? null,
        source_session_id: body.sourceSessionId ?? null,
        primary_session_id: body.primarySessionId ?? null,
        acceptance_criteria: body.acceptanceCriteria ? String(body.acceptanceCriteria) : null,
        metadata: toJsonString(body.metadata),
        created_at: now,
        updated_at: now,
        completed_at: body.status === "done" ? now : null,
      }

      workItems.create(item)
      syncPrimarySessionLink(item.id, item.primary_session_id)
      workItemEvents.create(
        createEvent({
          work_item_id: item.id,
          event_type: "created",
          actor_type: item.reporter_type,
          actor_id: item.reporter_id,
          session_id: item.source_session_id,
          content: `Created work item "${item.title}"`,
          metadata: JSON.stringify({
            status: item.status,
            priority: item.priority,
            assigneeAgentId: item.assignee_agent_id,
          }),
        })
      )

      return json(workItems.get(item.id), 201)
    }
  }

  const itemMatch = url.pathname.match(/^\/api\/work-items\/([^/]+)$/)
  if (itemMatch) {
    const id = itemMatch[1]
    const existing = workItems.get(id)
    if (!existing) return error("Work item not found", 404)

    if (method === "GET") {
      return json(existing)
    }

    if (method === "PATCH") {
      const body = await req.json()
      const status = body.status ?? existing.status
      const nextPrimarySessionId =
        body.primarySessionId === undefined ? existing.primary_session_id : body.primarySessionId

      workItems.update(id, {
        title: body.title === undefined ? undefined : String(body.title).trim(),
        description: body.description === undefined ? undefined : (body.description ? String(body.description) : null),
        status,
        priority: body.priority,
        assignee_agent_id: body.assigneeAgentId,
        reporter_type: body.reporterType,
        reporter_id: body.reporterId,
        source_session_id: body.sourceSessionId,
        primary_session_id: nextPrimarySessionId,
        acceptance_criteria:
          body.acceptanceCriteria === undefined ? undefined : (body.acceptanceCriteria ? String(body.acceptanceCriteria) : null),
        metadata: body.metadata === undefined ? undefined : toJsonString(body.metadata),
        completed_at:
          body.completedAt !== undefined
            ? body.completedAt
            : status === "done"
              ? existing.completed_at || Date.now()
              : status === "cancelled"
                ? existing.completed_at
                : null,
      })

      syncPrimarySessionLink(id, nextPrimarySessionId, existing.primary_session_id)

      const changed: Record<string, unknown> = {}
      if (body.status !== undefined && body.status !== existing.status) changed.status = body.status
      if (body.priority !== undefined && body.priority !== existing.priority) changed.priority = body.priority
      if (body.assigneeAgentId !== undefined && body.assigneeAgentId !== existing.assignee_agent_id) {
        changed.assigneeAgentId = body.assigneeAgentId
      }
      if (body.primarySessionId !== undefined && body.primarySessionId !== existing.primary_session_id) {
        changed.primarySessionId = body.primarySessionId
      }

      if (Object.keys(changed).length > 0) {
        workItemEvents.create(
          createEvent({
            work_item_id: id,
            event_type: "updated",
            actor_type: body.actorType || "user",
            actor_id: body.actorId ?? null,
            session_id: body.sessionId ?? null,
            content: body.eventSummary || "Updated work item",
            metadata: JSON.stringify(changed),
          })
        )
      }

      return json(workItems.get(id))
    }

    if (method === "DELETE") {
      for (const session of sessions.listByWorkItem(id)) {
        sessions.setWorkspaceLinks(session.id, { work_item_id: null })
      }
      workItems.delete(id)
      return json({ success: true })
    }
  }

  const itemEventsMatch = url.pathname.match(/^\/api\/work-items\/([^/]+)\/events$/)
  if (itemEventsMatch) {
    const workItemId = itemEventsMatch[1]
    const item = workItems.get(workItemId)
    if (!item) return error("Work item not found", 404)

    if (method === "GET") {
      return json(workItemEvents.listByWorkItem(workItemId))
    }

    if (method === "POST") {
      const body = await req.json()
      if (!body.eventType || !String(body.eventType).trim()) {
        return error("eventType is required", 400)
      }

      const event = createEvent({
        work_item_id: workItemId,
        event_type: String(body.eventType).trim(),
        actor_type: body.actorType || "user",
        actor_id: body.actorId ?? null,
        session_id: body.sessionId ?? null,
        content: body.content ? String(body.content) : null,
        metadata: toJsonString(body.metadata),
      })
      workItemEvents.create(event)
      return json(event, 201)
    }
  }

  return null
}
