import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

function send(msg: any) {
  console.log(JSON.stringify(msg));
}

function formatMessage(msg: SDKMessage, uiSessionId?: string): any {
  switch (msg.type) {
    case "system":
      return {
        type: "system",
        uiSessionId,
        claudeSessionId: msg.session_id,
        subtype: msg.subtype,
        ...(msg.subtype === "init" && {
          cwd: (msg as any).cwd,
          model: (msg as any).model,
          tools: (msg as any).tools,
          skills: (msg as any).skills,
        }),
      };

    case "assistant":
      return {
        type: "assistant",
        uiSessionId,
        claudeSessionId: msg.session_id,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
      };

    case "user":
      return {
        type: "user",
        uiSessionId,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
      };

    case "result":
      return {
        type: "result",
        uiSessionId,
        claudeSessionId: msg.session_id,
        costUsd: msg.total_cost_usd,
        durationMs: msg.duration_ms,
        numTurns: msg.num_turns,
        usage: msg.usage,
      };

    case "tool_progress":
      return {
        type: "tool_progress",
        uiSessionId,
        toolUseId: msg.tool_use_id,
        toolName: msg.tool_name,
        parentToolUseId: msg.parent_tool_use_id || null,
        elapsedTimeSeconds: msg.elapsed_time_seconds,
      };

    default:
      return { type: "unknown", uiSessionId, raw: msg };
  }
}

let sessionApprovedAll = false;

async function runQuery(input: WorkerInput) {
  const { prompt, cwd, resume, model, allowedTools, sessionId, permissionSettings } = input;
  
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  console.error(`[Worker] Auth method: ${hasApiKey ? "API_KEY" : "OAuth"}`);
  if (hasApiKey) {
    console.error(`[Worker] API Key prefix: ${process.env.ANTHROPIC_API_KEY?.slice(0, 10)}...`);
  }

  const canUseTool = async (
    toolName: string,
    toolInput: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string }
  ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> } | { behavior: 'deny'; message: string; interrupt?: boolean }> => {
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
        permissionMode: "default",
        canUseTool,
        settingSources: ['user', 'project', 'local'] as const,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPromptAppend },
      },
    });

    let lastAssistantContent: any[] = [];
    let resultData: any = null;

    for await (const msg of q) {
      const formatted = formatMessage(msg, sessionId);
      send({ type: "message", data: formatted });

      if (msg.type === "system" && (msg as any).subtype === "init") {
        console.error(`[Worker] Skills loaded:`, (msg as any).skills);
      }

      if (msg.type === "assistant") {
        lastAssistantContent = msg.message.content;
      }
      if (msg.type === "result") {
        resultData = msg;
      }
    }

    send({
      type: "complete",
      sessionId,
      lastAssistantContent,
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
