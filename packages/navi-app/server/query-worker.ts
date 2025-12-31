import { query, createSdkMcpServer, tool, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { buildClaudeCodeEnv, getClaudeCodeRuntimeOptions, getNaviAuthOverridesFromEnv } from "./utils/claude-code";

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

function loadAllSkills(cwd: string): SkillInfo[] {
  const projectSkillsDir = path.join(cwd, '.claude', 'skills');
  const globalSkillsDir = path.join(os.homedir(), '.claude', 'skills');

  const projectSkills = loadSkillsFromDir(projectSkillsDir);
  const globalSkills = loadSkillsFromDir(globalSkillsDir);

  const allSkills = [...projectSkills];
  for (const gs of globalSkills) {
    if (!allSkills.find(s => s.name === gs.name)) {
      allSkills.push(gs);
    }
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

interface WorkerInput {
  prompt: string;
  cwd: string;
  resume?: string;
  model?: string;
  allowedTools?: string[];
  sessionId?: string;
  permissionSettings?: {
    autoAcceptAll: boolean;
    requireConfirmation: string[];
  };
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
  const { prompt, cwd, resume, model, allowedTools, sessionId, permissionSettings } = input;

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
    
    const skills = loadAllSkills(cwd);
    console.error(`[Worker] Loaded ${skills.length} skills:`, skills.map(s => s.name));

    const agents = loadAllAgents(cwd);

    const systemPromptAppend = buildSystemPromptAppend(skills);
    console.error(`[Worker] System prompt append (${systemPromptAppend.length} chars)`);
    
    const allTools = allowedTools || [
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
    ];
    
    const requireConfirmation = permissionSettings?.requireConfirmation || [];
    const autoAllowedTools = allTools.filter(t => !requireConfirmation.includes(t));
    
    console.error(`[Worker] allTools:`, allTools);
    console.error(`[Worker] requireConfirmation:`, requireConfirmation);
    console.error(`[Worker] autoAllowedTools:`, autoAllowedTools);
    
    const q = query({
      prompt,
      options: {
        cwd,
        resume,
        model,
        tools: allTools,
        allowedTools: permissionSettings?.autoAcceptAll ? allTools : autoAllowedTools,
        env: claudeEnv,
        ...runtimeOptions,
        permissionMode: "default",
        canUseTool,
        settingSources: ['user', 'project', 'local'] as const,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPromptAppend },
        includePartialMessages: true,
        // MCP server for user interaction (ask_user_question tool)
        mcpServers: {
          "user-interaction": userInteractionServer,
        },
        // Pass custom agents from .claude/agents/
        ...(Object.keys(agents).length > 0 && { agents }),
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
  } catch {}
});

const input: WorkerInput = JSON.parse(process.argv[2] || "{}");

if (input.prompt) {
  runQuery(input);
} else {
  console.error("No input provided");
  process.exit(1);
}
