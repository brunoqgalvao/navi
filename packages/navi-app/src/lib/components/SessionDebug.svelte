<script lang="ts">
  import { sessionDebugInfo, sessionMessages, advancedMode, type ChatMessage, type SessionDebugInfo } from "../stores";

  interface Props {
    open: boolean;
    onClose: () => void;
    sessionId: string | null;
    claudeMdContent: string | null;
    projectPath: string | null;
  }

  let { open, onClose, sessionId, claudeMdContent, projectPath }: Props = $props();
  
  let activeTab = $state<'overview' | 'system-prompt' | 'messages'>('overview');

  interface SkillData {
    name: string;
    description: string;
    content: string;
    path: string;
  }

  let skillContents = $state<Map<string, SkillData>>(new Map());
  let loadingSkills = $state(false);
  let injectedPrompt = $state<string>("");
  
  const UI_INSTRUCTIONS = `<ui-instructions>
## Preview Feature

This UI has a built-in preview panel that can display:
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
</ui-instructions>`;

  const debug = $derived(sessionId ? $sessionDebugInfo.get(sessionId) : null);
  const currentMessages = $derived(sessionId ? ($sessionMessages.get(sessionId) || []) : []);

  function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return {};
    
    const result: { name?: string; description?: string } = {};
    for (const line of frontmatterMatch[1].split('\n')) {
      const nameMatch = line.match(/^name:\s*(.+)$/);
      if (nameMatch) result.name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
      const descMatch = line.match(/^description:\s*(.+)$/);
      if (descMatch) result.description = descMatch[1].trim().replace(/^["']|["']$/g, '');
    }
    return result;
  }

  function buildInjectedPrompt(skills: Map<string, SkillData>): string {
    if (skills.size === 0) return '';
    
    let prompt = `
<skills>
You have access to the following skills. When a user's request matches a skill's purpose, you MUST read the skill's SKILL.md file to get detailed instructions before proceeding.

<available_skills>
`;
    
    for (const [, skill] of skills) {
      prompt += `<skill name="${skill.name}" path="${skill.path}/SKILL.md">
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

  function buildAssembledSystemPrompt(): string {
    let prompt = `# Assembled System Prompt

## 1. Claude Code Base Prompt (preset: 'claude_code')
[Built-in Claude Code system prompt with tool descriptions, behavioral guidelines, etc.]
~15,000 tokens - not shown here

## 2. UI Instructions (always appended)
\`\`\`
${UI_INSTRUCTIONS}
\`\`\`

## 3. CLAUDE.md Files (via settingSources: ['user', 'project', 'local'])
`;
    
    if (claudeMdContent) {
      prompt += `\n### Project CLAUDE.md:\n\`\`\`\n${claudeMdContent}\n\`\`\`\n`;
    } else {
      prompt += `\n[No CLAUDE.md found]\n`;
    }
    
    prompt += `\n## 4. Skills Metadata (appended via systemPrompt.append)\n`;
    
    if (injectedPrompt) {
      prompt += `\`\`\`\n${injectedPrompt}\n\`\`\``;
    } else {
      prompt += `[No skills loaded]`;
    }
    
    return prompt;
  }

  async function loadSkillContents() {
    if (!debug?.skills?.length) return;
    
    loadingSkills = true;
    const newContents = new Map<string, SkillData>();
    
    const homedir = await fetch('http://localhost:3001/api/fs/homedir').then(r => r.json()).catch(() => ({ path: '' }));
    
    for (const skillName of debug.skills) {
      try {
        const projectSkillPath = projectPath ? `${projectPath}/.claude/skills/${skillName}/SKILL.md` : null;
        const globalSkillPath = homedir.path ? `${homedir.path}/.claude/skills/${skillName}/SKILL.md` : null;

        let content = '';
        let usedPath = '';

        if (projectSkillPath) {
          const res = await fetch(`http://localhost:3001/api/fs/read?path=${encodeURIComponent(projectSkillPath)}`);
          if (res.ok) {
            const data = await res.json();
            content = data.content;
            usedPath = projectSkillPath;
          }
        }
        
        if (!content && globalSkillPath) {
          const res = await fetch(`http://localhost:3001/api/fs/read?path=${encodeURIComponent(globalSkillPath)}`);
          if (res.ok) {
            const data = await res.json();
            content = data.content;
            usedPath = globalSkillPath;
          }
        }
        
        if (content) {
          const parsed = parseSkillFrontmatter(content);
          newContents.set(skillName, {
            name: parsed.name || skillName,
            description: parsed.description || '',
            content,
            path: usedPath,
          });
        }
      } catch (e) {
        console.error(`Failed to load skill ${skillName}:`, e);
      }
    }
    
    skillContents = newContents;
    injectedPrompt = buildInjectedPrompt(newContents);
    loadingSkills = false;
  }

  $effect(() => {
    if (open && debug?.skills?.length) {
      loadSkillContents();
    }
  });

  function copyMessages() {
    navigator.clipboard.writeText(JSON.stringify(currentMessages.map(m => ({ 
      role: m.role, 
      content: m.content, 
      parentToolUseId: m.parentToolUseId 
    })), null, 2));
  }
</script>

{#if open}
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm" 
    onclick={onClose} 
    role="dialog" 
    aria-modal="true" 
    tabindex="-1"
  >
    <div 
      class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col" 
      onclick={(e) => e.stopPropagation()}
    >
      <div class="px-6 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <h3 class="font-semibold text-sm text-gray-900">Session Debug</h3>
          {#if debug}
            <span class="text-xs text-gray-500">cwd: {debug.cwd} | model: {debug.model}</span>
          {/if}
        </div>
        <button onclick={onClose} class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
        
        <!-- SDK Info -->
        {#if debug}
        <div class="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded">
          <div>
            <span class="font-bold text-gray-700">Working Directory</span>
            <pre class="mt-1">{debug.cwd || "N/A"}</pre>
          </div>
          <div>
            <span class="font-bold text-gray-700">Model</span>
            <pre class="mt-1">{debug.model || "N/A"}</pre>
          </div>
          <div>
            <span class="font-bold text-gray-700">Tools ({debug.tools?.length || 0})</span>
            <pre class="mt-1">{(debug.tools || []).join(', ')}</pre>
          </div>
          <div>
            <span class="font-bold text-gray-700">Skills ({debug.skills?.length || 0})</span>
            <pre class="mt-1">{(debug.skills || []).join(', ') || 'none'}</pre>
          </div>
        </div>
        {/if}

        <!-- UI Instructions -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-gray-700">UI Instructions (always appended)</span>
            <button onclick={() => navigator.clipboard.writeText(UI_INSTRUCTIONS)} class="text-blue-600 hover:underline">copy</button>
          </div>
          <pre class="bg-blue-50 p-3 rounded overflow-x-auto max-h-40 whitespace-pre-wrap">{UI_INSTRUCTIONS}</pre>
        </div>

        <!-- CLAUDE.md -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-gray-700">CLAUDE.md</span>
            {#if claudeMdContent}
              <button onclick={() => navigator.clipboard.writeText(claudeMdContent || '')} class="text-blue-600 hover:underline">copy</button>
            {/if}
          </div>
          <pre class="bg-gray-100 p-3 rounded overflow-x-auto max-h-40 whitespace-pre-wrap">{claudeMdContent || '[not found]'}</pre>
        </div>

        <!-- Skills Injection -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-gray-700">Skills Injection (appended to system prompt)</span>
            {#if injectedPrompt}
              <button onclick={() => navigator.clipboard.writeText(injectedPrompt)} class="text-blue-600 hover:underline">copy</button>
            {/if}
          </div>
          <pre class="bg-amber-50 p-3 rounded overflow-x-auto max-h-60 whitespace-pre-wrap">{injectedPrompt || '[no skills loaded]'}</pre>
        </div>

        <!-- Full Skill Contents -->
        {#if skillContents.size > 0}
        <div>
          <span class="font-bold text-gray-700">Full Skill Contents (Level 2 - read on demand)</span>
          <div class="mt-1 space-y-2">
            {#each Array.from(skillContents.entries()) as [name, skill]}
              <details class="bg-gray-50 rounded">
                <summary class="p-2 cursor-pointer hover:bg-gray-100">{skill.name} - {skill.path}</summary>
                <pre class="p-3 bg-white border-t whitespace-pre-wrap max-h-48 overflow-y-auto">{skill.content}</pre>
              </details>
            {/each}
          </div>
        </div>
        {/if}

        <!-- Chat History -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-gray-700">Chat History ({currentMessages.length} messages)</span>
            <button onclick={copyMessages} class="text-blue-600 hover:underline">copy json</button>
          </div>
          {#if currentMessages.length > 0}
            <div class="space-y-2 max-h-[400px] overflow-y-auto">
              {#each currentMessages as msg, i}
                <div class="bg-gray-50 rounded p-2">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-gray-400">#{i + 1}</span>
                    <span class={msg.role === 'user' ? 'text-blue-600 font-bold' : msg.role === 'assistant' ? 'text-green-600 font-bold' : 'text-gray-600 font-bold'}>
                      {msg.role.toUpperCase()}
                    </span>
                    {#if msg.parentToolUseId}
                      <span class="text-gray-400">parent: {msg.parentToolUseId}</span>
                    {/if}
                  </div>
                  <pre class="whitespace-pre-wrap break-all">{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}</pre>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-gray-500 italic">No messages yet</p>
          {/if}
        </div>

      </div>
    </div>
  </div>
{/if}
