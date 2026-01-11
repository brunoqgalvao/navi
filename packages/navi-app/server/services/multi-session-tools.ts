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
import { sessions, type EscalationType } from "../db";
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

The child agent has its own context window and can spawn its own children (up to depth 3).
You will receive their deliverable when they complete.

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
            "Optional: Model to use (defaults to parent's model). Use 'haiku' for simpler tasks.",
          enum: ["opus", "sonnet", "haiku"],
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
];

// Tool execution handlers
export interface ToolExecutionContext {
  sessionId: string;
  onSpawn?: (childSession: any) => Promise<void>;
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
        const { title, role, task, agent_type, model, context: additionalContext } = params;

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

        return {
          success: true,
          result: {
            message: `Spawned ${agent_type || 'general'} agent '${role}' to work on: ${task}`,
            childSessionId: child.id,
            childRole: role,
            agentType: agent_type || 'general',
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
- **deliver**: Complete your task and return results to parent

## Agent Guidelines
1. Focus on YOUR specific task. Don't duplicate work siblings are doing.
2. Use get_context to coordinate with siblings if needed.
3. Log important decisions so others can see them.
4. Only escalate if you truly cannot proceed.
5. **Call deliver when your task is COMPLETE** - this is required to signal completion.
6. Be efficient - don't spawn agents for trivial work.
  `.trim();
}

/**
 * Check if a tool name is a multi-session tool
 */
export function isMultiSessionTool(toolName: string): boolean {
  return multiSessionToolDefinitions.some((t) => t.name === toolName);
}
