import { query, createSdkMcpServer, tool, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { buildClaudeCodeEnv, getClaudeCodeRuntimeOptions, getNaviAuthOverridesFromEnv } from "./utils/claude-code";
import { getAgentDefinition, inferAgentTypeFromRole } from "./agent-types";
import { agentLoader, type ResolvedAgent, type AgentBundle } from "./services/agent-loader";

interface SkillInfo {
  name: string;
  description: string;
  content: string;
  basePath: string;
}

function parseSkillFrontmatter(content: string): { name?: string; description?: string; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return { body: content };
  }
  
  const [, frontmatter, body] = frontmatterMatch;
  const result: { name?: string; description?: string; body: string } = { body };
  
  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) result.name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
    
    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) result.description = descMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  
  return result;
}

function loadSkillsFromDir(skillsDir: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  
  if (!fs.existsSync(skillsDir)) return skills;
  
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = parseSkillFrontmatter(content);
          skills.push({
            name: parsed.name || entry.name,
            description: parsed.description || '',
            content: content,
            basePath: path.join(skillsDir, entry.name),
          });
        }
      }
    }
  } catch (e) {
    console.error(`[Worker] Error loading skills from ${skillsDir}:`, e);
  }
  
  return skills;
}

/**
 * Load skills from project and global directories.
 * If enabledSkillSlugs is provided, only skills with matching slugs (folder names) are loaded.
 * If enabledSkillSlugs is undefined, all skills are loaded (backwards compatibility).
 */
function loadAllSkills(cwd: string, enabledSkillSlugs?: string[]): SkillInfo[] {
  const projectSkillsDir = path.join(cwd, '.claude', 'skills');
  const globalSkillsDir = path.join(os.homedir(), '.claude', 'skills');

  const projectSkills = loadSkillsFromDir(projectSkillsDir);
  const globalSkills = loadSkillsFromDir(globalSkillsDir);

  // Merge: project skills take precedence over global skills with same name
  const allSkills = [...projectSkills];
  for (const gs of globalSkills) {
    if (!allSkills.find(s => s.name === gs.name)) {
      allSkills.push(gs);
    }
  }

  // Filter by enabled slugs if provided
  if (enabledSkillSlugs !== undefined) {
    const enabledSet = new Set(enabledSkillSlugs);
    const filtered = allSkills.filter(skill => {
      // Extract slug from basePath (last directory component)
      const slug = path.basename(skill.basePath);
      return enabledSet.has(slug);
    });
    console.error(`[Worker] Filtered skills: ${filtered.length} of ${allSkills.length} (enabled: ${enabledSkillSlugs.join(', ') || 'none'})`);
    return filtered;
  }

  return allSkills;
}

// Agent loading for Claude Agent SDK
interface AgentInfo {
  name: string;
  description: string;
  model?: 'haiku' | 'sonnet' | 'opus';
  tools?: string[];
  prompt: string;
}

function parseAgentFrontmatter(content: string): {
  name?: string;
  description?: string;
  model?: 'haiku' | 'sonnet' | 'opus';
  tools?: string[];
  body: string
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return { body: content };
  }

  const [, frontmatter, body] = frontmatterMatch;
  const result: {
    name?: string;
    description?: string;
    model?: 'haiku' | 'sonnet' | 'opus';
    tools?: string[];
    body: string
  } = { body };

  let currentKey = '';
  let inArray = false;
  const arrayValues: string[] = [];

  for (const line of frontmatter.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if it's an array item
    if (trimmed.startsWith('- ') && inArray) {
      arrayValues.push(trimmed.slice(2).trim());
      continue;
    }

    // Finish previous array if any
    if (inArray && currentKey === 'tools') {
      result.tools = [...arrayValues];
      arrayValues.length = 0;
      inArray = false;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      currentKey = key;

      if (value === '' || value === '|') {
        inArray = true;
      } else {
        const cleanValue = value.replace(/^["']|["']$/g, '');
        if (key === 'name') result.name = cleanValue;
        else if (key === 'description') result.description = cleanValue;
        else if (key === 'model' && ['haiku', 'sonnet', 'opus'].includes(cleanValue)) {
          result.model = cleanValue as 'haiku' | 'sonnet' | 'opus';
        }
      }
    }
  }

  // Handle trailing array
  if (inArray && currentKey === 'tools' && arrayValues.length > 0) {
    result.tools = [...arrayValues];
  }

  return result;
}

function loadAgentsFromDir(agentsDir: string): AgentInfo[] {
  const agents: AgentInfo[] = [];

  if (!fs.existsSync(agentsDir)) return agents;

  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const agentPath = path.join(agentsDir, entry.name);
        const content = fs.readFileSync(agentPath, 'utf-8');
        const parsed = parseAgentFrontmatter(content);
        const slug = entry.name.replace(/\.md$/, '');

        if (parsed.description) { // description is required for agents
          agents.push({
            name: slug,
            description: parsed.description,
            model: parsed.model,
            tools: parsed.tools,
            prompt: parsed.body,
          });
        }
      }
    }
  } catch (e) {
    console.error(`[Worker] Error loading agents from ${agentsDir}:`, e);
  }

  return agents;
}

function loadAllAgents(cwd: string): Record<string, any> {
  const projectAgentsDir = path.join(cwd, '.claude', 'agents');
  const globalAgentsDir = path.join(os.homedir(), '.claude', 'agents');

  const projectAgents = loadAgentsFromDir(projectAgentsDir);
  const globalAgents = loadAgentsFromDir(globalAgentsDir);

  // Merge, project takes precedence
  const allAgents: AgentInfo[] = [...projectAgents];
  for (const ga of globalAgents) {
    if (!allAgents.find(a => a.name === ga.name)) {
      allAgents.push(ga);
    }
  }

  // Convert to SDK format: Record<string, AgentDefinition>
  const agentsMap: Record<string, any> = {};
  for (const agent of allAgents) {
    agentsMap[agent.name] = {
      description: agent.description,
      prompt: agent.prompt,
      ...(agent.model && { model: agent.model }),
      ...(agent.tools && agent.tools.length > 0 && { tools: agent.tools }),
    };
  }

  console.error(`[Worker] Loaded ${allAgents.length} agents:`, Object.keys(agentsMap));
  return agentsMap;
}

const UI_INSTRUCTIONS = `
<ui-instructions>
## Rich Content Features

This UI supports rich content rendering in your responses. Use these features to enhance your explanations:

### Media Display (Images, Audio, Video)

Use \`media\` code blocks to display images, audio, or video files inline in the chat:

\`\`\`media
src: /path/to/image.png
alt: Description of the image
caption: Optional caption text
\`\`\`

Multiple items in one block:

\`\`\`media
src: /screenshots/before.png
caption: Before changes

src: /screenshots/after.png
caption: After changes
\`\`\`

Audio files:

\`\`\`media
type: audio
src: /path/to/audio.mp3
caption: Recording of the meeting
\`\`\`

Video files:

\`\`\`media
type: video
src: /path/to/video.mp4
caption: Demo video
\`\`\`

You can also use URLs:

\`\`\`media
src: https://example.com/image.jpg
\`\`\`

Supported formats:
- Images: png, jpg, jpeg, gif, webp, svg, bmp, ico
- Audio: mp3, wav, ogg, m4a, flac, aac
- Video: mp4, webm, mov, avi, mkv, m4v

The type is auto-detected from the file extension, but can be overridden with \`type: image|audio|video\`.

### Mermaid Diagrams

Use mermaid code blocks to create flowcharts, sequence diagrams, and more:

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[End]
\`\`\`

Supported diagram types: flowchart, sequence, class, state, entity-relationship, gantt, pie, and more.

### Interactive UI Components

Use \`genui\` code blocks to create interactive HTML elements that render inline:

\`\`\`genui
<div style="padding: 16px; background: #f0f9ff; border-radius: 8px;">
  <h3>Interactive Component</h3>
  <button>Click me</button>
  <form>
    <input type="text" name="query" placeholder="Enter value...">
    <button type="submit">Submit</button>
  </form>
</div>
\`\`\`

The genui blocks are sandboxed and support:
- Buttons and forms
- Input fields (text, checkbox, radio, select)
- Basic styling with inline CSS
- Click and form submit events are captured

### Copyable Text Snippets

Use \`copyable\` code blocks to display text with a convenient copy button:

\`\`\`copyable
npm install my-package
\`\`\`

With a label:

\`\`\`copyable
label: API Key
sk-1234567890abcdef
\`\`\`

Multiline content:

\`\`\`copyable
label: Environment Variables
text:
DATABASE_URL=postgres://localhost:5432/mydb
API_KEY=sk-1234567890
SECRET=my-secret-value
\`\`\`

Use copyable blocks for:
- Commands the user should run
- API keys, tokens, or credentials
- Configuration values
- URLs or file paths they might need to copy

### JSON Tree Display

When outputting complex JSON data, the UI will render it as an interactive collapsible tree with expand/collapse controls.

## Preview Panel

The UI has a built-in preview panel that can display:
- **URLs**: Any localhost URL (e.g., \`http://localhost:3000\`)
- **Files**: Code files with syntax highlighting
- **Markdown**: Rendered markdown documents
- **Images**: PNG, JPG, GIF, SVG, etc.

### How to Suggest Previews

When you create or modify files that the user might want to see, suggest they preview it:

1. For web apps: "You can preview this at http://localhost:3000 using the preview panel"
2. For files: "You can preview this file using the Files panel on the right"
3. For markdown: "Open the preview panel to see the rendered markdown"

### File Browser

The Files panel shows the project directory structure. Users can:
- Navigate directories by clicking folders
- Click files to preview them
- Use the tabs to switch between Files and Preview
</ui-instructions>
`;

function buildSkillsMetadataPrompt(skills: SkillInfo[]): string {
  if (skills.length === 0) return UI_INSTRUCTIONS;
  
  let prompt = `\n<skills>
You have access to the following skills. When a user's request matches a skill's purpose, you MUST read the skill's SKILL.md file to get detailed instructions before proceeding.

<available_skills>
`;
  
  for (const skill of skills) {
    prompt += `<skill name="${skill.name}" path="${skill.basePath}/SKILL.md">
${skill.description}
</skill>
`;
  }
  
  prompt += `</available_skills>

IMPORTANT SKILL INSTRUCTIONS:
- When a task matches a skill's description, IMMEDIATELY use the Read tool to read the skill's SKILL.md file
- Follow the instructions in the skill file precisely
- Skills may reference additional files in their directory - read those as needed
- If the user asks to "use skill X" or mentions a skill name, invoke that skill
</skills>`;
  
  return prompt;
}

function buildSystemPromptAppend(skills: SkillInfo[]): string {
  const skillsPrompt = buildSkillsMetadataPrompt(skills);
  if (skills.length === 0) {
    return UI_INSTRUCTIONS;
  }
  return UI_INSTRUCTIONS + '\n' + skillsPrompt;
}

interface MultiSessionContext {
  enabled: boolean;
  parentSessionId?: string;
  rootSessionId?: string;
  depth: number;
  role?: string;
  task?: string;
  agentType?: string;  // 'browser' | 'coding' | 'runner' | etc.
  parentTask?: string;
  siblingRoles?: string[];
  recentDecisions?: string[];
}

function buildMultiSessionSystemPrompt(ctx: MultiSessionContext): string {
  // Get agent-specific system prompt based on agent type
  const effectiveType = ctx.agentType || (ctx.role ? inferAgentTypeFromRole(ctx.role) : "general");
  const agentDef = getAgentDefinition(effectiveType);

  const siblingsText = ctx.siblingRoles && ctx.siblingRoles.length > 0
    ? `You have sibling agents working on: ${ctx.siblingRoles.join(", ")}`
    : "You are the only child agent at this level.";

  const decisionsText = ctx.recentDecisions && ctx.recentDecisions.length > 0
    ? `\n\nRecent project decisions:\n${ctx.recentDecisions.map(d => `- ${d}`).join("\n")}`
    : "";

  const canSpawn = ctx.depth < 2; // Max depth is 3, so depth 0, 1 can spawn

  return `
# ${agentDef.displayName}

${agentDef.systemPrompt}

---

## Your Assigned Task
${ctx.task || "Complete the assigned work"}

## Context
- **Parent's task**: ${ctx.parentTask || "Unknown"}
- ${siblingsText}
- Session depth: ${ctx.depth} of 3 (max)${decisionsText}

## Multi-Session Coordination Tools (via MCP)

${canSpawn ? `- **spawn_agent**: Create child agents for subtasks (you can spawn up to ${3 - ctx.depth - 1} more levels)` : "- spawn_agent: NOT AVAILABLE (max depth reached)"}
- **get_context**: Query parent, siblings, or project-wide decisions/artifacts
- **log_decision**: Record important decisions for other agents to see
- **escalate**: Request help when blocked (parent first, then human)
- **deliver**: Complete your task and return results to parent

## Agent Guidelines

1. **Focus on YOUR specific task.** Don't duplicate work siblings are doing.
2. **Use get_context sparingly** to coordinate with siblings if needed.
3. **Log important decisions** so others can see them (architecture, API contracts, tech choices).
4. **Only escalate if you truly cannot proceed.** Try to resolve issues yourself first.
5. **Deliver when your task is COMPLETE** - this is required to signal completion.
6. **Be efficient** - don't spawn agents for trivial work you can do yourself.
7. **Coordinate with siblings** - check what decisions they've made before making conflicting ones.

## Important Notes

- Your deliverable will be sent to your parent agent, who will incorporate it into their work.
- After you call \`deliver\`, your session will be archived.
- If you spawn child agents, wait for their deliverables before completing your own task.
`.trim();
}

interface WorkerInput {
  prompt: string;
  cwd: string;
  resume?: string;
  model?: string;
  allowedTools?: string[];
  sessionId?: string;
  // Selected agent (e.g., "coder", "img3d") - if set, uses agent's system prompt
  agentId?: string;
  permissionSettings?: {
    autoAcceptAll: boolean;
    requireConfirmation: string[];
  };
  // Multi-session hierarchy context
  multiSession?: {
    enabled: boolean;
    parentSessionId?: string;
    rootSessionId?: string;
    depth: number;
    role?: string;
    task?: string;
    parentTask?: string;
    siblingRoles?: string[];
    recentDecisions?: string[];
  };
  // MCP server enabled/disabled settings (server name -> enabled boolean)
  // If a server is not in the map, it defaults to enabled
  mcpSettings?: Record<string, boolean>;
  // Built-in MCP server enabled/disabled states (separate from external servers)
  mcpBuiltinSettings?: Record<string, boolean>;
  // External MCP server configs from .mcp.json files (already filtered to enabled only)
  externalMcpServers?: Record<string, {
    type?: "stdio" | "sse" | "streamable-http";
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  }>;
  // Enabled skill slugs for this project (undefined = load all skills)
  enabledSkillSlugs?: string[];
}

const pendingPermissions = new Map<string, (result: { approved: boolean; approveAll?: boolean }) => void>();
const pendingQuestions = new Map<string, (result: { answers: Record<string, string | string[]> }) => void>();

// Define the question option schema
const questionOptionSchema = z.object({
  label: z.string().describe("Short label for the option (e.g., 'TypeScript')"),
  description: z.string().describe("Description of this option"),
});

// Define the question schema
const questionSchema = z.object({
  question: z.string().describe("The question to ask the user"),
  header: z.string().max(12).describe("Short header/category for the question (max 12 chars)"),
  options: z.array(questionOptionSchema).min(2).max(4).describe("2-4 options for the user to choose from"),
  multiSelect: z.boolean().describe("Whether the user can select multiple options"),
});

// Create MCP server with ask_user_question tool
const userInteractionServer = createSdkMcpServer({
  name: "user-interaction",
  version: "1.0.0",
  tools: [
    tool(
      "ask_user_question",
      "Ask the user one or more questions and wait for their response. Use this when you need clarification or user input before proceeding.",
      {
        questions: z.array(questionSchema).min(1).max(4).describe("1-4 questions to ask the user"),
      },
      async (args) => {
        const requestId = crypto.randomUUID();

        // Send question to UI
        send({
          type: "ask_user_question",
          requestId,
          questions: args.questions,
        });

        // Wait for user response
        const result = await new Promise<{ answers: Record<string, string | string[]> }>((resolve) => {
          pendingQuestions.set(requestId, resolve);
        });

        // Format the response
        const answerText = Object.entries(result.answers)
          .map(([header, answer]) => {
            const answerStr = Array.isArray(answer) ? answer.join(", ") : answer;
            return `${header}: ${answerStr}`;
          })
          .join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `User answered:\n${answerText}`,
          }],
        };
      }
    ),
  ],
});

// ============================================================================
// Multi-Session Agent Tools (Fractal Agents)
// ============================================================================

// Pending multi-session requests
const pendingSpawnRequests = new Map<string, (result: { success: boolean; childSessionId?: string; error?: string }) => void>();
const pendingContextRequests = new Map<string, (result: { content: string; metadata?: any }) => void>();
const pendingEscalationRequests = new Map<string, (result: { action: string; content: string }) => void>();
const pendingDeliverRequests = new Map<string, (result: { success: boolean }) => void>();
const pendingDecisionRequests = new Map<string, (result: { success: boolean; decisionId?: string }) => void>();
const pendingWaitRequests = new Map<string, (result: { skipped: boolean }) => void>();

// Queue for child deliverables received during the session
// These are injected via get_context(source: 'sibling') or when checking spawned agents
interface PendingDeliverable {
  childSessionId: string;
  childRole: string;
  deliverable: {
    type: string;
    summary: string;
    content: string;
    artifacts?: Array<{ path: string; description?: string }>;
  };
  receivedAt: number;
}
const pendingChildDeliverables: PendingDeliverable[] = [];

// Track spawned child sessions for this parent (to check for deliverables)
const spawnedChildren = new Map<string, { role: string; task: string; spawnedAt: number }>();

// Create MCP server with multi-session tools
const multiSessionServer = createSdkMcpServer({
  name: "multi-session",
  version: "1.0.0",
  tools: [
    tool(
      "spawn_agent",
      `Spawn a child agent to handle a subtask in parallel.
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
      {
        title: z.string().describe("Short title for the child session (e.g., 'Build Login Form')"),
        role: z.string().describe("The role/specialty of the child agent (e.g., 'frontend', 'backend', 'researcher', 'architect')"),
        task: z.string().describe("Clear description of what the child should accomplish. Be specific about deliverables."),
        agent_type: z.enum(["browser", "coding", "runner", "research", "planning", "reviewer", "general"]).optional().describe("Type of agent to spawn - determines UI and capabilities. Choose based on task nature."),
        model: z.enum(["opus", "sonnet", "haiku"]).optional().describe("Optional: Model to use (defaults to parent's model). Use 'haiku' for simpler tasks."),
        context: z.string().optional().describe("Optional: Additional context to pass to the child that they should know."),
        wait_for_completion: z.boolean().optional().describe("If true, this tool will block until the child completes and return their deliverable. Default: false (async)."),
      },
      async (args) => {
        const requestId = crypto.randomUUID();

        send({
          type: "multi_session_spawn",
          requestId,
          title: args.title,
          role: args.role,
          task: args.task,
          agent_type: args.agent_type,
          model: args.model,
          context: args.context,
        });

        const result = await new Promise<{ success: boolean; childSessionId?: string; model?: string; backend?: string; error?: string }>((resolve) => {
          pendingSpawnRequests.set(requestId, resolve);
        });

        if (!result.success) {
          return {
            content: [{
              type: "text" as const,
              text: `Failed to spawn child agent: ${result.error}`,
            }],
          };
        }

        // Track this spawned child
        if (result.childSessionId) {
          spawnedChildren.set(result.childSessionId, {
            role: args.role,
            task: args.task,
            spawnedAt: Date.now(),
          });
        }

        // If wait_for_completion is true, block until we receive the deliverable
        if (args.wait_for_completion && result.childSessionId) {
          console.error(`[Worker] Waiting for child ${result.childSessionId} to complete...`);

          // Wait for the deliverable to arrive (polling pendingChildDeliverables)
          const deliverable = await new Promise<PendingDeliverable | null>((resolve) => {
            const checkInterval = setInterval(() => {
              const idx = pendingChildDeliverables.findIndex(d => d.childSessionId === result.childSessionId);
              if (idx >= 0) {
                const delivered = pendingChildDeliverables.splice(idx, 1)[0];
                clearInterval(checkInterval);
                resolve(delivered);
              }
            }, 500);

            // Timeout after 10 minutes
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve(null);
            }, 10 * 60 * 1000);
          });

          if (deliverable) {
            return {
              content: [{
                type: "text" as const,
                text: `## Child Agent "${args.role}" Completed

**Type:** ${deliverable.deliverable.type}
**Summary:** ${deliverable.deliverable.summary}

### Deliverable Content:
${deliverable.deliverable.content}

${deliverable.deliverable.artifacts?.length ? `### Artifacts Created:\n${deliverable.deliverable.artifacts.map(a => `- ${a.path}${a.description ? `: ${a.description}` : ''}`).join('\n')}` : ''}`,
              }],
            };
          } else {
            return {
              content: [{
                type: "text" as const,
                text: `Child agent '${args.role}' (${result.childSessionId}) timed out after 10 minutes. Use get_context(source: 'sibling') to check if it completed, or check the session hierarchy.`,
              }],
            };
          }
        }

        const modelInfo = result.model ? ` (${result.model})` : '';
        const backendInfo = result.backend && result.backend !== 'claude' ? ` using ${result.backend}` : '';

        return {
          content: [{
            type: "text" as const,
            text: `Spawned ${args.agent_type || 'general'} agent '${args.role}'${modelInfo}${backendInfo} to work on: ${args.task}

Child session ID: ${result.childSessionId}

The child agent is now working independently. Their deliverable will be available via get_context(source: 'sibling') when they complete. Continue with your own work - use get_context to check on their progress or retrieve their results.`,
          }],
        };
      }
    ),

    tool(
      "get_context",
      `Access context from parent session, sibling sessions, project decisions, or artifacts.
Use this when you need information beyond your immediate task context.

Sources:
- 'parent': Get information about the parent session's task and status
- 'sibling': Get information about sibling sessions (other children of your parent). Also returns any completed deliverables from children you spawned.
- 'decisions': Get project-wide decisions that have been logged
- 'artifacts': Get list of artifacts created in this session tree

Be specific in your query to get relevant information. You'll receive excerpts, not full dumps.
NOTE: Use this to check on spawned child agents and retrieve their deliverables when complete.`,
      {
        source: z.enum(["parent", "sibling", "decisions", "artifacts"]).describe("Where to get context from"),
        query: z.string().describe("What specific information do you need?"),
        sibling_role: z.string().optional().describe("If source is 'sibling', which sibling's role to query (optional)"),
      },
      async (args) => {
        const requestId = crypto.randomUUID();

        send({
          type: "multi_session_get_context",
          requestId,
          source: args.source,
          query: args.query,
          siblingRole: args.sibling_role,
        });

        const result = await new Promise<{ content: string; metadata?: any }>((resolve) => {
          pendingContextRequests.set(requestId, resolve);
        });

        // If querying siblings, also include any pending deliverables we've received
        let responseContent = result.content;

        if (args.source === "sibling" && pendingChildDeliverables.length > 0) {
          // Filter deliverables by role if specified
          const relevantDeliverables = args.sibling_role
            ? pendingChildDeliverables.filter(d => d.childRole === args.sibling_role)
            : pendingChildDeliverables;

          if (relevantDeliverables.length > 0) {
            const deliverablesSummary = relevantDeliverables.map(d =>
              `\n### 📬 Deliverable from "${d.childRole}" (session: ${d.childSessionId})
**Type:** ${d.deliverable.type}
**Summary:** ${d.deliverable.summary}

${d.deliverable.content}

${d.deliverable.artifacts?.length ? `**Artifacts:**\n${d.deliverable.artifacts.map(a => `- ${a.path}${a.description ? `: ${a.description}` : ''}`).join('\n')}` : ''}`
            ).join('\n\n---\n');

            responseContent += `\n\n## 📬 Received Deliverables\n\nThe following child agents have completed and delivered their results:${deliverablesSummary}`;

            // Clear delivered items (they've been reported)
            // Keep them in case agent needs to re-query
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: responseContent,
          }],
        };
      }
    ),

    tool(
      "log_decision",
      `Log an important decision for the project.
Other agents (parent, siblings, children) can see this via get_context.

Use for:
- Architecture choices ("Using REST instead of GraphQL")
- Technology selections ("Using Tailwind for styling")
- API contracts ("POST /api/auth/login returns {token, user}")
- Design patterns ("Using repository pattern for data access")

Decisions help coordinate work across agents and maintain consistency.`,
      {
        decision: z.string().describe("The decision that was made"),
        category: z.string().optional().describe("Category (e.g., 'architecture', 'api', 'tech_choice', 'design', 'security')"),
        rationale: z.string().optional().describe("Why this decision was made (optional but helpful)"),
      },
      async (args) => {
        const requestId = crypto.randomUUID();

        send({
          type: "multi_session_log_decision",
          requestId,
          decision: args.decision,
          category: args.category,
          rationale: args.rationale,
        });

        const result = await new Promise<{ success: boolean; decisionId?: string }>((resolve) => {
          pendingDecisionRequests.set(requestId, resolve);
        });

        if (!result.success) {
          return {
            content: [{
              type: "text" as const,
              text: "Failed to log decision.",
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: `Decision logged: "${args.decision}"
${args.category ? `Category: ${args.category}` : ""}
${args.rationale ? `Rationale: ${args.rationale}` : ""}

Other agents in this session tree can now see this decision.`,
          }],
        };
      }
    ),

    tool(
      "escalate",
      `Escalate to your parent session when you're blocked and cannot proceed.
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
      {
        type: z.enum(["question", "decision_needed", "blocker", "permission"]).describe("Type of escalation"),
        summary: z.string().describe("Brief summary of the issue (1-2 sentences)"),
        context: z.string().describe("What you tried and why you're stuck"),
        options: z.array(z.string()).optional().describe("If type is 'decision_needed', the available choices"),
      },
      async (args) => {
        const requestId = crypto.randomUUID();

        send({
          type: "multi_session_escalate",
          requestId,
          escalationType: args.type,
          summary: args.summary,
          context: args.context,
          options: args.options,
        });

        const result = await new Promise<{ action: string; content: string }>((resolve) => {
          pendingEscalationRequests.set(requestId, resolve);
        });

        return {
          content: [{
            type: "text" as const,
            text: `Escalation resolved:
Action: ${result.action}
Response: ${result.content}

You can now continue with your task.`,
          }],
        };
      }
    ),

    tool(
      "check_spawned_agents",
      `Check on the status and deliverables of child agents you have spawned.
Use this to retrieve results from agents working in parallel.

Returns:
- List of spawned agents and their current status
- Any deliverables that have been completed
- Whether agents are still working

IMPORTANT: If you spawn agents in parallel, YOU MUST use this tool to retrieve their results before responding to the user.`,
      {},
      async () => {
        // Check for any deliverables we've received
        if (pendingChildDeliverables.length === 0 && spawnedChildren.size === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No spawned agents found. You haven't spawned any child agents in this session.",
            }],
          };
        }

        let response = "## Spawned Agent Status\n\n";

        // List all spawned children
        if (spawnedChildren.size > 0) {
          response += "### Spawned Agents:\n";
          spawnedChildren.forEach((info, sessionId) => {
            const hasDelivered = pendingChildDeliverables.some(d => d.childSessionId === sessionId);
            const status = hasDelivered ? "✅ Completed" : "🔄 Working...";
            response += `- **${info.role}** (${sessionId}): ${status}\n  Task: ${info.task}\n`;
          });
          response += "\n";
        }

        // Show any deliverables
        if (pendingChildDeliverables.length > 0) {
          response += "### 📬 Received Deliverables:\n\n";
          for (const d of pendingChildDeliverables) {
            response += `---\n#### From: ${d.childRole} (${d.childSessionId})\n`;
            response += `**Type:** ${d.deliverable.type}\n`;
            response += `**Summary:** ${d.deliverable.summary}\n\n`;
            response += `${d.deliverable.content}\n\n`;
            if (d.deliverable.artifacts?.length) {
              response += `**Artifacts:**\n${d.deliverable.artifacts.map(a => `- ${a.path}${a.description ? `: ${a.description}` : ''}`).join('\n')}\n\n`;
            }
          }
        } else if (spawnedChildren.size > 0) {
          response += "### No deliverables yet\n";
          response += "Your spawned agents are still working. Check again in a moment, or use `wait` tool to pause.";
        }

        return {
          content: [{
            type: "text" as const,
            text: response,
          }],
        };
      }
    ),

    tool(
      "deliver",
      `Complete your task and deliver results to your parent session.
After calling this, your session will be archived.

IMPORTANT: Only call this when your task is fully complete.
If you have subtasks running, wait for them to deliver first.

The deliverable will be sent to your parent, who will incorporate it into their work.`,
      {
        type: z.enum(["code", "research", "decision", "artifact", "error"]).describe("Type of deliverable"),
        summary: z.string().describe("Brief summary of what you accomplished"),
        content: z.string().describe("The actual deliverable content (can be code, analysis, decision, etc.)"),
        artifacts: z.array(z.object({
          path: z.string().describe("File path"),
          description: z.string().optional().describe("What this file does"),
        })).optional().describe("List of files created/modified"),
      },
      async (args) => {
        const requestId = crypto.randomUUID();

        send({
          type: "multi_session_deliver",
          requestId,
          deliverableType: args.type,
          summary: args.summary,
          content: args.content,
          artifacts: args.artifacts,
        });

        const result = await new Promise<{ success: boolean }>((resolve) => {
          pendingDeliverRequests.set(requestId, resolve);
        });

        return {
          content: [{
            type: "text" as const,
            text: result.success
              ? `Deliverable sent to parent. Your task is complete and this session will be archived shortly. Good work!`
              : `Failed to deliver. Please try again or escalate if the issue persists.`,
          }],
        };
      }
    ),
  ],
});

// ============================================================================
// Navi Context Tools - View process/terminal logs
// ============================================================================

const NAVI_API_BASE = process.env.NAVI_API_URL || "http://localhost:3001";

async function fetchNaviApi(path: string): Promise<any> {
  try {
    const res = await fetch(`${NAVI_API_BASE}${path}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return res.json();
  } catch (e: any) {
    return { error: e.message };
  }
}

function stripAnsiCodes(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
}

const naviContextServer = createSdkMcpServer({
  name: "navi-context",
  version: "1.0.0",
  tools: [
    tool(
      "view_processes",
      `List and view output from background processes (dev servers, builds, etc).
Use this to check what processes are running and view their logs.
This is useful when debugging issues or checking if a dev server started correctly.`,
      {
        processId: z.string().optional().describe("Specific process ID to view logs for. If omitted, lists all processes."),
        lines: z.number().optional().default(30).describe("Number of log lines to retrieve (default: 30)"),
        status: z.enum(["running", "completed", "failed", "killed"]).optional().describe("Filter by status"),
      },
      async (args) => {
        if (args.processId) {
          // Get specific process logs
          const proc = await fetchNaviApi(`/api/background-processes/${args.processId}`);
          if (proc.error) {
            return { content: [{ type: "text" as const, text: `Error: ${proc.error}` }] };
          }

          const output = await fetchNaviApi(`/api/background-processes/${args.processId}/output?lines=${args.lines || 30}`);
          const logs = (output.output || []).map(stripAnsiCodes).join("\n");

          return {
            content: [{
              type: "text" as const,
              text: `## Process: ${proc.label || proc.id}
**Status:** ${proc.status}${proc.exitCode !== undefined ? ` (exit: ${proc.exitCode})` : ""}
**Command:** \`${proc.command}\`
**CWD:** ${proc.cwd}
**Ports:** ${proc.ports?.length ? proc.ports.join(", ") : "none detected"}

### Output (last ${args.lines || 30} lines):
\`\`\`
${logs || "(no output)"}
\`\`\``,
            }],
          };
        }

        // List all processes
        const statusFilter = args.status ? `?status=${args.status}` : "";
        const processes = await fetchNaviApi(`/api/background-processes${statusFilter}`);

        if (processes.error) {
          return { content: [{ type: "text" as const, text: `Error: ${processes.error}` }] };
        }

        if (!processes.length) {
          return { content: [{ type: "text" as const, text: "No background processes running." }] };
        }

        const list = processes.map((p: any) =>
          `- **${p.label || p.id}** [${p.status}]: \`${p.command.slice(0, 50)}${p.command.length > 50 ? "..." : ""}\`${p.ports?.length ? ` (ports: ${p.ports.join(", ")})` : ""}`
        ).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `## Background Processes (${processes.length})\n${list}\n\nUse \`view_processes\` with a processId to see logs.`,
          }],
        };
      }
    ),

    tool(
      "view_terminal",
      `View output from a terminal session.
Use this to check what's happening in the user's terminal, look for errors, or get context about recent commands.`,
      {
        terminalId: z.string().optional().describe("Specific terminal ID. If omitted, lists all terminals."),
        lines: z.number().optional().default(30).describe("Number of lines to retrieve (default: 30)"),
        checkErrors: z.boolean().optional().default(false).describe("If true, also check for error patterns"),
      },
      async (args) => {
        if (args.terminalId) {
          // Get terminal buffer
          const buffer = await fetchNaviApi(`/api/terminal/pty/${args.terminalId}/buffer?lines=${args.lines || 30}`);

          if (buffer.error) {
            return { content: [{ type: "text" as const, text: `Error: ${buffer.error}` }] };
          }

          const logs = (buffer.lines || []).map(stripAnsiCodes).join("\n");

          let errorInfo = "";
          if (args.checkErrors) {
            const errors = await fetchNaviApi(`/api/terminal/pty/${args.terminalId}/errors`);
            if (errors.hasErrors) {
              errorInfo = `\n\n### ⚠️ Errors Detected:\n\`\`\`\n${errors.errorLines.map(stripAnsiCodes).join("\n")}\n\`\`\``;
            }
          }

          return {
            content: [{
              type: "text" as const,
              text: `## Terminal Output (last ${args.lines || 30} lines):\n\`\`\`\n${logs || "(empty)"}\n\`\`\`${errorInfo}`,
            }],
          };
        }

        // List all terminals
        const terminals = await fetchNaviApi("/api/terminal/pty");

        if (terminals.error) {
          return { content: [{ type: "text" as const, text: `Error: ${terminals.error}` }] };
        }

        if (!terminals.length) {
          return { content: [{ type: "text" as const, text: "No active terminal sessions." }] };
        }

        const list = terminals.map((t: any) =>
          `- **${t.name || t.terminalId}** (PID: ${t.pid}) - ${t.cwd}`
        ).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `## Active Terminals (${terminals.length})\n${list}\n\nUse \`view_terminal\` with a terminalId to see output.`,
          }],
        };
      }
    ),

    tool(
      "wait",
      `Pause execution for a specified duration. Use this when you need to:
- Wait for a server to start up
- Give a process time to initialize
- Wait for a file to be written
- Allow time for a background task to complete

The user will see a countdown and can skip the wait if needed.
Prefer this over bash sleep commands for better UX.`,
      {
        seconds: z.number().min(1).max(432000).describe("How many seconds to wait (1-432000, up to 5 days)"),
        reason: z.string().optional().describe("Why you're waiting (shown to user, e.g., 'Waiting for dev server to start')"),
      },
      async (args) => {
        const requestId = crypto.randomUUID();
        const startTime = Date.now();

        // Send wait start message to UI
        send({
          type: "session_wait_start",
          requestId,
          seconds: args.seconds,
          reason: args.reason || "Waiting...",
        });

        // Wait for either timeout or skip signal from UI
        const result = await Promise.race([
          new Promise<{ skipped: boolean }>((resolve) => {
            pendingWaitRequests.set(requestId, resolve);
          }),
          new Promise<{ skipped: boolean }>((resolve) => {
            setTimeout(() => {
              pendingWaitRequests.delete(requestId);
              resolve({ skipped: false });
            }, args.seconds * 1000);
          }),
        ]);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // Send wait end message to UI
        send({
          type: "session_wait_end",
          requestId,
          skipped: result.skipped,
        });

        return {
          content: [{
            type: "text" as const,
            text: result.skipped
              ? `Wait skipped by user after ${elapsed}s (originally ${args.seconds}s)`
              : `Waited ${elapsed}s${args.reason ? ` (${args.reason})` : ""}`,
          }],
        };
      }
    ),
  ],
});

function send(msg: any) {
  console.log(JSON.stringify(msg));
}

function formatMessage(msg: SDKMessage, uiSessionId?: string): any {
  const timestamp = Date.now();
  const uuid = (msg as any).uuid || crypto.randomUUID();
  
  switch (msg.type) {
    case "system": {
      const systemMsg = msg as any;
      const base = {
        type: "system",
        uiSessionId,
        claudeSessionId: msg.session_id,
        subtype: systemMsg.subtype,
        uuid,
        timestamp,
      };
      
      switch (systemMsg.subtype) {
        case "init":
          return {
            ...base,
            cwd: systemMsg.cwd,
            model: systemMsg.model,
            tools: systemMsg.tools,
            skills: systemMsg.skills,
            mcp_servers: systemMsg.mcp_servers,
            permissionMode: systemMsg.permissionMode,
            apiKeySource: systemMsg.apiKeySource,
            betas: systemMsg.betas,
            agents: systemMsg.agents,
          };
        case "compact_boundary":
          return {
            ...base,
            compactMetadata: systemMsg.compact_metadata,
          };
        case "status":
          return {
            ...base,
            status: systemMsg.status,
          };
        case "hook_response":
          return {
            ...base,
            hookName: systemMsg.hook_name,
            hookEvent: systemMsg.hook_event,
            stdout: systemMsg.stdout,
            stderr: systemMsg.stderr,
            exitCode: systemMsg.exit_code,
          };
        default:
          return base;
      }
    }

    case "assistant":
      return {
        type: "assistant",
        uiSessionId,
        claudeSessionId: msg.session_id,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
        uuid,
        timestamp,
        error: (msg as any).error,
        usage: (msg as any).message?.usage,
      };

    case "user":
      return {
        type: "user",
        uiSessionId,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
        uuid,
        timestamp,
        isSynthetic: (msg as any).isSynthetic,
        toolUseResult: (msg as any).tool_use_result,
        isReplay: (msg as any).isReplay,
      };

    case "result": {
      const resultMsg = msg as any;
      return {
        type: "result",
        uiSessionId,
        claudeSessionId: msg.session_id,
        subtype: resultMsg.subtype,
        costUsd: resultMsg.total_cost_usd,
        durationMs: resultMsg.duration_ms,
        durationApiMs: resultMsg.duration_api_ms,
        numTurns: resultMsg.num_turns,
        usage: resultMsg.usage,
        modelUsage: resultMsg.modelUsage,
        isError: resultMsg.is_error,
        result: resultMsg.result,
        errors: resultMsg.errors,
        permissionDenials: resultMsg.permission_denials,
        structuredOutput: resultMsg.structured_output,
        uuid,
        timestamp,
      };
    }

    case "tool_progress":
      return {
        type: "tool_progress",
        uiSessionId,
        toolUseId: msg.tool_use_id,
        toolName: msg.tool_name,
        parentToolUseId: msg.parent_tool_use_id || null,
        elapsedTimeSeconds: msg.elapsed_time_seconds,
        uuid,
        timestamp,
      };

    case "stream_event": {
      const streamMsg = msg as any;
      return {
        type: "stream_event",
        uiSessionId,
        claudeSessionId: msg.session_id,
        event: streamMsg.event,
        parentToolUseId: streamMsg.parent_tool_use_id || null,
        uuid,
        timestamp,
      };
    }

    case "auth_status": {
      const authMsg = msg as any;
      return {
        type: "auth_status",
        uiSessionId,
        claudeSessionId: msg.session_id,
        isAuthenticating: authMsg.isAuthenticating,
        output: authMsg.output,
        error: authMsg.error,
        uuid,
        timestamp,
      };
    }

    default:
      return { 
        type: "unknown", 
        uiSessionId, 
        raw: msg,
        uuid,
        timestamp,
      };
  }
}

let sessionApprovedAll = false;

async function runQuery(input: WorkerInput) {
  const { prompt, cwd, resume, model, allowedTools, sessionId, agentId, permissionSettings, multiSession, mcpSettings, mcpBuiltinSettings, externalMcpServers, enabledSkillSlugs } = input;

  // Debug: Log multiSession state
  console.error(`[Worker] multiSession received:`, JSON.stringify(multiSession, null, 2));

  // Initialize database for integration MCPs (credentials, sessions)
  // This is required because the worker runs in a separate Bun process
  try {
    const { initDb } = await import("./db");
    await initDb();
    // Also init integrations/credentials tables
    const { initIntegrationsTable } = await import("./integrations/db");
    initIntegrationsTable();
    console.error(`[Worker] Database initialized`);
  } catch (e) {
    console.error(`[Worker] Failed to initialize database:`, e);
  }

  // Clear any stray API keys from environment - Navi controls auth exclusively
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;

  // Get auth config passed from handler
  const authMode = process.env.NAVI_AUTH_MODE || "unknown";
  const authSource = process.env.NAVI_AUTH_SOURCE || "unknown";
  const authOverrides = getNaviAuthOverridesFromEnv(process.env);

  console.error(`[Worker] Auth mode: ${authMode.toUpperCase()}`);
  console.error(`[Worker] Auth source: ${authSource}`);
  if (authOverrides.apiKey) {
    console.error(`[Worker] API key prefix: ${authOverrides.apiKey.slice(0, 8)}...`);
  }
  if (authOverrides.baseUrl) {
    console.error(`[Worker] Base URL override: ${authOverrides.baseUrl}`);
  }

  const claudeEnv = buildClaudeCodeEnv(process.env, authOverrides);

  // Debug: confirm what's being passed to Claude Code subprocess
  console.error(`[Worker] claudeEnv.ANTHROPIC_API_KEY: ${claudeEnv.ANTHROPIC_API_KEY ? claudeEnv.ANTHROPIC_API_KEY.slice(0, 8) + "..." : "NOT SET"}`);
  console.error(`[Worker] claudeEnv.ANTHROPIC_BASE_URL: ${claudeEnv.ANTHROPIC_BASE_URL || "NOT SET"}`);
  console.error(`[Worker] claudeEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS: ${claudeEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS || "NOT SET"}`);
  console.error(`[Worker] Model requested: ${model || "default"}`);
  const runtimeOptions = getClaudeCodeRuntimeOptions();

  const canUseTool = async (
    toolName: string,
    toolInput: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string }
  ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> } | { behavior: 'deny'; message: string; interrupt?: boolean }> => {
    // MCP tools (like ask_user_question) are auto-allowed - they handle their own interaction
    if (toolName.startsWith("mcp__")) {
      return { behavior: 'allow', updatedInput: toolInput };
    }

    if (permissionSettings?.autoAcceptAll) {
      return { behavior: 'allow', updatedInput: toolInput };
    }

    if (sessionApprovedAll) {
      return { behavior: 'allow', updatedInput: toolInput };
    }

    if (!permissionSettings?.requireConfirmation?.includes(toolName)) {
      return { behavior: 'allow', updatedInput: toolInput };
    }

    const requestId = crypto.randomUUID();

    let inputPreview = "";
    if (toolName === "Write" || toolName === "Edit") {
      inputPreview = `File: ${(toolInput as any).file_path || "unknown"}`;
    } else if (toolName === "Bash") {
      inputPreview = `Command: ${((toolInput as any).command || "").slice(0, 100)}`;
    }

    send({
      type: "permission_request",
      requestId,
      toolName,
      toolInput,
      message: `Claude wants to use ${toolName}. ${inputPreview}`,
    });

    const result = await new Promise<{ approved: boolean; approveAll?: boolean }>((resolve) => {
      pendingPermissions.set(requestId, resolve);
    });

    if (result.approveAll) {
      sessionApprovedAll = true;
    }

    if (!result.approved) {
      return { behavior: 'deny', message: 'User denied permission', interrupt: false };
    }

    return { behavior: 'allow', updatedInput: toolInput };
  };

  try {
    console.error(`[Worker] Starting query with cwd: ${cwd}`);
    console.error(`[Worker] permissionSettings:`, permissionSettings);

    // Load skills from project and global directories, filtered by enabled slugs
    const skills = loadAllSkills(cwd, enabledSkillSlugs);
    console.error(`[Worker] Loaded ${skills.length} skills:`, skills.map(s => s.name));

    // Load all Navi Agents using the new unified loader
    const naviAgentsMap = await agentLoader.loadAllAgents(cwd);
    console.error(`[Worker] Loaded ${naviAgentsMap.size} Navi Agents:`, Array.from(naviAgentsMap.keys()));

    // Convert Navi Agents to SDK subagent format for Task tool spawning
    // Each Navi Agent can be spawned as a subagent, plus we collect their defined subagents
    const sdkSubagents: Record<string, any> = {};

    naviAgentsMap.forEach((naviAgent, id) => {
      // Add the Navi Agent itself as a spawnable subagent
      sdkSubagents[id] = {
        description: naviAgent.description,
        prompt: naviAgent.prompt,
        ...(naviAgent.model && { model: naviAgent.model }),
        ...(naviAgent.tools?.allowed && { tools: naviAgent.tools.allowed }),
      };

      // Also add any SDK subagents defined within this Navi Agent
      if (naviAgent.subagents) {
        for (const [subId, subagent] of Object.entries(naviAgent.subagents)) {
          // Prefix with parent agent id to avoid collisions
          const fullSubagentId = `${id}:${subId}`;
          sdkSubagents[fullSubagentId] = subagent;
        }
      }
    });

    console.error(`[Worker] Total SDK subagents available: ${Object.keys(sdkSubagents).length}`);

    // Build system prompt append with skills
    let systemPromptAppend = buildSystemPromptAppend(skills);

    // =========================================================================
    // AGENT RESOLUTION: Apply full agent configuration
    // =========================================================================
    let resolvedAgent: ResolvedAgent | null = null;
    let agentModel = model; // May be overridden by agent
    let agentTools: string[] | null = null; // May be overridden by agent
    let agentSkillsToLoad: string[] = []; // Additional skills from agent

    if (agentId) {
      const defaultModel = (model as "haiku" | "sonnet" | "opus") || "sonnet";
      resolvedAgent = await agentLoader.resolveAgent(agentId, cwd, defaultModel);

      if (resolvedAgent) {
        console.error(`[Worker] Resolved agent @${agentId}:`);
        console.error(`[Worker]   - Model: ${resolvedAgent.resolvedModel}`);
        console.error(`[Worker]   - Tools: ${resolvedAgent.resolvedAllowedTools.join(", ")}`);
        console.error(`[Worker]   - Skills: ${resolvedAgent.resolvedSkills.join(", ")}`);
        console.error(`[Worker]   - Source: ${resolvedAgent.source}`);

        // Apply agent's model preference (unless explicitly overridden by caller)
        if (!model && resolvedAgent.model) {
          agentModel = resolvedAgent.resolvedModel;
          console.error(`[Worker] Using agent's model preference: ${agentModel}`);
        }

        // Apply agent's tool restrictions
        if (resolvedAgent.tools?.allowed && resolvedAgent.tools.allowed.length > 0) {
          agentTools = resolvedAgent.resolvedAllowedTools;
          console.error(`[Worker] Using agent's tool restrictions: ${agentTools.length} tools`);
        }

        // Track agent's skills for loading
        agentSkillsToLoad = resolvedAgent.resolvedSkills;

        // Build agent system prompt section
        const agentPrompt = `<agent name="${agentId}" source="${resolvedAgent.source}">
${resolvedAgent.prompt}
</agent>

You are currently acting as the @${agentId} agent. Follow the instructions above for this agent's behavior and personality.

`;
        systemPromptAppend = agentPrompt + systemPromptAppend;
        console.error(`[Worker] Using agent: @${agentId}`);
      } else {
        console.error(`[Worker] Agent @${agentId} not found, proceeding without agent`);
      }
    }

    // Add multi-session context
    if (multiSession?.enabled) {
      if (multiSession.parentSessionId) {
        // Child session - full multi-session prompt
        const multiSessionContext = buildMultiSessionSystemPrompt(multiSession);
        systemPromptAppend = multiSessionContext + '\n\n' + systemPromptAppend;
        console.error(`[Worker] Multi-session child session. Depth: ${multiSession.depth}, Role: ${multiSession.role}`);
      } else {
        // Root orchestrator session - add spawning guidance
        const rootOrchestratorPrompt = `
## Multi-Agent Orchestration

You can spawn child agents to handle subtasks using the \`spawn_agent\` MCP tool. When you spawn agents:

1. **Parallel execution**: Agents work independently. Continue with your own work after spawning.
2. **CRITICAL**: After spawning agents, you MUST use \`check_spawned_agents\` to retrieve their results before responding to the user.
3. **Blocking option**: Set \`wait_for_completion: true\` to block until a single agent completes.
4. **Check results**: Use \`check_spawned_agents\` to see status and retrieve deliverables from all spawned agents.

Example workflow:
1. spawn_agent(role: "frontend", task: "Build login form")
2. spawn_agent(role: "backend", task: "Create auth API")
3. Continue doing your own work...
4. **check_spawned_agents()** → retrieves completed deliverables
5. Summarize results to user

NEVER tell the user "I'll let you know when they complete" without actually checking. Always use \`check_spawned_agents\` to get results.

## Context Negotiation (Evaluating Child Drafts)

When a child agent uses \`submit_draft\` instead of \`deliver\`, you enter a negotiation loop:

1. **Receive draft**: The child's work appears with status "pending_review"
2. **Evaluate critically**: You have semantic context the child lacks. Ask yourself:
   - Does this cover what I actually needed?
   - Are there gaps based on my original intent?
   - Did they miss any edge cases I care about?
3. **Request clarification**: Use \`request_clarification\` to ask follow-up questions
   - Be specific: "Did you consider X?" or "What about edge case Y?"
   - The child will respond with additional information
4. **Accept when satisfied**: Use \`accept_deliverable\` to finalize

**Why this matters**: Like a boss sending someone to a meeting - the summary won't include everything you need because they lack your context. The negotiation loop lets you extract the details that matter to YOU.

Example clarifying questions:
- "You mentioned 3 approaches - why did you recommend approach B over A?"
- "I don't see any mention of error handling - did you investigate that?"
- "The summary says 'minimal changes needed' - can you quantify that?"
`;
        systemPromptAppend = rootOrchestratorPrompt + '\n\n' + systemPromptAppend;
        console.error(`[Worker] Multi-session root orchestrator. Can spawn up to depth 3.`);
      }
    }

    console.error(`[Worker] System prompt append (${systemPromptAppend.length} chars)`);

    // Determine final tools list
    // Priority: 1. Explicit allowedTools param, 2. Agent's tools, 3. Default tools
    const defaultTools = [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "TodoWrite",
      "Task",
      "TaskOutput",
      // Note: ask_user_question is exposed via MCP server (mcp__user-interaction__ask_user_question)
      // Multi-session tools exposed via MCP server (mcp__multi-session__*)
    ];

    const allTools = allowedTools || agentTools || defaultTools;

    const requireConfirmation = permissionSettings?.requireConfirmation || [];
    const autoAllowedTools = allTools.filter(t => !requireConfirmation.includes(t));

    console.error(`[Worker] Final tools configuration:`);
    console.error(`[Worker]   - allTools (${allTools.length}):`, allTools);
    console.error(`[Worker]   - requireConfirmation:`, requireConfirmation);
    console.error(`[Worker]   - autoAllowedTools (${autoAllowedTools.length}):`, autoAllowedTools);

    // Helper to check if a built-in MCP server is enabled (uses mcpBuiltinSettings)
    const isBuiltinMcpEnabled = (name: string) => mcpBuiltinSettings?.[name] !== false;
    // Helper to check if an external MCP server is enabled (uses mcpSettings for external/agent servers)
    const isMcpEnabled = (name: string) => mcpSettings?.[name] !== false;

    // Build MCP servers - include built-in servers if enabled
    const mcpServers: Record<string, any> = {};

    if (isBuiltinMcpEnabled("user-interaction")) {
      mcpServers["user-interaction"] = userInteractionServer;
      console.error(`[Worker] MCP server enabled: user-interaction`);
    } else {
      console.error(`[Worker] MCP server disabled: user-interaction`);
    }

    if (isBuiltinMcpEnabled("navi-context")) {
      mcpServers["navi-context"] = naviContextServer;
      console.error(`[Worker] MCP server enabled: navi-context (view_processes, view_terminal)`);
    } else {
      console.error(`[Worker] MCP server disabled: navi-context`);
    }

    // Add external MCP servers from .mcp.json files (already filtered to enabled only)
    if (externalMcpServers && Object.keys(externalMcpServers).length > 0) {
      for (const [name, config] of Object.entries(externalMcpServers)) {
        // Don't override built-in servers
        if (!mcpServers[name]) {
          mcpServers[name] = config;
          console.error(`[Worker] Added external MCP server: ${name} (type: ${config.type || "stdio"})`);
        }
      }
    }

    // Add agent's MCP servers if defined and enabled
    if (resolvedAgent?.mcpServers) {
      for (const [name, config] of Object.entries(resolvedAgent.mcpServers)) {
        if (isMcpEnabled(name) && !mcpServers[name]) {
          mcpServers[name] = config;
          console.error(`[Worker] Added agent MCP server: ${name}`);
        } else if (mcpServers[name]) {
          console.error(`[Worker] Agent MCP server ${name} skipped (already loaded from external)`);
        } else {
          console.error(`[Worker] Agent MCP server disabled: ${name}`);
        }
      }
    }

    // Add integration MCPs (from configured integrations with credentials)
    // Uses project-scoped credentials if available, falls back to user-level
    try {
      const { getAvailableIntegrationMCPs } = await import("./services/integration-mcp");
      const { sessions } = await import("./db");

      // Get project ID from session for project-scoped credentials
      let projectId: string | undefined;
      if (sessionId) {
        const session = sessions.get(sessionId);
        projectId = session?.project_id;
      }

      const credentialScope = projectId ? { projectId } : undefined;
      const integrationMCPs = getAvailableIntegrationMCPs(credentialScope);

      for (const [name, config] of Object.entries(integrationMCPs)) {
        if (isMcpEnabled(name) && !mcpServers[name]) {
          mcpServers[name] = config;
          console.error(`[Worker] Added integration MCP server: ${name}${projectId ? ` (project: ${projectId})` : ""}`);
        }
      }
    } catch (e) {
      console.error(`[Worker] Failed to load integration MCPs:`, e);
    }

    // Add composable integration MCP servers (new system - defineIntegration)
    // These are built-in integrations using Navi's OAuth
    try {
      // Import to trigger registration, then get connected servers
      await import("./integrations/providers");
      const { getIntegrationMcpServers } = await import("./integrations/providers");
      const integrationServers = getIntegrationMcpServers();

      for (const [name, server] of Object.entries(integrationServers)) {
        if (isMcpEnabled(name) && !mcpServers[name]) {
          mcpServers[name] = server;
          console.error(`[Worker] Added composable integration: ${name}`);
        }
      }
    } catch (e) {
      console.error(`[Worker] Failed to load composable integrations:`, e);
    }

    // Enable multi-session tools if enabled (for all sessions that can spawn or are children)
    if (multiSession?.enabled && isBuiltinMcpEnabled("multi-session")) {
      mcpServers["multi-session"] = multiSessionServer;
      console.error(`[Worker] MCP server enabled: multi-session`);
    } else if (multiSession?.enabled) {
      console.error(`[Worker] MCP server disabled: multi-session (multi-session context is enabled but server is disabled)`);
    }

    // Determine final model
    const finalModel = agentModel || model;
    console.error(`[Worker] Final model: ${finalModel || "default"}`);

    const q = query({
      prompt,
      options: {
        cwd,
        resume,
        model: finalModel,
        tools: allTools,
        allowedTools: permissionSettings?.autoAcceptAll ? allTools : autoAllowedTools,
        env: claudeEnv,
        ...runtimeOptions,
        permissionMode: "default",
        canUseTool,
        settingSources: ['user', 'project', 'local'] as const,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPromptAppend },
        includePartialMessages: true,
        mcpServers,
        // Pass SDK subagents (for Task tool spawning)
        // This includes: all Navi Agents + their defined subagents
        ...(Object.keys(sdkSubagents).length > 0 && { agents: sdkSubagents }),
      },
    });

    let lastAssistantContent: any[] = [];
    let lastAssistantUsage: any = null;
    let resultData: any = null;

    for await (const msg of q) {
      console.error(`[Worker] MSG type: ${msg.type}`, msg.type === "stream_event" ? (msg as any).event?.type : "");
      
      const formatted = formatMessage(msg, sessionId);
      send({ type: "message", data: formatted });

      if (msg.type === "system" && (msg as any).subtype === "init") {
        const initMsg = msg as any;
        console.error(`[Worker] SDK init received:`);
        console.error(`[Worker]   apiKeySource: ${initMsg.apiKeySource || "not reported"}`);
        console.error(`[Worker]   model: ${initMsg.model}`);
        console.error(`[Worker]   tools: ${initMsg.tools?.length || 0}`);
        console.error(`[Worker]   skills: ${initMsg.skills?.join(", ") || "none"}`);
      }

      if (msg.type === "assistant") {
        lastAssistantContent = msg.message.content;
        console.error(`[Worker] Assistant content:`, JSON.stringify(lastAssistantContent, null, 2));
        const usage = (msg as any).message?.usage;
        if (!msg.parent_tool_use_id && usage) {
          lastAssistantUsage = usage;
        }
      }
      if (msg.type === "result") {
        resultData = msg;
        console.error(`[Worker] Result:`, JSON.stringify(resultData, null, 2));
      }
    }

    send({
      type: "complete",
      sessionId,
      lastAssistantContent,
      lastAssistantUsage,
      resultData: resultData ? {
        session_id: resultData.session_id,
        model: resultData.model,
        total_cost_usd: resultData.total_cost_usd,
        num_turns: resultData.num_turns,
        usage: resultData.usage,
      } : null,
    });

  } catch (error) {
    send({
      type: "error",
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === "permission_response" && msg.requestId) {
      const resolve = pendingPermissions.get(msg.requestId);
      if (resolve) {
        resolve({ approved: msg.approved, approveAll: msg.approveAll });
        pendingPermissions.delete(msg.requestId);
      }
    } else if (msg.type === "question_response" && msg.requestId) {
      const resolve = pendingQuestions.get(msg.requestId);
      if (resolve) {
        resolve({ answers: msg.answers });
        pendingQuestions.delete(msg.requestId);
      }
    }
    // Multi-session response handlers
    else if (msg.type === "multi_session_spawn_response" && msg.requestId) {
      const resolve = pendingSpawnRequests.get(msg.requestId);
      if (resolve) {
        resolve({ success: msg.success, childSessionId: msg.childSessionId, error: msg.error });
        pendingSpawnRequests.delete(msg.requestId);
      }
    } else if (msg.type === "multi_session_context_response" && msg.requestId) {
      const resolve = pendingContextRequests.get(msg.requestId);
      if (resolve) {
        resolve({ content: msg.content, metadata: msg.metadata });
        pendingContextRequests.delete(msg.requestId);
      }
    } else if (msg.type === "multi_session_escalation_response" && msg.requestId) {
      const resolve = pendingEscalationRequests.get(msg.requestId);
      if (resolve) {
        resolve({ action: msg.action, content: msg.content });
        pendingEscalationRequests.delete(msg.requestId);
      }
    } else if (msg.type === "multi_session_deliver_response" && msg.requestId) {
      const resolve = pendingDeliverRequests.get(msg.requestId);
      if (resolve) {
        resolve({ success: msg.success });
        pendingDeliverRequests.delete(msg.requestId);
      }
    } else if (msg.type === "multi_session_decision_response" && msg.requestId) {
      const resolve = pendingDecisionRequests.get(msg.requestId);
      if (resolve) {
        resolve({ success: msg.success, decisionId: msg.decisionId });
        pendingDecisionRequests.delete(msg.requestId);
      }
    }
    // Wait/pause skip response
    else if (msg.type === "session_wait_skip" && msg.requestId) {
      const resolve = pendingWaitRequests.get(msg.requestId);
      if (resolve) {
        resolve({ skipped: true });
        pendingWaitRequests.delete(msg.requestId);
      }
    }
    // Child deliverable injection (when a child completes)
    else if (msg.type === "child_deliverable") {
      // Queue the deliverable for injection
      console.error(`[Worker] Received child deliverable from ${msg.childRole}: ${msg.deliverable?.summary || "no summary"}`);
      pendingChildDeliverables.push({
        childSessionId: msg.childSessionId,
        childRole: msg.childRole,
        deliverable: msg.deliverable,
        receivedAt: Date.now(),
      });
    }
  } catch {}
});

const input: WorkerInput = JSON.parse(process.argv[2] || "{}");

if (input.prompt) {
  runQuery(input);
} else {
  console.error("No input provided");
  process.exit(1);
}
