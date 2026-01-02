# First Steps: Agent Identity

> Get @mentions working. Make agents feel real.

## What We're Building

```
Before: You talk to "Claude"
After:  You talk to @coder, @git, @researcher...
```

Same Claude underneath (for now), but:
- Clear identity per agent
- Scoped expectations
- Foundation for everything else

---

## Step 1: @mention Parser

### Location
`packages/navi-app/src/lib/utils/mentionParser.ts`

### Code

```typescript
export interface ParsedMention {
  agentName: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedMessage {
  text: string;
  mentions: ParsedMention[];
  primaryAgent: string | null; // First mentioned agent
}

const AGENT_PATTERN = /@(\w+)/g;

export function parseMentions(input: string): ParsedMessage {
  const mentions: ParsedMention[] = [];
  let match;

  while ((match = AGENT_PATTERN.exec(input)) !== null) {
    mentions.push({
      agentName: match[1].toLowerCase(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return {
    text: input,
    mentions,
    primaryAgent: mentions[0]?.agentName ?? null,
  };
}

export function removeMentions(input: string): string {
  return input.replace(AGENT_PATTERN, '').trim();
}
```

---

## Step 2: Agent Registry Store

### Location
`packages/navi-app/src/lib/stores/agents.ts`

### Code

```typescript
import { writable, derived } from 'svelte/store';

export interface Agent {
  id: string;
  name: string;           // "coder"
  displayName: string;    // "Coder"
  avatar: string;         // "🤖" or URL
  description: string;
  color: string;          // For UI accent
  systemPrompt?: string;  // Additional context for this agent
  status: 'idle' | 'working' | 'waiting';
}

// Default agents
const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'claude',
    name: 'claude',
    displayName: 'Claude',
    avatar: '🧠',
    description: 'General assistant',
    color: '#8B5CF6',
    status: 'idle',
  },
  {
    id: 'coder',
    name: 'coder',
    displayName: 'Coder',
    avatar: '👨‍💻',
    description: 'Code-focused assistant. Uses tools aggressively.',
    color: '#10B981',
    systemPrompt: `You are a coding specialist. Be concise. Write code first, explain after.
Prefer editing existing files over creating new ones.
Run tests after making changes.
Use git branches for significant changes.`,
    status: 'idle',
  },
  {
    id: 'git',
    name: 'git',
    displayName: 'Git',
    avatar: '📦',
    description: 'Version control specialist',
    color: '#F59E0B',
    systemPrompt: `You are a git specialist. Help with commits, branches, merges.
Always check status before operations.
Write clear commit messages.
Suggest branch names that follow conventions.`,
    status: 'idle',
  },
  {
    id: 'researcher',
    name: 'researcher',
    displayName: 'Researcher',
    avatar: '🔍',
    description: 'Research and analysis. Reads more, writes less.',
    color: '#3B82F6',
    systemPrompt: `You are a research specialist. Gather information before acting.
Search the codebase thoroughly.
Summarize findings clearly.
Don't make changes unless explicitly asked.`,
    status: 'idle',
  },
];

function createAgentStore() {
  const { subscribe, set, update } = writable<Agent[]>(DEFAULT_AGENTS);

  return {
    subscribe,

    getAgent: (name: string): Agent | undefined => {
      let found: Agent | undefined;
      subscribe(agents => {
        found = agents.find(a => a.name === name);
      })();
      return found;
    },

    setStatus: (name: string, status: Agent['status']) => {
      update(agents =>
        agents.map(a => a.name === name ? { ...a, status } : a)
      );
    },

    addAgent: (agent: Agent) => {
      update(agents => [...agents, agent]);
    },

    updateAgent: (name: string, updates: Partial<Agent>) => {
      update(agents =>
        agents.map(a => a.name === name ? { ...a, ...updates } : a)
      );
    },

    reset: () => set(DEFAULT_AGENTS),
  };
}

export const agents = createAgentStore();

// Derived store for agent names (for autocomplete)
export const agentNames = derived(agents, $agents =>
  $agents.map(a => a.name)
);
```

---

## Step 3: Chat Input with @mention Support

### Location
Modify `packages/navi-app/src/lib/components/ChatInput.svelte`

### Changes Needed

1. **Detect @mentions as user types**
2. **Show autocomplete dropdown**
3. **Highlight mentions in input**
4. **Pass agent info to send handler**

### Autocomplete Component

```svelte
<!-- AgentAutocomplete.svelte -->
<script lang="ts">
  import { agents } from '$lib/stores/agents';

  export let filter: string = '';
  export let onSelect: (agentName: string) => void;
  export let visible: boolean = false;

  $: filteredAgents = $agents.filter(a =>
    a.name.startsWith(filter.toLowerCase())
  );
</script>

{#if visible && filteredAgents.length > 0}
  <div class="absolute bottom-full mb-2 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700 overflow-hidden">
    {#each filteredAgents as agent}
      <button
        class="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-700 text-left"
        on:click={() => onSelect(agent.name)}
      >
        <span class="text-lg">{agent.avatar}</span>
        <div>
          <div class="font-medium text-white">@{agent.name}</div>
          <div class="text-xs text-zinc-400">{agent.description}</div>
        </div>
      </button>
    {/each}
  </div>
{/if}
```

---

## Step 4: Agent-Aware Message Display

### Location
Modify message rendering components

### Changes Needed

Show which agent responded:

```svelte
<!-- In message component -->
{#if message.agentName && message.agentName !== 'claude'}
  <div class="flex items-center gap-2 mb-1">
    <span class="text-lg">{getAgentAvatar(message.agentName)}</span>
    <span class="text-sm font-medium" style="color: {getAgentColor(message.agentName)}">
      @{message.agentName}
    </span>
  </div>
{/if}
```

---

## Step 5: Backend Agent Routing

### Location
`packages/navi-app/server/routes/chat.ts`

### Changes Needed

1. **Accept agent name in request**
2. **Inject agent's system prompt**
3. **Track which agent is responding**

```typescript
// In chat handler
const agentSystemPrompt = getAgentSystemPrompt(request.agentName);
const fullSystemPrompt = agentSystemPrompt
  ? `${baseSystemPrompt}\n\n${agentSystemPrompt}`
  : baseSystemPrompt;
```

---

## Step 6: Database Schema Update

### New columns for messages table

```sql
ALTER TABLE messages ADD COLUMN agent_name TEXT DEFAULT 'claude';
```

---

## Implementation Order

```
Day 1:
├── [ ] Create mentionParser.ts
├── [ ] Create agents.ts store
└── [ ] Write tests for parser

Day 2:
├── [ ] Add autocomplete to ChatInput
├── [ ] Highlight @mentions in input
└── [ ] Pass agent to send handler

Day 3:
├── [ ] Backend: accept agent name
├── [ ] Backend: inject system prompt
├── [ ] Database: add agent_name column

Day 4:
├── [ ] Update message display
├── [ ] Agent status indicators
└── [ ] Polish & test
```

---

## Testing Checklist

- [ ] Type `@` shows autocomplete
- [ ] Selecting agent inserts `@name `
- [ ] Multiple mentions work
- [ ] `@coder` gives code-focused responses
- [ ] `@researcher` searches before acting
- [ ] `@git` specializes in version control
- [ ] Agent name shows in response
- [ ] Agent avatar/color visible
- [ ] Works with existing features

---

## What This Enables

Once @mentions work:
- Phase 2 (branching) can use agent name for branch: `agent/coder/task`
- Phase 3 (timeline) can filter by agent
- Phase 4 (memory) can store per-agent memories
- Users start thinking in "agents" not "chat"

---

## Files to Create

```
packages/navi-app/src/lib/
├── utils/
│   └── mentionParser.ts        # NEW
├── stores/
│   └── agents.ts               # NEW
├── components/
│   └── AgentAutocomplete.svelte # NEW
```

## Files to Modify

```
packages/navi-app/src/lib/
├── components/
│   └── ChatInput.svelte        # Add @mention support
├── server/
│   └── routes/chat.ts          # Agent routing
```

---

## Ready?

Start with `mentionParser.ts` - it's pure logic, easy to test, zero dependencies.

```bash
# Create the file
touch packages/navi-app/src/lib/utils/mentionParser.ts
```

Want me to implement Step 1?
