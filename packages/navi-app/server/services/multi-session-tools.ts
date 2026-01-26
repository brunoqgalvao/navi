/**
 * Multi-Session Agent Tools
 *
 * These tools are injected into each agent session to enable:
 * - Spawning child agents
 * - Accessing context from parent/siblings
 * - Logging decisions and artifacts
 * - Escalating when blocked
 * - Delivering results
 */

import { sessionManager, type SpawnConfig, type ContextQuery } from "./session-manager";
import {
  sessions,
  clarificationRequests,
  draftDeliverables,
  type EscalationType,
  type DraftDeliverable,
  type ClarificationRequest,
} from "../db";
import { getAgentDefinition, inferAgentTypeFromRole, type AgentType } from "../agent-types";

// Tool definitions that will be added to agent sessions
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

export const multiSessionToolDefinitions: ToolDefinition[] = [
  {
    name: "spawn_agent",
    description: `Spawn a child agent to handle a subtask in parallel.
The child will work independently and deliver results back to you when complete.
Use this for:
- Parallelizable work (e.g., frontend and backend simultaneously)
- Specialized tasks that need focused attention
- Breaking down complex work into manageable pieces

Available agent types with native UI:
- 'browser': Web browsing, research, URL analysis (shows visited URLs, page previews)
- 'coding': Code implementation, file editing (shows files changed, diff preview)
- 'runner': Command execution, builds, tests (shows command output, progress)
- 'research': Deep analysis, findings synthesis
- 'planning': Task breakdown, architecture design
- 'reviewer': Code/document review, quality checks
- 'general': Fallback for miscellaneous tasks

Available backends:
- 'claude' (default): Claude models (haiku, sonnet, opus)
- 'codex': OpenAI Codex CLI (gpt-5.2-codex, o3, etc.)
- 'gemini': Google Gemini (gemini-2.0-flash, etc.)

The child agent has its own context window and can spawn its own children (up to depth 3).

CRITICAL - MONITORING SPAWNED AGENTS:
After spawning an agent, you MUST periodically check on its progress:
1. Use get_context(source: 'sibling') to check child status and partial results
2. Children may hit rate limits, errors, or get stuck - don't assume success
3. If a child is taking too long or silent, query their status via get_context
4. Be prepared to handle partial results if a child fails mid-task
5. Consider using TaskOutput with block=false to poll background agents

IMPORTANT: Only spawn agents for substantial work. For quick tasks, do them yourself.`,
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title for the child session (e.g., 'Build Login Form')",
        },
        role: {
          type: "string",
          description:
            "The role/specialty of the child agent (e.g., 'frontend', 'backend', 'researcher', 'architect')",
        },
        task: {
          type: "string",
          description:
            "Clear description of what the child should accomplish. Be specific about deliverables.",
        },
        agent_type: {
          type: "string",
          description:
            "Type of agent to spawn - determines UI and capabilities. Choose based on task nature.",
          enum: ["browser", "coding", "runner", "research", "planning", "reviewer", "general"],
        },
        model: {
          type: "string",
          description:
            "Optional: Model to use. For Claude: 'haiku', 'sonnet', 'opus'. For Codex: 'gpt-5.2-codex', 'o3', etc. For Gemini: 'gemini-2.0-flash', etc. Defaults to parent's model.",
        },
        backend: {
          type: "string",
          description:
            "Optional: Backend to use. 'claude' (default), 'codex' (OpenAI Codex CLI), or 'gemini'. Each backend has different models available.",
          enum: ["claude", "codex", "gemini"],
        },
        context: {
          type: "string",
          description:
            "Optional: Additional context to pass to the child that they should know.",
        },
      },
      required: ["title", "role", "task"],
    },
  },
  {
    name: "get_context",
    description: `Access context from parent session, sibling sessions, project decisions, or artifacts.
Use this when you need information beyond your immediate task context.

Sources:
- 'parent': Get information about the parent session's task and status
- 'sibling': Get information about sibling sessions (other children of your parent)
- 'decisions': Get project-wide decisions that have been logged
- 'artifacts': Get list of artifacts created in this session tree

Be specific in your query to get relevant information. You'll receive excerpts, not full dumps.`,
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["parent", "sibling", "decisions", "artifacts"],
          description: "Where to get context from",
        },
        query: {
          type: "string",
          description: "What specific information do you need?",
        },
        sibling_role: {
          type: "string",
          description: "If source is 'sibling', which sibling's role to query (optional)",
        },
      },
      required: ["source", "query"],
    },
  },
  {
    name: "log_decision",
    description: `Log an important decision for the project.
Other agents (parent, siblings, children) can see this via get_context.

Use for:
- Architecture choices ("Using REST instead of GraphQL")
- Technology selections ("Using Tailwind for styling")
- API contracts ("POST /api/auth/login returns {token, user}")
- Design patterns ("Using repository pattern for data access")

Decisions help coordinate work across agents and maintain consistency.`,
    parameters: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          description: "The decision that was made",
        },
        category: {
          type: "string",
          description:
            "Category (e.g., 'architecture', 'api', 'tech_choice', 'design', 'security')",
        },
        rationale: {
          type: "string",
          description: "Why this decision was made (optional but helpful)",
        },
      },
      required: ["decision"],
    },
  },
  {
    name: "escalate",
    description: `Escalate to your parent session when you're blocked and cannot proceed.
The parent will either answer directly or escalate further up the chain.
Human intervention is the last resort.

IMPORTANT: Before escalating:
1. Try to resolve the issue yourself
2. Check sibling context for relevant information
3. Review logged decisions

Escalation types:
- 'question': Need information to proceed
- 'decision_needed': Need a choice between options
- 'blocker': Technical or dependency blocker
- 'permission': Need authorization for something`,
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["question", "decision_needed", "blocker", "permission"],
          description: "Type of escalation",
        },
        summary: {
          type: "string",
          description: "Brief summary of the issue (1-2 sentences)",
        },
        context: {
          type: "string",
          description: "What you tried and why you're stuck",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "If type is 'decision_needed', the available choices",
        },
      },
      required: ["type", "summary", "context"],
    },
  },
  {
    name: "deliver",
    description: `Complete your task and deliver results to your parent session.
After calling this, your session will be archived.

IMPORTANT: Only call this when your task is fully complete.
If you have subtasks running, wait for them to deliver first.

The deliverable will be sent to your parent, who will incorporate it into their work.`,
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["code", "research", "decision", "artifact", "error"],
          description: "Type of deliverable",
        },
        summary: {
          type: "string",
          description: "Brief summary of what you accomplished",
        },
        content: {
          type: "string",
          description:
            "The actual deliverable content (can be code, analysis, decision, etc.)",
        },
        artifacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path" },
              description: { type: "string", description: "What this file does" },
            },
            required: ["path"],
          },
          description: "List of files created/modified",
        },
      },
      required: ["type", "summary", "content"],
    },
  },

  // ============================================================================
  // Context Negotiation Tools - For iterative refinement between orchestrator ↔ sub-agent
  // ============================================================================

  {
    name: "submit_draft",
    description: `Submit your work as a DRAFT for your parent to review.
Unlike 'deliver', this does NOT archive your session. Your parent will evaluate your draft
and may ask follow-up questions before accepting it.

Use this when:
- Your task is complex and may need clarification
- You want feedback before final delivery
- The parent explicitly requested iterative review

After submitting, wait for parent's response:
- If they request clarification, you'll receive a message with their question
- If they accept, your session completes normally
- You can revise and resubmit if needed`,
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["code", "research", "decision", "artifact", "error"],
          description: "Type of deliverable",
        },
        summary: {
          type: "string",
          description: "Brief summary of what you accomplished",
        },
        content: {
          type: "string",
          description: "The actual deliverable content",
        },
        artifacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path" },
              description: { type: "string", description: "What this file does" },
            },
            required: ["path"],
          },
          description: "List of files created/modified",
        },
      },
      required: ["type", "summary", "content"],
    },
  },
  {
    name: "request_clarification",
    description: `Ask a child agent for more information about their draft deliverable.
Use this when you receive a draft from a child agent and need more detail.

This is part of the Context Negotiation protocol:
1. Child submits draft via submit_draft
2. YOU evaluate the draft and decide: accept OR request_clarification
3. If you request clarification, the child will respond
4. Loop until satisfied, then call accept_deliverable

Good clarifying questions:
- "What edge cases did you consider for X?"
- "Can you explain why you chose approach Y?"
- "I don't see Z in your summary - did you look into that?"
- "The context mentions A, but I don't see how your solution handles it"`,
    parameters: {
      type: "object",
      properties: {
        child_session_id: {
          type: "string",
          description: "The session ID of the child agent to query",
        },
        question: {
          type: "string",
          description: "Your follow-up question for the child agent",
        },
        context: {
          type: "string",
          description: "Optional: additional context to help the child understand your question",
        },
      },
      required: ["child_session_id", "question"],
    },
  },
  {
    name: "respond_to_clarification",
    description: `Respond to a clarification request from your parent.
Use this when your parent has asked a follow-up question about your draft.

After responding:
- Your parent may accept your deliverable
- Or ask more questions
- You can also revise your draft via submit_draft if the question reveals you missed something`,
    parameters: {
      type: "object",
      properties: {
        clarification_id: {
          type: "string",
          description: "The ID of the clarification request you're responding to",
        },
        response: {
          type: "string",
          description: "Your answer to the parent's question",
        },
      },
      required: ["clarification_id", "response"],
    },
  },
  {
    name: "accept_deliverable",
    description: `Accept a child agent's draft and finalize their work.
Use this after reviewing a child's draft (and any clarification responses) when satisfied.

This:
1. Converts the draft to a final deliverable
2. Archives the child session
3. You receive their finalized content

Only use after thorough evaluation. If you have ANY doubts, use request_clarification first.`,
    parameters: {
      type: "object",
      properties: {
        child_session_id: {
          type: "string",
          description: "The session ID of the child agent whose draft you're accepting",
        },
        feedback: {
          type: "string",
          description: "Optional: final feedback for the child (logged but not sent)",
        },
      },
      required: ["child_session_id"],
    },
  },
  {
    name: "check_pending_clarifications",
    description: `Check if you have any pending clarification requests from your parent.
Use this to see if your parent needs more information about your draft.

Returns any unanswered clarification requests you need to respond to.`,
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// Tool execution handlers
export interface ToolExecutionContext {
  sessionId: string;
  onSpawn?: (childSession: any) => Promise<void>;
  onDraftSubmitted?: (sessionId: string, parentId: string, draftId: string, summary: string) => Promise<void>;
  onClarificationRequested?: (sessionId: string, parentId: string, clarificationId: string, question: string) => Promise<void>;
  onClarificationResponded?: (sessionId: string, clarificationId: string, response: string) => Promise<void>;
  onDraftAccepted?: (sessionId: string, parentId: string) => Promise<void>;
}

export async function executeMultiSessionTool(
  toolName: string,
  params: Record<string, any>,
  context: ToolExecutionContext
): Promise<{ success: boolean; result?: any; error?: string }> {
  const { sessionId } = context;

  try {
    switch (toolName) {
      case "spawn_agent": {
        const { title, role, task, agent_type, model, backend, context: additionalContext } = params;

        // Check if can spawn
        const canSpawn = sessionManager.canSpawn(sessionId);
        if (!canSpawn.can) {
          return { success: false, error: canSpawn.reason };
        }

        const config: SpawnConfig = {
          title,
          role,
          task,
          model,
          backend,  // Pass backend for multi-model dispatch
          context: additionalContext,
          agentType: agent_type,  // Pass agent type for native UI
        };

        const child = sessionManager.spawn(sessionId, config);
        if (!child) {
          return { success: false, error: "Failed to spawn child session" };
        }

        // Notify caller if handler provided
        if (context.onSpawn) {
          await context.onSpawn(child);
        }

        const backendInfo = backend ? ` using ${backend}` : '';
        const modelInfo = model ? ` (${model})` : '';
        return {
          success: true,
          result: {
            message: `Spawned ${agent_type || 'general'} agent '${role}'${backendInfo}${modelInfo} to work on: ${task}`,
            childSessionId: child.id,
            childRole: role,
            agentType: agent_type || 'general',
            backend: backend || 'claude',
            model: model,
            note: "You will receive their deliverable when they complete. Continue with your own work.",
          },
        };
      }

      case "get_context": {
        const { source, query, sibling_role } = params;

        const contextQuery: ContextQuery = {
          source,
          query,
          siblingRole: sibling_role,
        };

        const result = await sessionManager.getContext(sessionId, contextQuery);
        if (!result) {
          return { success: false, error: "Failed to retrieve context" };
        }

        return {
          success: true,
          result: {
            source: result.source,
            content: result.content,
            metadata: result.metadata,
          },
        };
      }

      case "log_decision": {
        const { decision, category, rationale } = params;

        const logged = sessionManager.logDecision(sessionId, decision, category, rationale);
        if (!logged) {
          return { success: false, error: "Failed to log decision" };
        }

        return {
          success: true,
          result: {
            message: "Decision logged successfully",
            decision: logged.decision,
            category: logged.category,
            note: "Other agents in this session tree can now see this decision.",
          },
        };
      }

      case "escalate": {
        const { type, summary, context: escalationContext, options } = params;

        const success = sessionManager.escalate(sessionId, {
          type: type as EscalationType,
          summary,
          context: escalationContext,
          options,
        });

        if (!success) {
          return { success: false, error: "Failed to escalate" };
        }

        return {
          success: true,
          result: {
            message: "Escalation sent to parent",
            type,
            summary,
            note: "Wait for parent's response before continuing. You are now in 'blocked' status.",
          },
        };
      }

      case "deliver": {
        const { type, summary, content, artifacts } = params;

        // Log any artifacts
        if (artifacts && Array.isArray(artifacts)) {
          for (const artifact of artifacts) {
            sessionManager.logArtifact(
              sessionId,
              artifact.path,
              undefined, // Content is in the filesystem
              artifact.description,
              type
            );
          }
        }

        sessionManager.deliver(sessionId, {
          type,
          summary,
          content,
          artifacts,
        });

        return {
          success: true,
          result: {
            message: "Deliverable sent to parent",
            summary,
            note: "Your session will be archived shortly. Good work!",
          },
        };
      }

      // ========================================================================
      // Context Negotiation Tools
      // ========================================================================

      case "submit_draft": {
        const { type, summary, content, artifacts } = params;
        const session = sessions.get(sessionId);

        if (!session) {
          return { success: false, error: "Session not found" };
        }

        if (!session.parent_session_id) {
          return {
            success: false,
            error: "Only child agents can submit drafts. Use 'deliver' instead.",
          };
        }

        // Get current revision number and increment
        const currentRevision = session.draft_revision || 0;
        const newRevision = currentRevision + 1;

        const draft: DraftDeliverable = {
          draft_id: crypto.randomUUID(),
          type,
          summary,
          content,
          artifacts,
          submitted_at: Date.now(),
          revision_number: newRevision,
        };

        // Log artifacts
        if (artifacts && Array.isArray(artifacts)) {
          for (const artifact of artifacts) {
            sessionManager.logArtifact(
              sessionId,
              artifact.path,
              undefined,
              artifact.description,
              type
            );
          }
        }

        draftDeliverables.submitDraft(sessionId, draft);

        // Emit draft submitted event
        if (context.onDraftSubmitted) {
          await context.onDraftSubmitted(sessionId, session.parent_session_id!, draft.draft_id, summary);
        }

        return {
          success: true,
          result: {
            message: "Draft submitted for parent review",
            draft_id: draft.draft_id,
            revision: newRevision,
            summary,
            note: "Wait for parent's response. They may accept or request clarification.",
          },
        };
      }

      case "request_clarification": {
        const { child_session_id, question, context: clarificationContext } = params;

        // Verify this is a valid child session
        const childSession = sessions.get(child_session_id);
        if (!childSession) {
          return { success: false, error: "Child session not found" };
        }

        if (childSession.parent_session_id !== sessionId) {
          return {
            success: false,
            error: "You can only request clarification from your own child agents",
          };
        }

        // Check if child has a pending draft
        const draft = draftDeliverables.getDraft(child_session_id);
        if (!draft) {
          return {
            success: false,
            error: "Child has no pending draft. They must submit_draft first.",
          };
        }

        // Create clarification request
        const request = draftDeliverables.requestClarification(
          child_session_id,
          sessionId,
          draft.draft_id,
          question,
          clarificationContext
        );

        // Emit clarification requested event
        if (context.onClarificationRequested) {
          await context.onClarificationRequested(child_session_id, sessionId, request.id, question);
        }

        return {
          success: true,
          result: {
            message: "Clarification request sent to child agent",
            clarification_id: request.id,
            question,
            child_role: childSession.role,
            note: "The child agent will receive your question and respond.",
          },
        };
      }

      case "respond_to_clarification": {
        const { clarification_id, response } = params;

        const request = clarificationRequests.get(clarification_id);
        if (!request) {
          return { success: false, error: "Clarification request not found" };
        }

        if (request.session_id !== sessionId) {
          return {
            success: false,
            error: "This clarification request is not for you",
          };
        }

        if (request.status === "responded") {
          return {
            success: false,
            error: "This clarification has already been responded to",
          };
        }

        // Record the response
        clarificationRequests.respond(clarification_id, response);

        // Update session status back to pending_review
        sessionManager.updateStatus(sessionId, "pending_review");

        // Emit clarification responded event
        if (context.onClarificationResponded) {
          await context.onClarificationResponded(sessionId, clarification_id, response);
        }

        return {
          success: true,
          result: {
            message: "Response sent to parent",
            clarification_id,
            note: "Your parent will review your response. They may accept your draft or ask more questions.",
          },
        };
      }

      case "accept_deliverable": {
        const { child_session_id, feedback } = params;

        const childSession = sessions.get(child_session_id);
        if (!childSession) {
          return { success: false, error: "Child session not found" };
        }

        if (childSession.parent_session_id !== sessionId) {
          return {
            success: false,
            error: "You can only accept deliverables from your own child agents",
          };
        }

        // Check if child has a draft
        const draft = draftDeliverables.getDraft(child_session_id);
        if (!draft) {
          return {
            success: false,
            error: "Child has no pending draft to accept",
          };
        }

        // Accept the draft (converts to final deliverable and archives)
        const accepted = draftDeliverables.acceptDraft(child_session_id);
        if (!accepted) {
          return { success: false, error: "Failed to accept draft" };
        }

        // Log feedback as a decision if provided
        if (feedback) {
          sessionManager.logDecision(
            sessionId,
            `Accepted deliverable from ${childSession.role}: ${feedback}`,
            "deliverable_feedback"
          );
        }

        // Emit draft accepted event
        if (context.onDraftAccepted) {
          await context.onDraftAccepted(child_session_id, sessionId);
        }

        return {
          success: true,
          result: {
            message: "Deliverable accepted",
            child_role: childSession.role,
            summary: draft.summary,
            content: draft.content,
            artifacts: draft.artifacts,
            note: "Child session is now complete. Their work has been finalized.",
          },
        };
      }

      case "check_pending_clarifications": {
        const pending = clarificationRequests.getPending(sessionId);

        if (pending.length === 0) {
          return {
            success: true,
            result: {
              message: "No pending clarification requests",
              pending: [],
            },
          };
        }

        return {
          success: true,
          result: {
            message: `You have ${pending.length} pending clarification request(s)`,
            pending: pending.map((p) => ({
              clarification_id: p.id,
              question: p.question,
              context: p.context,
              asked_at: new Date(p.created_at).toISOString(),
            })),
            note: "Use respond_to_clarification to answer each question.",
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate system prompt additions for a child session
 */
export function generateChildSystemPrompt(
  task: string,
  role: string,
  parentTask: string,
  siblingRoles: string[],
  decisions: string[],
  agentType?: string
): string {
  // Get agent-specific system prompt
  const effectiveType = agentType || inferAgentTypeFromRole(role);
  const agentDef = getAgentDefinition(effectiveType);

  const siblingsText =
    siblingRoles.length > 0
      ? `You have sibling agents working on: ${siblingRoles.join(", ")}`
      : "You are the only child agent at this level.";

  const decisionsText =
    decisions.length > 0
      ? `Recent project decisions:\n${decisions.map((d) => `- ${d}`).join("\n")}`
      : "";

  return `
# ${agentDef.displayName}

${agentDef.systemPrompt}

---

## Your Assigned Task
${task}

## Context
- **Parent's task**: ${parentTask}
- ${siblingsText}
${decisionsText}

## Multi-Session Coordination Tools
You have access to these tools for coordinating with other agents:
- **spawn_agent**: Create child agents for subtasks (if needed)
- **get_context**: Query parent, siblings, or project-wide decisions/artifacts
- **log_decision**: Record important decisions for other agents to see
- **escalate**: Request help when blocked (last resort)
- **deliver**: Complete your task and return results to parent (immediate, no review)
- **submit_draft**: Submit your work for parent review (recommended for complex tasks)
- **check_pending_clarifications**: See if parent has asked follow-up questions
- **respond_to_clarification**: Answer parent's follow-up questions

## Context Negotiation Protocol
For complex research or multi-step tasks, use **submit_draft** instead of **deliver**:
1. Complete your work and call **submit_draft** with your findings
2. Your parent will evaluate your draft and may ask follow-up questions
3. Use **check_pending_clarifications** to see if you have questions to answer
4. Use **respond_to_clarification** to answer each question
5. Your parent may ask more questions or accept your deliverable
6. This loop continues until your parent is satisfied

**Why use drafts?** Your parent has semantic context you don't have. They know WHY they assigned the task.
A single-pass summary often misses details that matter to them. The negotiation loop ensures they get what they actually need.

## Agent Guidelines
1. Focus on YOUR specific task. Don't duplicate work siblings are doing.
2. Use get_context to coordinate with siblings if needed.
3. Log important decisions so others can see them.
4. Only escalate if you truly cannot proceed.
5. For complex tasks, use **submit_draft** instead of **deliver** to enable feedback.
6. Be efficient - don't spawn agents for trivial work.
7. When answering clarifications, go back to the source if needed - don't guess.
  `.trim();
}

/**
 * Check if a tool name is a multi-session tool
 */
export function isMultiSessionTool(toolName: string): boolean {
  return multiSessionToolDefinitions.some((t) => t.name === toolName);
}
