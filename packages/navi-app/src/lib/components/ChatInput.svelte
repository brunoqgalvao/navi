<script lang="ts">
  import { attachedFiles, textReferences, terminalReferences, chatReferences, type AttachedFile, type TerminalReference, type ChatReference, type ExecutionMode, type BackendId, planMode } from "../stores";
  import { agents, type Agent } from "../stores/agents";
  import FileAttachment from "./FileAttachment.svelte";
  import ReferenceChip from "./ReferenceChip.svelte";
  import TerminalReferenceChip from "./TerminalReferenceChip.svelte";
  import ChatReferenceChip from "./ChatReferenceChip.svelte";
  import AudioRecorder from "./AudioRecorder.svelte";
  import CloudExecutionToggle from "./CloudExecutionToggle.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { getApiBase } from "../config";

  interface FileEntry {
    name: string;
    path: string;
    type: "file" | "directory";
  }

  interface TerminalEntry {
    terminalId: string;
    name: string;
    pid?: number;
    cwd?: string;
  }

  interface ChatEntry {
    id: string;
    title: string;
    messageCount: number;
    projectName: string | null;
    updatedAt: number;
  }

  interface Skill {
    name: string;
    path: string;
  }

  interface McpServer {
    name: string;
    enabled: boolean;
    toolCount?: number;
    isBuiltIn?: boolean;
  }

  interface SlashCommand {
    name: string;
    description: string;
    argsHint?: string;
    isBuiltIn?: boolean;
  }

  interface Props {
    value: string;
    disabled?: boolean;
    loading?: boolean;
    queuedCount?: number;
    projectPath?: string;
    activeSkills?: Skill[];
    mcpServers?: McpServer[];
    sessionId?: string;
    untilDoneEnabled?: boolean;
    // Worktree mode - for new chats
    isGitRepo?: boolean;
    isNewChat?: boolean;
    // Worktree mode - for existing sessions with worktree
    worktreeBranch?: string | null;
    worktreeBaseBranch?: string | null;
    // Cloud execution mode
    executionMode?: ExecutionMode;
    cloudBranch?: string;
    cloudBranches?: string[];
    onSubmit: () => void;
    onStop?: () => void;
    onPreview?: (path: string) => void;
    onExecCommand?: (command: string) => void;
    onManageSkills?: () => void;
    onManageMcp?: () => void;
    onNavigateToChat?: (sessionId: string) => void;
    onToggleUntilDone?: () => void;
    onCreateWithWorktree?: (description: string, message: string) => void;
    onMergeWorktree?: () => void;
    onArchiveSession?: () => void;
    onExecutionModeChange?: (mode: ExecutionMode) => void;
    onCloudBranchChange?: (branch: string) => void;
    // Backend selection (claude, codex, gemini)
    backend?: BackendId;
    onBackendChange?: (backend: BackendId) => void;
    // Slash commands from SDK
    slashCommands?: SlashCommand[];
    // UI-only command handlers
    onUICommand?: (command: string, args?: string) => boolean; // Return true if handled
  }

  let { value = $bindable(), disabled = false, loading = false, queuedCount = 0, projectPath, activeSkills = [], mcpServers = [], sessionId, untilDoneEnabled = false, isGitRepo = false, isNewChat = false, worktreeBranch = null, worktreeBaseBranch = null, executionMode = "local", cloudBranch = "main", cloudBranches = [], backend = "claude", onSubmit, onStop, onPreview, onExecCommand, onManageSkills, onManageMcp, onNavigateToChat, onToggleUntilDone, onCreateWithWorktree, onMergeWorktree, onArchiveSession, onExecutionModeChange, onCloudBranchChange, onBackendChange, slashCommands = [], onUICommand }: Props = $props();

  // Worktree mode state
  let worktreeEnabled = $state(false);
  let worktreeDescription = $state("");
  let showWorktreeMenu = $state(false);

  // Backend selector state (for new chats)
  let showBackendMenu = $state(false);
  const backendMeta: Record<BackendId, { icon: string; color: string; label: string; bgColor: string }> = {
    claude: { icon: "C", color: "text-orange-600 dark:text-orange-400", label: "Claude", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
    codex: { icon: "X", color: "text-green-600 dark:text-green-400", label: "Codex", bgColor: "bg-green-100 dark:bg-green-900/30" },
    gemini: { icon: "G", color: "text-blue-600 dark:text-blue-400", label: "Gemini", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
  };

  function handleToggle() {
    worktreeEnabled = !worktreeEnabled;
  }

  let showSkillsMenu = $state(false);
  let showMcpMenu = $state(false);

  // Compute enabled MCP servers count (exclude built-in/native MCPs)
  let enabledMcpCount = $derived(mcpServers.filter(s => s.enabled && !s.isBuiltIn).length);
  // Total non-built-in MCP servers
  let totalMcpCount = $derived(mcpServers.filter(s => !s.isBuiltIn).length);

  // Check if the input is a ! command
  function isShellCommand(text: string): boolean {
    return text.trim().startsWith("!");
  }

  // Check if the input is a UI-only slash command
  function isUIOnlyCommand(text: string): { isUI: boolean; command?: string; args?: string } {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) return { isUI: false };

    const match = trimmed.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (!match) return { isUI: false };

    const [, command, args] = match;
    if (UI_ONLY_COMMANDS.has(command)) {
      return { isUI: true, command, args };
    }
    return { isUI: false };
  }

  // UI-only commands that should NOT be sent to the SDK (defined here for use in handleSubmit)
  const UI_ONLY_COMMANDS = new Set(["help", "config", "bug", "status"]);

  function handleSubmit() {
    const trimmedValue = value.trim();

    // Check for UI-only slash commands first
    const uiCommand = isUIOnlyCommand(trimmedValue);
    if (uiCommand.isUI && uiCommand.command && onUICommand) {
      value = "";
      onUICommand(uiCommand.command, uiCommand.args);
      return;
    }

    if (isShellCommand(trimmedValue) && onExecCommand) {
      const command = trimmedValue.slice(1).trim(); // Remove the ! prefix
      if (command) {
        onExecCommand(command);
        value = "";
      }
    } else if (worktreeEnabled && isNewChat && onCreateWithWorktree) {
      // Create new chat with worktree mode - pass the message so it's sent after worktree is created
      const description = worktreeDescription.trim() || trimmedValue.slice(0, 50);
      const message = trimmedValue;
      onCreateWithWorktree(description, message);
      value = ""; // Clear the input immediately to prevent race conditions
      worktreeEnabled = false;
      worktreeDescription = "";
    } else {
      onSubmit();
    }
  }

  let inputRef: HTMLTextAreaElement | null = $state(null);
  let audioRecorderRef: { toggleRecording: () => void; isRecording: () => boolean } | null = $state(null);
  let highlightOverlay: HTMLDivElement | null = $state(null);
  
  let isDraggingOver = $state(false);
  let dragCounter = $state(0);
  
  let showFilePicker = $state(false);
  let filePickerQuery = $state("");
  let filePickerIndex = $state(0);
  let availableFiles = $state<FileEntry[]>([]);
  let filteredFiles = $derived(
    filePickerQuery
      ? availableFiles.filter(f =>
          f.name.toLowerCase().includes(filePickerQuery.toLowerCase()) ||
          f.path.toLowerCase().includes(filePickerQuery.toLowerCase())
        ).slice(0, 10)
      : availableFiles.slice(0, 10)
  );

  // Terminal picker state
  let showTerminalPicker = $state(false);
  let terminalPickerQuery = $state("");
  let terminalPickerIndex = $state(0);
  let availableTerminals = $state<TerminalEntry[]>([]);
  let filteredTerminals = $derived(
    terminalPickerQuery
      ? availableTerminals.filter(t =>
          t.name.toLowerCase().includes(terminalPickerQuery.toLowerCase()) ||
          t.terminalId.toLowerCase().includes(terminalPickerQuery.toLowerCase())
        ).slice(0, 10)
      : availableTerminals.slice(0, 10)
  );

  // Chat picker state
  let showChatPicker = $state(false);
  let chatPickerQuery = $state("");
  let chatPickerIndex = $state(0);
  let availableChats = $state<ChatEntry[]>([]);
  let filteredChats = $derived(
    chatPickerQuery
      ? availableChats.filter(c =>
          c.title.toLowerCase().includes(chatPickerQuery.toLowerCase())
        ).slice(0, 10)
      : availableChats.slice(0, 10)
  );

  // Agent picker state
  let showAgentPicker = $state(false);
  let agentPickerQuery = $state("");
  let agentPickerIndex = $state(0);

  // Filter agents based on query
  let filteredAgents = $derived(
    agentPickerQuery
      ? $agents.filter(a =>
          a.slug.toLowerCase().includes(agentPickerQuery.toLowerCase()) ||
          a.description.toLowerCase().includes(agentPickerQuery.toLowerCase())
        ).slice(0, 10)
      : $agents.slice(0, 10)
  );

  // Slash command picker state
  let showCommandPicker = $state(false);
  let commandPickerQuery = $state("");
  let commandPickerIndex = $state(0);

  // Built-in commands that are always available
  const builtInCommands: SlashCommand[] = [
    { name: "compact", description: "Summarize conversation to free up context space", isBuiltIn: true },
    { name: "clear", description: "Clear the conversation history", isBuiltIn: true },
    { name: "help", description: "Show available commands and help", isBuiltIn: true },
    { name: "model", description: "Switch to a different model", argsHint: "<model>", isBuiltIn: true },
    { name: "bug", description: "Report a bug or issue", isBuiltIn: true },
    { name: "config", description: "Open configuration settings", isBuiltIn: true },
  ];

  // Combine built-in commands with SDK-provided slash commands
  let allCommands = $derived<SlashCommand[]>([
    ...builtInCommands,
    ...slashCommands.filter(cmd => !builtInCommands.some(b => b.name === cmd.name))
  ]);

  let filteredCommands = $derived(
    commandPickerQuery
      ? allCommands.filter(c =>
          c.name.toLowerCase().includes(commandPickerQuery.toLowerCase()) ||
          c.description.toLowerCase().includes(commandPickerQuery.toLowerCase())
        ).slice(0, 10)
      : allCommands.slice(0, 10)
  );

  // Picker mode: "file" | "terminal" | "chat" | "command" | "agent" | null
  let pickerMode = $derived<"file" | "terminal" | "chat" | "command" | "agent" | null>(
    showCommandPicker ? "command" : showAgentPicker ? "agent" : showChatPicker ? "chat" : showTerminalPicker ? "terminal" : showFilePicker ? "file" : null
  );

  // Parse blockquote references from input for preview
  interface ParsedQuote {
    content: string;
    source?: string;
  }

  let parsedQuote: ParsedQuote | null = $derived.by(() => {
    const lines = value.split('\n');
    const quoteLines: string[] = [];
    let source: string | undefined;

    for (const line of lines) {
      if (line.startsWith('> ')) {
        const content = line.slice(2);
        // Check if this is a source annotation line
        const sourceMatch = content.match(/^\*Source:\s*`([^`]+)`\*$/);
        if (sourceMatch) {
          source = sourceMatch[1];
        } else {
          quoteLines.push(content);
        }
      }
    }

    if (quoteLines.length === 0) return null;

    return {
      content: quoteLines.join('\n'),
      source
    };
  });

  function clearQuote() {
    // Remove blockquote lines from the input
    const lines = value.split('\n');
    const nonQuoteLines = lines.filter(line => !line.startsWith('> '));
    value = nonQuoteLines.join('\n').trim();
  }

  export function focus() {
    inputRef?.focus();
  }

  export function toggleRecording() {
    audioRecorderRef?.toggleRecording();
  }

  async function loadProjectFiles(rootPath: string, currentPath: string = rootPath, depth: number = 0) {
    if (depth > 4 || availableFiles.length > 500) return;
    try {
      const res = await fetch(`${getApiBase()}/fs/list?path=${encodeURIComponent(currentPath)}`);
      const data = await res.json();
      if (data.entries) {
        for (const entry of data.entries) {
          if (availableFiles.length > 500) break;
          if (entry.type === "file") {
            availableFiles.push({ name: entry.name, path: entry.path, type: "file" });
          } else if (entry.type === "directory" && !entry.name.startsWith(".") && 
                     !["node_modules", "target", "dist", "build", ".git", "__pycache__", "venv", ".next", "coverage", ".svelte-kit"].includes(entry.name)) {
            await loadProjectFiles(rootPath, entry.path, depth + 1);
          }
        }
        availableFiles = [...availableFiles];
      }
    } catch (e) {
      console.error("Failed to load files:", e);
    }
  }

  $effect(() => {
    if (projectPath && availableFiles.length === 0) {
      loadProjectFiles(projectPath);
    }
  });

  async function loadActiveTerminals() {
    try {
      const url = sessionId
        ? `${getApiBase()}/terminal/pty?sessionId=${encodeURIComponent(sessionId)}`
        : `${getApiBase()}/terminal/pty`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.terminals) {
        availableTerminals = data.terminals.map((t: { terminalId: string; pid?: number; cwd?: string }, i: number) => ({
          terminalId: t.terminalId,
          name: `Terminal ${i + 1}`,
          pid: t.pid,
          cwd: t.cwd,
        }));
      }
    } catch (e) {
      console.error("Failed to load terminals:", e);
    }
  }

  async function loadRecentChats() {
    try {
      const res = await fetch(`${getApiBase()}/sessions/recent?limit=20`);
      const data = await res.json();
      if (Array.isArray(data)) {
        availableChats = data
          .filter((s: any) => s.id !== sessionId) // Exclude current session
          .map((s: any) => ({
            id: s.id,
            title: s.title,
            messageCount: s.total_turns || 0,
            projectName: null, // Could fetch project names if needed
            updatedAt: s.updated_at,
          }));
      }
    } catch (e) {
      console.error("Failed to load chats:", e);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showFilePicker) {
      const totalItems = filteredSpecialOptions.length + filteredFiles.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        filePickerIndex = Math.min(filePickerIndex + 1, totalItems - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        filePickerIndex = Math.max(filePickerIndex - 1, 0);
      } else if (e.key === "Enter" && totalItems > 0) {
        e.preventDefault();
        if (filePickerIndex < filteredSpecialOptions.length) {
          selectSpecialOption(filteredSpecialOptions[filePickerIndex]);
        } else {
          selectFile(filteredFiles[filePickerIndex - filteredSpecialOptions.length]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeFilePicker();
      } else if (e.key === "Tab" && totalItems > 0) {
        e.preventDefault();
        if (filePickerIndex < filteredSpecialOptions.length) {
          selectSpecialOption(filteredSpecialOptions[filePickerIndex]);
        } else {
          selectFile(filteredFiles[filePickerIndex - filteredSpecialOptions.length]);
        }
      }
      return;
    }

    if (showTerminalPicker) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        terminalPickerIndex = Math.min(terminalPickerIndex + 1, filteredTerminals.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        terminalPickerIndex = Math.max(terminalPickerIndex - 1, 0);
      } else if (e.key === "Enter" && filteredTerminals.length > 0) {
        e.preventDefault();
        selectTerminal(filteredTerminals[terminalPickerIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeTerminalPicker();
      } else if (e.key === "Tab" && filteredTerminals.length > 0) {
        e.preventDefault();
        selectTerminal(filteredTerminals[terminalPickerIndex]);
      }
      return;
    }

    if (showChatPicker) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        chatPickerIndex = Math.min(chatPickerIndex + 1, filteredChats.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        chatPickerIndex = Math.max(chatPickerIndex - 1, 0);
      } else if (e.key === "Enter" && filteredChats.length > 0) {
        e.preventDefault();
        selectChat(filteredChats[chatPickerIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeChatPicker();
      } else if (e.key === "Tab" && filteredChats.length > 0) {
        e.preventDefault();
        selectChat(filteredChats[chatPickerIndex]);
      }
      return;
    }

    if (showAgentPicker) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        agentPickerIndex = Math.min(agentPickerIndex + 1, filteredAgents.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        agentPickerIndex = Math.max(agentPickerIndex - 1, 0);
      } else if (e.key === "Enter" && filteredAgents.length > 0) {
        e.preventDefault();
        selectAgent(filteredAgents[agentPickerIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeAgentPicker();
      } else if (e.key === "Tab" && filteredAgents.length > 0) {
        e.preventDefault();
        selectAgent(filteredAgents[agentPickerIndex]);
      }
      return;
    }

    if (showCommandPicker) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        commandPickerIndex = Math.min(commandPickerIndex + 1, filteredCommands.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        commandPickerIndex = Math.max(commandPickerIndex - 1, 0);
      } else if (e.key === "Enter" && filteredCommands.length > 0) {
        e.preventDefault();
        selectCommand(filteredCommands[commandPickerIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeCommandPicker();
      } else if (e.key === "Tab" && filteredCommands.length > 0) {
        e.preventDefault();
        selectCommand(filteredCommands[commandPickerIndex]);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    const cursorPos = target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);

    // Check for /command at start of input (slash commands)
    const commandMatch = textBeforeCursor.match(/^\/([^\s]*)$/);
    if (commandMatch) {
      commandPickerQuery = commandMatch[1];
      commandPickerIndex = 0;
      showCommandPicker = true;
      showFilePicker = false;
      showTerminalPicker = false;
      showChatPicker = false;
      adjustTextareaHeight(target);
      return;
    } else {
      showCommandPicker = false;
      commandPickerQuery = "";
    }

    // Check for @chat mention (must be at start or preceded by whitespace, not part of email)
    const chatMatch = textBeforeCursor.match(/(?:^|[\s])@chat([^\s@]*)$/i);
    if (chatMatch) {
      chatPickerQuery = chatMatch[1];
      chatPickerIndex = 0;
      showChatPicker = true;
      showFilePicker = false;
      showTerminalPicker = false;
      // Load chats when picker opens
      if (availableChats.length === 0) {
        loadRecentChats();
      }
      adjustTextareaHeight(target);
      return;
    }

    // Check for @terminal mention (must be at start or preceded by whitespace, not part of email)
    const terminalMatch = textBeforeCursor.match(/(?:^|[\s])@terminal([^\s@]*)$/i);
    if (terminalMatch) {
      terminalPickerQuery = terminalMatch[1];
      terminalPickerIndex = 0;
      showTerminalPicker = true;
      showFilePicker = false;
      showChatPicker = false;
      showAgentPicker = false;
      // Load terminals when picker opens
      if (availableTerminals.length === 0) {
        loadActiveTerminals();
      }
      adjustTextareaHeight(target);
      return;
    }

    // Check for @agent mention (for agent selection)
    const agentMatch = textBeforeCursor.match(/(?:^|[\s])@agent([^\s@]*)$/i);
    if (agentMatch) {
      agentPickerQuery = agentMatch[1];
      agentPickerIndex = 0;
      showAgentPicker = true;
      showFilePicker = false;
      showTerminalPicker = false;
      showChatPicker = false;
      agents.load();
      adjustTextareaHeight(target);
      return;
    }

    // Check for regular @ mention (files + special options) - must be at start or preceded by whitespace
    const atMatch = textBeforeCursor.match(/(?:^|[\s])@([^\s@]*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      // Show file picker with special options for terminal/chat/agent
      filePickerQuery = atMatch[1];
      filePickerIndex = 0;
      showFilePicker = true;
      showTerminalPicker = false;
      showChatPicker = false;
      showAgentPicker = false;
    } else {
      showFilePicker = false;
      showTerminalPicker = false;
      showChatPicker = false;
      showAgentPicker = false;
      filePickerQuery = "";
      terminalPickerQuery = "";
      chatPickerQuery = "";
      agentPickerQuery = "";
    }

    adjustTextareaHeight(target);
  }

  // Special @ options that appear at top of file picker
  interface SpecialOption {
    id: string;
    label: string;
    description: string;
    icon: string;
    color: string;
  }

  const specialOptions: SpecialOption[] = [
    { id: "agent", label: "agent", description: "Call a specialized agent", icon: "agent", color: "purple" },
    { id: "chat", label: "chat", description: "Reference another chat", icon: "chat", color: "blue" },
    { id: "terminal", label: "terminal", description: "Reference terminal output", icon: "terminal", color: "green" },
  ];

  let filteredSpecialOptions = $derived(
    filePickerQuery
      ? specialOptions.filter(o => o.label.toLowerCase().startsWith(filePickerQuery.toLowerCase()))
      : specialOptions
  );

  // Combined list for keyboard navigation
  let totalPickerItems = $derived(filteredSpecialOptions.length + filteredFiles.length);

  function selectSpecialOption(option: SpecialOption) {
    const cursorPos = inputRef?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1) {
      // Replace @... with @option and keep cursor there
      value = textBeforeCursor.slice(0, atIndex) + `@${option.id}` + textAfterCursor;
      closeFilePicker();

      // Trigger the appropriate picker
      setTimeout(() => {
        if (option.id === "agent") {
          showAgentPicker = true;
          agents.load(); // Load agents if not already loaded
        } else if (option.id === "chat") {
          showChatPicker = true;
          if (availableChats.length === 0) loadRecentChats();
        } else if (option.id === "terminal") {
          showTerminalPicker = true;
          if (availableTerminals.length === 0) loadActiveTerminals();
        }
        inputRef?.focus();
      }, 0);
    }
  }

  function selectAgent(agent: Agent) {
    const cursorPos = inputRef?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    // Find @agent pattern and replace with @agentSlug
    const atIndex = textBeforeCursor.lastIndexOf("@agent");
    if (atIndex !== -1) {
      // If this is at the start of the message, keep it there for agent routing
      // Replace @agent with @slug followed by space
      value = textBeforeCursor.slice(0, atIndex) + `@${agent.slug} ` + textAfterCursor;
    } else {
      // Fallback: just insert at cursor
      value = textBeforeCursor + `@${agent.slug} ` + textAfterCursor;
    }

    closeAgentPicker();

    setTimeout(() => {
      inputRef?.focus();
      const newPos = value.indexOf(`@${agent.slug} `) + agent.slug.length + 2;
      inputRef?.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function closeAgentPicker() {
    showAgentPicker = false;
    agentPickerQuery = "";
    agentPickerIndex = 0;
  }

  function adjustTextareaHeight(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    const lineHeight = 24;
    const maxLines = 8;
    const maxHeight = lineHeight * maxLines;
    const minHeight = 56;
    textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))}px`;
  }

  $effect(() => {
    if (inputRef && value === '') {
      inputRef.style.height = '56px';
    }
  });

  function selectFile(file: FileEntry) {
    const cursorPos = inputRef?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1) {
      const relativePath = file.path.replace(projectPath || "", "").replace(/^\//, "");
      value = textBeforeCursor.slice(0, atIndex) + `@${relativePath}` + textAfterCursor + " ";
    }
    
    closeFilePicker();
    
    setTimeout(() => {
      inputRef?.focus();
      const newPos = value.length;
      inputRef?.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function closeFilePicker() {
    showFilePicker = false;
    filePickerQuery = "";
    filePickerIndex = 0;
  }

  async function selectTerminal(terminal: TerminalEntry) {
    const cursorPos = inputRef?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    // Find the @terminal pattern and replace with inline reference
    const atIndex = textBeforeCursor.lastIndexOf("@terminal");
    if (atIndex !== -1) {
      // Replace @terminal... with @terminal:"Name" inline reference
      value = textBeforeCursor.slice(0, atIndex) + `@terminal:"${terminal.name}" ` + textAfterCursor;

      // Also add to store for model access
      try {
        const res = await fetch(`${getApiBase()}/terminal/pty/${terminal.terminalId}/buffer`);
        const data = await res.json();

        terminalReferences.add({
          id: crypto.randomUUID(),
          terminalId: terminal.terminalId,
          name: terminal.name,
          bufferLines: data.lineCount || 0,
        });
      } catch (e) {
        console.error("Failed to fetch terminal buffer:", e);
        terminalReferences.add({
          id: crypto.randomUUID(),
          terminalId: terminal.terminalId,
          name: terminal.name,
          bufferLines: 0,
        });
      }
    }

    closeTerminalPicker();

    setTimeout(() => {
      inputRef?.focus();
      // Move cursor to end of inserted reference
      const newPos = value.indexOf('" ', atIndex) + 2;
      inputRef?.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function closeTerminalPicker() {
    showTerminalPicker = false;
    terminalPickerQuery = "";
    terminalPickerIndex = 0;
  }

  async function selectChat(chat: ChatEntry) {
    const cursorPos = inputRef?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    // Find the @chat pattern and replace with inline reference
    const atIndex = textBeforeCursor.lastIndexOf("@chat");
    if (atIndex !== -1) {
      // Create a clean title for inline display (remove special chars, truncate)
      const cleanTitle = chat.title
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 30);

      // Replace @chat... with @chat:"Title" inline reference
      value = textBeforeCursor.slice(0, atIndex) + `@chat:"${chat.title}" ` + textAfterCursor;

      // Also add to store for model access
      try {
        const res = await fetch(`${getApiBase()}/sessions/${chat.id}/inspect?scope=metadata`);
        const data = await res.json();

        chatReferences.add({
          id: crypto.randomUUID(),
          sessionId: chat.id,
          title: data.metadata?.title || chat.title,
          messageCount: data.metadata?.messageCount || chat.messageCount,
          projectName: data.metadata?.projectName || null,
          updatedAt: data.metadata?.updatedAt || chat.updatedAt,
        });
      } catch (e) {
        console.error("Failed to fetch chat metadata:", e);
        chatReferences.add({
          id: crypto.randomUUID(),
          sessionId: chat.id,
          title: chat.title,
          messageCount: chat.messageCount,
          projectName: chat.projectName,
          updatedAt: chat.updatedAt,
        });
      }
    }

    closeChatPicker();

    setTimeout(() => {
      inputRef?.focus();
      // Move cursor to end of inserted reference
      const newPos = value.indexOf('" ', atIndex) + 2;
      inputRef?.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function closeChatPicker() {
    showChatPicker = false;
    chatPickerQuery = "";
    chatPickerIndex = 0;
  }

  function selectCommand(command: SlashCommand) {
    closeCommandPicker();

    // Check if this is a UI-only command
    if (UI_ONLY_COMMANDS.has(command.name)) {
      // Handle locally - don't send to SDK
      value = ""; // Clear input
      if (onUICommand) {
        onUICommand(command.name);
      }
      return;
    }

    // Set the command text for SDK commands
    value = `/${command.name}`;

    // If command has no args, execute immediately
    if (!command.argsHint) {
      // Execute the command by submitting
      setTimeout(() => {
        onSubmit();
      }, 0);
    } else {
      // Command needs args - put cursor after command with space
      value = `/${command.name} `;
      setTimeout(() => {
        inputRef?.focus();
        const newPos = value.length;
        inputRef?.setSelectionRange(newPos, newPos);
      }, 0);
    }
  }

  function closeCommandPicker() {
    showCommandPicker = false;
    commandPickerQuery = "";
    commandPickerIndex = 0;
  }

  // Parse and highlight mentions in the input value
  interface HighlightSegment {
    text: string;
    type: "text" | "chat" | "terminal" | "file";
  }

  function parseHighlights(text: string): HighlightSegment[] {
    const segments: HighlightSegment[] = [];
    // Match @chat:"..." @terminal:"..." and @path/to/file - must be at start or preceded by whitespace (not email)
    const mentionRegex = /(?:^|(?<=\s))(@chat:"[^"]*"|@terminal:"[^"]*"|@[\w./\-]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), type: "text" });
      }

      // Determine mention type
      const mention = match[0];
      let type: HighlightSegment["type"] = "file";
      if (mention.startsWith("@chat:")) {
        type = "chat";
      } else if (mention.startsWith("@terminal:")) {
        type = "terminal";
      }

      segments.push({ text: mention, type });
      lastIndex = match.index + mention.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), type: "text" });
    }

    return segments;
  }

  let highlightedSegments = $derived(parseHighlights(value));

  function syncScroll() {
    if (highlightOverlay && inputRef) {
      highlightOverlay.scrollTop = inputRef.scrollTop;
      highlightOverlay.scrollLeft = inputRef.scrollLeft;
    }
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer?.types.includes("Files") || e.dataTransfer?.types.includes("text/plain")) {
      isDraggingOver = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      isDraggingOver = false;
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    dragCounter = 0;

    const filePath = e.dataTransfer?.getData("application/x-file-path");
    if (filePath) {
      const fileName = filePath.split("/").pop() || filePath;
      attachedFiles.add({ path: filePath, name: fileName, type: "file" });
      return;
    }

    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && projectPath) {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetDir", projectPath);
        
        try {
          const res = await fetch(`${getApiBase()}/fs/upload`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.success) {
            attachedFiles.add({ path: data.path, name: data.name, type: "file" });
          }
        } catch (err) {
          console.error("Failed to upload file:", err);
        }
      }
    }
  }

  function removeAttachedFile(path: string) {
    attachedFiles.remove(path);
  }

  async function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items || !projectPath) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        const ext = item.type.split("/")[1] || "png";
        const timestamp = Date.now();
        const fileName = `pasted-image-${timestamp}.${ext}`;

        const formData = new FormData();
        formData.append("file", blob, fileName);
        formData.append("targetDir", `${projectPath}/.claude/pasted_images`);

        try {
          const res = await fetch(`${getApiBase()}/fs/upload`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.success) {
            attachedFiles.add({ path: data.path, name: data.name, type: "file" });
          }
        } catch (err) {
          console.error("Failed to upload pasted image:", err);
        }
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative group rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.6)] border transition-all duration-200 {isShellCommand(value) ? 'bg-[#1a1b26] border-[#3d59a1] focus-within:border-[#7aa2f7] shadow-[0_8px_30px_rgb(0,0,0,0.3)]' : 'bg-white dark:bg-gray-800 focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.8)]'} {isDraggingOver ? 'border-blue-400 bg-blue-50/30 dark:border-blue-500 dark:bg-blue-900/30' : isShellCommand(value) ? '' : 'border-gray-200 dark:border-gray-700 focus-within:border-gray-300 dark:focus-within:border-gray-600'}"
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={handleDragOver}
  ondrop={handleDrop}
>
  {#if isDraggingOver}
    <div class="absolute inset-0 flex items-center justify-center bg-blue-50/80 dark:bg-blue-900/80 rounded-xl z-10 pointer-events-none">
      <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
        <span class="text-sm font-medium">Drop files to attach</span>
      </div>
    </div>
  {/if}

  <!-- Quote preview -->
  {#if parsedQuote}
    <div class="mx-3 mt-2 mb-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/30 overflow-hidden">
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-indigo-200/50 dark:border-indigo-800/50 bg-indigo-100/30 dark:bg-indigo-900/40">
        <div class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z"></path>
          </svg>
          <span class="text-xs font-medium text-indigo-700 dark:text-indigo-300">Quoting</span>
          {#if parsedQuote.source}
            <span class="text-xs text-indigo-500 dark:text-indigo-400 font-mono truncate max-w-[200px]">{parsedQuote.source}</span>
          {/if}
        </div>
        <button
          onclick={clearQuote}
          class="p-1 rounded hover:bg-indigo-200/50 dark:hover:bg-indigo-800/50 text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
          title="Remove quote"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      <div class="px-3 py-2 max-h-24 overflow-y-auto">
        <pre class="text-xs text-indigo-900 dark:text-indigo-100 font-sans whitespace-pre-wrap break-words leading-relaxed">{parsedQuote.content.length > 200 ? parsedQuote.content.slice(0, 200) + '...' : parsedQuote.content}</pre>
      </div>
    </div>
  {/if}

  {#if $attachedFiles.length > 0 || $textReferences.length > 0 || $terminalReferences.length > 0 || $chatReferences.length > 0}
    <div class="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
      {#if $attachedFiles.length > 0}
        <FileAttachment
          files={$attachedFiles}
          removable={true}
          onRemove={removeAttachedFile}
          {onPreview}
          size="sm"
        />
      {/if}
      {#each $textReferences as ref (ref.id)}
        <ReferenceChip
          reference={ref}
          onRemove={() => textReferences.remove(ref.id)}
        />
      {/each}
      {#each $terminalReferences as ref (ref.id)}
        <TerminalReferenceChip
          reference={ref}
          onRemove={() => terminalReferences.remove(ref.id)}
        />
      {/each}
      {#each $chatReferences as ref (ref.id)}
        <ChatReferenceChip
          reference={ref}
          onRemove={() => chatReferences.remove(ref.id)}
          onNavigate={onNavigateToChat}
        />
      {/each}
    </div>
  {/if}

  <div class="relative input-container">
    {#if isShellCommand(value)}
      <div class="absolute left-3 top-2 flex items-center gap-1.5 text-[10px] font-medium text-[#7aa2f7] bg-[#1a1b26] border border-[#3d59a1] px-2 py-0.5 rounded z-10 font-mono">
        <span class="text-[#9ece6a]">$</span>
        <span>terminal</span>
      </div>
    {:else if $planMode}
      <!-- Plan Mode indicator -->
      <div class="absolute left-3 top-2 flex items-center gap-1.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 px-2 py-0.5 rounded z-10">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
        </svg>
        <span>plan mode</span>
      </div>
    {/if}

    <!-- Highlight overlay - renders colored backgrounds for @mentions -->
    {#if !isShellCommand(value) && highlightedSegments.some(s => s.type !== "text")}
      <div
        bind:this={highlightOverlay}
        class="highlight-overlay absolute left-4 right-24 top-3.5 bottom-3.5 pointer-events-none text-[15px] whitespace-pre-wrap break-words overflow-hidden"
        aria-hidden="true"
      >
        {#each highlightedSegments as segment}
          {#if segment.type === "chat"}
            <span class="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-md px-0.5 -mx-0.5 box-decoration-clone">{segment.text}</span>
          {:else if segment.type === "terminal"}
            <span class="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-md px-0.5 -mx-0.5 box-decoration-clone">{segment.text}</span>
          {:else if segment.type === "file"}
            <span class="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-md px-0.5 -mx-0.5 box-decoration-clone">{segment.text}</span>
          {:else}
            <span class="text-transparent">{segment.text}</span>
          {/if}
        {/each}
      </div>
    {/if}

    <textarea
      bind:this={inputRef}
      bind:value
      onkeydown={handleKeydown}
      oninput={handleInput}
      onpaste={handlePaste}
      onscroll={syncScroll}
      placeholder={loading ? (queuedCount > 0 ? `${queuedCount} message${queuedCount > 1 ? 's' : ''} queued...` : "Type to queue message...") : ($planMode ? "Describe what you want to build... Claude will plan first" : "Message Claude... (@ files, @terminal, @chat, ! shell)")}
      {disabled}
      class="w-full bg-transparent border-none rounded-xl pl-4 pr-24 {isShellCommand(value) ? 'pt-8 text-[#c0caf5] placeholder-[#565f89] font-mono' : $planMode ? 'pt-8 placeholder-indigo-400 dark:placeholder-indigo-500' : 'pt-3.5 placeholder-gray-400 dark:placeholder-gray-500'} pb-3.5 focus:outline-none focus:ring-0 resize-none min-h-[56px] text-[15px] disabled:opacity-50 overflow-y-auto relative z-[1]"
      rows="1"
      style={!isShellCommand(value) && highlightedSegments.some(s => s.type !== "text") ? "color: transparent; caret-color: #111;" : ""}
    ></textarea>

    <!-- Action buttons - positioned inside textarea area -->
    <div class="absolute right-2 bottom-2 flex items-center gap-1">
      <AudioRecorder
        bind:this={audioRecorderRef}
        onTranscript={(text) => { value = value ? value + " " + text : text; }}
        {disabled}
      />
      {#if loading}
        <button
          onclick={onStop}
          class="p-1.5 text-red-500 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-all"
          title="Stop generation"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>
        </button>
      {:else}
        <button
          onclick={handleSubmit}
          disabled={disabled || !value.trim()}
          class="p-1.5 rounded-lg transition-all disabled:opacity-30 {isShellCommand(value) ? 'text-[#9ece6a] hover:bg-[#9ece6a]/20' : 'text-gray-400 dark:text-gray-500 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 disabled:hover:bg-transparent'}"
          title={isShellCommand(value) ? "Run command (Enter)" : "Send message"}
        >
          {#if isShellCommand(value)}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
            </svg>
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"></path>
            </svg>
          {/if}
        </button>
      {/if}
    </div>

    {#if showFilePicker}
      <div class="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
        <!-- Special options (chat, terminal) -->
        {#if filteredSpecialOptions.length > 0}
          <div class="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">
            Reference
          </div>
          {#each filteredSpecialOptions as option, i}
            <button
              onclick={() => selectSpecialOption(option)}
              class="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 {i === filePickerIndex ? (option.color === 'purple' ? 'bg-purple-50 dark:bg-purple-900/30' : option.color === 'blue' ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-green-50 dark:bg-green-900/30') : ''}"
            >
              {#if option.id === "agent"}
                <svg class="w-4 h-4 text-purple-500 dark:text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                </svg>
              {:else if option.id === "chat"}
                <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
              {:else}
                <svg class="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
              {/if}
              <div class="min-w-0 flex-1">
                <div class="text-sm text-gray-900 dark:text-gray-100">@{option.label}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500">{option.description}</div>
              </div>
            </button>
          {/each}
        {/if}

        <!-- Files -->
        {#if filteredFiles.length > 0 || availableFiles.length === 0}
          <div class="px-3 py-1.5 border-b border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">
            Files
          </div>
        {/if}
        {#each filteredFiles as file, i}
          {@const adjustedIndex = i + filteredSpecialOptions.length}
          <button
            onclick={() => selectFile(file)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 {adjustedIndex === filePickerIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''}"
          >
            <svg class="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 dark:text-gray-100 truncate">{file.name}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 truncate">{file.path.replace(projectPath || "", "")}</div>
            </div>
          </button>
        {/each}
        {#if filteredFiles.length === 0 && filteredSpecialOptions.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            {availableFiles.length === 0 ? "Loading files..." : "No matching files"}
          </div>
        {/if}
      </div>
    {/if}

    {#if showTerminalPicker}
      <div class="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          Active Terminals
        </div>
        {#each filteredTerminals as terminal, i}
          <button
            onclick={() => selectTerminal(terminal)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 {i === terminalPickerIndex ? 'bg-green-50 dark:bg-green-900/30' : ''}"
          >
            <svg class="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 dark:text-gray-100 truncate">{terminal.name}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 truncate font-mono">
                {terminal.cwd ? terminal.cwd.split('/').slice(-2).join('/') : terminal.terminalId}
              </div>
            </div>
            {#if terminal.pid}
              <span class="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded font-mono">PID {terminal.pid}</span>
            {/if}
          </button>
        {/each}
        {#if filteredTerminals.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            {availableTerminals.length === 0 ? "Loading terminals..." : "No active terminals"}
          </div>
        {/if}
      </div>
    {/if}

    {#if showChatPicker}
      <div class="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
          </svg>
          Recent Chats
        </div>
        {#each filteredChats as chat, i}
          <button
            onclick={() => selectChat(chat)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 {i === chatPickerIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''}"
          >
            <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 dark:text-gray-100 truncate">{chat.title}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 truncate">
                {chat.messageCount} messages
              </div>
            </div>
          </button>
        {/each}
        {#if filteredChats.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            {availableChats.length === 0 ? "Loading chats..." : "No matching chats"}
          </div>
        {/if}
      </div>
    {/if}

    {#if showAgentPicker}
      <div class="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
          </svg>
          Agents
        </div>
        {#each filteredAgents as agent, i}
          <button
            onclick={() => selectAgent(agent)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 {i === agentPickerIndex ? 'bg-purple-50 dark:bg-purple-900/30' : ''}"
          >
            <svg class="w-4 h-4 text-purple-500 dark:text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 dark:text-gray-100">@{agent.slug}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 truncate">
                {agent.description}
              </div>
            </div>
            {#if agent.scope === 'global'}
              <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 rounded">global</span>
            {:else}
              <span class="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 rounded">project</span>
            {/if}
          </button>
        {/each}
        {#if filteredAgents.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            {$agents.length === 0 ? "Loading agents..." : "No matching agents"}
          </div>
        {/if}
      </div>
    {/if}

    {#if showCommandPicker}
      <div class="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
          Commands
        </div>
        {#each filteredCommands as command, i}
          <button
            onclick={() => selectCommand(command)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 {i === commandPickerIndex ? 'bg-orange-50 dark:bg-orange-900/30' : ''}"
          >
            <svg class="w-4 h-4 {command.isBuiltIn ? 'text-orange-500 dark:text-orange-400' : 'text-purple-500 dark:text-purple-400'} flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {#if command.isBuiltIn}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              {/if}
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1">
                <span class="font-mono">/{command.name}</span>
                {#if command.argsHint}
                  <span class="text-gray-400 dark:text-gray-500 text-xs">{command.argsHint}</span>
                {/if}
              </div>
              <div class="text-xs text-gray-400 dark:text-gray-500 truncate">{command.description}</div>
            </div>
            {#if command.isBuiltIn}
              <span class="text-[10px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-300 rounded">built-in</span>
            {:else}
              <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 rounded">skill</span>
            {/if}
          </button>
        {/each}
        {#if filteredCommands.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            No matching commands
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Toolbar - icon buttons on the left -->
  {#if !isShellCommand(value)}
    <div class="border-t border-gray-100 dark:border-gray-700 px-2 py-1.5 flex items-center gap-1">
      <!-- Active Worktree indicator (for sessions with worktree) -->
      {#if worktreeBranch}
        <div class="relative">
          <button
            onclick={() => showWorktreeMenu = !showWorktreeMenu}
            class="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-150 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
            title="Working in parallel branch"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4.97-4.03 9-9 9"/>
            </svg>
            <span class="text-[11px] font-medium max-w-[100px] truncate">
              {worktreeBranch.replace(/^session\//, '').slice(0, 20)}
            </span>
            <svg class="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {#if showWorktreeMenu}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="fixed inset-0 z-40"
              onclick={() => showWorktreeMenu = false}
            ></div>
            <div class="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 z-50">
              <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                <div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4.97-4.03 9-9 9"/>
                  </svg>
                  <span class="text-xs font-semibold uppercase tracking-wide">Parallel Branch</span>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Working in isolated copy. Changes don't affect <span class="font-medium text-gray-700 dark:text-gray-300">{worktreeBaseBranch || 'main'}</span> until merged.
                </p>
              </div>

              <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                <div class="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Branch</div>
                <div class="text-sm text-gray-800 dark:text-gray-200 font-mono truncate" title={worktreeBranch}>
                  {worktreeBranch.replace(/^session\//, '')}
                </div>
              </div>

              <div class="px-2 pt-2 space-y-1">
                <button
                  onclick={() => { showWorktreeMenu = false; onMergeWorktree?.(); }}
                  class="w-full px-3 py-2 text-left text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg flex items-center gap-2.5 transition-colors font-medium"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
                  </svg>
                  Merge to {worktreeBaseBranch || 'main'}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {:else if isGitRepo && isNewChat}
        <!-- Parallel Branch toggle (only for new chats in git repos) -->
        <Tooltip text={worktreeEnabled ? 'Parallel Branch: ON' : 'Parallel Branch'} position="top">
          <button
            onclick={handleToggle}
            class="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 {worktreeEnabled ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4.97-4.03 9-9 9"/>
            </svg>
          </button>
        </Tooltip>
      {/if}

      <!-- Backend Selector (only for new chats) -->
      {#if isNewChat && onBackendChange}
        {@const meta = backendMeta[backend]}
        <div class="relative">
          <button
            onclick={() => showBackendMenu = !showBackendMenu}
            class="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-150 {meta.bgColor} {meta.color} hover:opacity-80"
            title="Select AI backend"
          >
            <span class="w-4 h-4 rounded flex items-center justify-center {backend === 'claude' ? 'bg-orange-500' : backend === 'codex' ? 'bg-green-500' : 'bg-blue-500'} text-white text-[10px] font-bold">
              {meta.icon}
            </span>
            <span class="text-[11px] font-medium">{meta.label}</span>
            <svg class="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {#if showBackendMenu}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="fixed inset-0 z-40"
              onclick={() => showBackendMenu = false}
            ></div>
            <div class="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 z-50">
              <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  <span class="text-xs font-semibold uppercase tracking-wide">AI Backend</span>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Choose which AI to use. Can't be changed after starting chat.
                </p>
              </div>

              <div class="py-1">
                {#each (["claude", "codex", "gemini"] as const) as backendId}
                  {@const bMeta = backendMeta[backendId]}
                  <button
                    onclick={() => { onBackendChange(backendId); showBackendMenu = false; }}
                    class="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors {backend === backendId ? bMeta.bgColor : ''}"
                  >
                    <span class="w-5 h-5 rounded flex items-center justify-center {backendId === 'claude' ? 'bg-orange-500' : backendId === 'codex' ? 'bg-green-500' : 'bg-blue-500'} text-white text-[11px] font-bold">
                      {bMeta.icon}
                    </span>
                    <span class="text-sm {backend === backendId ? bMeta.color + ' font-medium' : 'text-gray-700 dark:text-gray-300'}">{bMeta.label}</span>
                    {#if backend === backendId}
                      <svg class="w-4 h-4 ml-auto {bMeta.color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else if !isNewChat}
        <!-- Read-only backend indicator for existing chats -->
        {@const meta = backendMeta[backend]}
        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded-md {meta.bgColor} {meta.color} opacity-70 cursor-default"
          title="Backend: {meta.label} (locked)"
        >
          <span class="w-4 h-4 rounded flex items-center justify-center {backend === 'claude' ? 'bg-orange-500' : backend === 'codex' ? 'bg-green-500' : 'bg-blue-500'} text-white text-[10px] font-bold">
            {meta.icon}
          </span>
          <span class="text-[11px] font-medium">{meta.label}</span>
        </div>
      {/if}

      <!-- Cloud Execution Toggle -->
      {#if onExecutionModeChange}
        <CloudExecutionToggle
          mode={executionMode}
          branch={cloudBranch}
          branches={cloudBranches}
          {isGitRepo}
          onModeChange={onExecutionModeChange}
          onBranchChange={onCloudBranchChange}
        />
      {/if}

      <!-- Plan Mode toggle -->
      <Tooltip text={$planMode ? 'Plan Mode: ON' : 'Plan Mode'} position="top">
        <button
          onclick={() => planMode.toggle()}
          class="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 {$planMode ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
          </svg>
        </button>
      </Tooltip>

      <!-- Loop/Until Done toggle -->
      <Tooltip text={untilDoneEnabled ? 'Loop Mode: ON' : 'Loop Mode'} position="top">
        <button
          onclick={() => onToggleUntilDone?.()}
          class="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 {untilDoneEnabled ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </Tooltip>

      <!-- Skills dropdown -->
      <div class="relative">
        <Tooltip text={activeSkills.length > 0 ? `Skills (${activeSkills.length})` : 'Skills'} position="top">
          <button
            onclick={() => showSkillsMenu = !showSkillsMenu}
            class="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 {activeSkills.length > 0 ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            {#if activeSkills.length > 0}
              <span class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 dark:bg-purple-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {activeSkills.length}
              </span>
            {/if}
          </button>
        </Tooltip>

        {#if showSkillsMenu}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="fixed inset-0 z-40"
            onclick={() => showSkillsMenu = false}
          ></div>
          <div class="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 z-50">
            <div class="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              {activeSkills.length > 0 ? `Active Skills (${activeSkills.length})` : 'No Skills Active'}
            </div>
            {#if activeSkills.length > 0}
              <div class="py-1 max-h-48 overflow-y-auto">
                {#each activeSkills as skill}
                  <div class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <span class="w-2 h-2 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-500 flex-shrink-0"></span>
                    <span class="truncate">{skill.name}</span>
                  </div>
                {/each}
              </div>
            {/if}
            <div class="border-t border-gray-100 dark:border-gray-700 pt-2 px-2">
              <button
                onclick={() => { showSkillsMenu = false; onManageSkills?.(); }}
                class="w-full px-3 py-2 text-left text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg flex items-center gap-2.5 transition-colors font-medium"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Manage Skills
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- MCP Servers dropdown -->
      <div class="relative">
        <Tooltip text={enabledMcpCount > 0 ? `MCP (${enabledMcpCount})` : 'MCP Servers'} position="top">
          <button
            onclick={() => showMcpMenu = !showMcpMenu}
            class="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 {enabledMcpCount > 0 ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-200 dark:hover:bg-cyan-900/50' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/>
            </svg>
            {#if enabledMcpCount > 0}
              <span class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-cyan-500 dark:bg-cyan-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {enabledMcpCount}
              </span>
            {/if}
          </button>
        </Tooltip>

        {#if showMcpMenu}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="fixed inset-0 z-40"
            onclick={() => showMcpMenu = false}
          ></div>
          <div class="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 z-50">
            <div class="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>
              </svg>
              {enabledMcpCount > 0 ? `MCP Servers (${enabledMcpCount}/${totalMcpCount})` : 'No MCP Servers Active'}
            </div>
            {#if mcpServers.length > 0}
              <div class="py-1 max-h-48 overflow-y-auto">
                {#each mcpServers as server}
                  <div class="px-3 py-2 text-sm flex items-center gap-2.5 {server.enabled ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}">
                    <span class="w-2 h-2 rounded-full flex-shrink-0 {server.enabled ? 'bg-gradient-to-br from-cyan-400 to-teal-500' : 'bg-gray-300 dark:bg-gray-600'}"></span>
                    <span class="truncate flex-1">{server.name}</span>
                    {#if server.isBuiltIn}
                      <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">built-in</span>
                    {/if}
                    {#if server.toolCount !== undefined}
                      <span class="text-xs text-gray-400 dark:text-gray-500">{server.toolCount} tools</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
            <div class="border-t border-gray-100 dark:border-gray-700 pt-2 px-2">
              <button
                onclick={() => { showMcpMenu = false; onManageMcp?.(); }}
                class="w-full px-3 py-2 text-left text-sm text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded-lg flex items-center gap-2.5 transition-colors font-medium"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Manage MCP Servers
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Spacer -->
      <div class="flex-1"></div>
    </div>
  {/if}
</div>
