<script lang="ts">
  import { attachedFiles, textReferences, terminalReferences, chatReferences, type AttachedFile, type TerminalReference, type ChatReference } from "../stores";
  import FileAttachment from "./FileAttachment.svelte";
  import ReferenceChip from "./ReferenceChip.svelte";
  import TerminalReferenceChip from "./TerminalReferenceChip.svelte";
  import ChatReferenceChip from "./ChatReferenceChip.svelte";
  import AudioRecorder from "./AudioRecorder.svelte";
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

  interface Props {
    value: string;
    disabled?: boolean;
    loading?: boolean;
    queuedCount?: number;
    projectPath?: string;
    activeSkills?: Skill[];
    sessionId?: string;
    untilDoneEnabled?: boolean;
    onSubmit: () => void;
    onStop?: () => void;
    onPreview?: (path: string) => void;
    onExecCommand?: (command: string) => void;
    onManageSkills?: () => void;
    onNavigateToChat?: (sessionId: string) => void;
    onToggleUntilDone?: () => void;
  }

  let { value = $bindable(), disabled = false, loading = false, queuedCount = 0, projectPath, activeSkills = [], sessionId, untilDoneEnabled = false, onSubmit, onStop, onPreview, onExecCommand, onManageSkills, onNavigateToChat, onToggleUntilDone }: Props = $props();

  let showSkillsMenu = $state(false);

  // Check if the input is a ! command
  function isShellCommand(text: string): boolean {
    return text.trim().startsWith("!");
  }

  function handleSubmit() {
    const trimmedValue = value.trim();
    if (isShellCommand(trimmedValue) && onExecCommand) {
      const command = trimmedValue.slice(1).trim(); // Remove the ! prefix
      if (command) {
        onExecCommand(command);
        value = "";
      }
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

  // Picker mode: "file" | "terminal" | "chat" | null
  let pickerMode = $derived<"file" | "terminal" | "chat" | null>(
    showChatPicker ? "chat" : showTerminalPicker ? "terminal" : showFilePicker ? "file" : null
  );

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

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    const cursorPos = target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);

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
      // Load terminals when picker opens
      if (availableTerminals.length === 0) {
        loadActiveTerminals();
      }
      adjustTextareaHeight(target);
      return;
    }

    // Check for regular @ mention (files + special options) - must be at start or preceded by whitespace
    const atMatch = textBeforeCursor.match(/(?:^|[\s])@([^\s@]*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      // Show file picker with special options for terminal/chat
      filePickerQuery = atMatch[1];
      filePickerIndex = 0;
      showFilePicker = true;
      showTerminalPicker = false;
      showChatPicker = false;
    } else {
      showFilePicker = false;
      showTerminalPicker = false;
      showChatPicker = false;
      filePickerQuery = "";
      terminalPickerQuery = "";
      chatPickerQuery = "";
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
        if (option.id === "chat") {
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
  class="relative group rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border transition-all duration-200 {isShellCommand(value) ? 'bg-[#1a1b26] border-[#3d59a1] focus-within:border-[#7aa2f7] shadow-[0_8px_30px_rgb(0,0,0,0.3)]' : 'bg-white focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)]'} {isDraggingOver ? 'border-blue-400 bg-blue-50/30' : isShellCommand(value) ? '' : 'border-gray-200 focus-within:border-gray-300'}"
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={handleDragOver}
  ondrop={handleDrop}
>
  {#if isDraggingOver}
    <div class="absolute inset-0 flex items-center justify-center bg-blue-50/80 rounded-xl z-10 pointer-events-none">
      <div class="flex items-center gap-2 text-blue-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
        <span class="text-sm font-medium">Drop files to attach</span>
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
            <span class="bg-blue-100 text-blue-700 rounded-md px-0.5 -mx-0.5 box-decoration-clone">{segment.text}</span>
          {:else if segment.type === "terminal"}
            <span class="bg-green-100 text-green-700 rounded-md px-0.5 -mx-0.5 box-decoration-clone">{segment.text}</span>
          {:else if segment.type === "file"}
            <span class="bg-purple-100 text-purple-700 rounded-md px-0.5 -mx-0.5 box-decoration-clone">{segment.text}</span>
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
      placeholder={loading ? (queuedCount > 0 ? `${queuedCount} message${queuedCount > 1 ? 's' : ''} queued...` : "Type to queue message...") : "Message Claude... (@ files, @terminal, @chat, ! shell)"}
      {disabled}
      class="w-full bg-transparent border-none rounded-xl pl-4 pr-24 {isShellCommand(value) ? 'pt-8 text-[#c0caf5] placeholder-[#565f89] font-mono' : 'pt-3.5 placeholder-gray-400'} pb-3.5 focus:outline-none focus:ring-0 resize-none min-h-[56px] text-[15px] disabled:opacity-50 overflow-y-auto relative z-[1]"
      rows="1"
      style={!isShellCommand(value) && highlightedSegments.some(s => s.type !== "text") ? "color: transparent; caret-color: #111;" : "color: #111;"}
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
          class="p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-all"
          title="Stop generation"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>
        </button>
      {:else}
        <button
          onclick={handleSubmit}
          disabled={disabled || !value.trim()}
          class="p-1.5 rounded-lg transition-all disabled:opacity-30 {isShellCommand(value) ? 'text-[#9ece6a] hover:bg-[#9ece6a]/20' : 'text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 disabled:hover:bg-transparent'}"
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
      <div class="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
        <!-- Special options (chat, terminal) -->
        {#if filteredSpecialOptions.length > 0}
          <div class="px-3 py-1.5 border-b border-gray-100 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            Reference
          </div>
          {#each filteredSpecialOptions as option, i}
            <button
              onclick={() => selectSpecialOption(option)}
              class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 {i === filePickerIndex ? (option.color === 'blue' ? 'bg-blue-50' : 'bg-green-50') : ''}"
            >
              {#if option.id === "chat"}
                <svg class="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
              {:else}
                <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
              {/if}
              <div class="min-w-0 flex-1">
                <div class="text-sm text-gray-900">@{option.label}</div>
                <div class="text-xs text-gray-400">{option.description}</div>
              </div>
            </button>
          {/each}
        {/if}

        <!-- Files -->
        {#if filteredFiles.length > 0 || availableFiles.length === 0}
          <div class="px-3 py-1.5 border-b border-t border-gray-100 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            Files
          </div>
        {/if}
        {#each filteredFiles as file, i}
          {@const adjustedIndex = i + filteredSpecialOptions.length}
          <button
            onclick={() => selectFile(file)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 {adjustedIndex === filePickerIndex ? 'bg-blue-50' : ''}"
          >
            <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 truncate">{file.name}</div>
              <div class="text-xs text-gray-400 truncate">{file.path.replace(projectPath || "", "")}</div>
            </div>
          </button>
        {/each}
        {#if filteredFiles.length === 0 && filteredSpecialOptions.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 text-center">
            {availableFiles.length === 0 ? "Loading files..." : "No matching files"}
          </div>
        {/if}
      </div>
    {/if}

    {#if showTerminalPicker}
      <div class="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
        <div class="px-3 py-2 border-b border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          Active Terminals
        </div>
        {#each filteredTerminals as terminal, i}
          <button
            onclick={() => selectTerminal(terminal)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 {i === terminalPickerIndex ? 'bg-green-50' : ''}"
          >
            <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 truncate">{terminal.name}</div>
              <div class="text-xs text-gray-400 truncate font-mono">
                {terminal.cwd ? terminal.cwd.split('/').slice(-2).join('/') : terminal.terminalId}
              </div>
            </div>
            {#if terminal.pid}
              <span class="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-mono">PID {terminal.pid}</span>
            {/if}
          </button>
        {/each}
        {#if filteredTerminals.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 text-center">
            {availableTerminals.length === 0 ? "Loading terminals..." : "No active terminals"}
          </div>
        {/if}
      </div>
    {/if}

    {#if showChatPicker}
      <div class="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
        <div class="px-3 py-2 border-b border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
          </svg>
          Recent Chats
        </div>
        {#each filteredChats as chat, i}
          <button
            onclick={() => selectChat(chat)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 {i === chatPickerIndex ? 'bg-blue-50' : ''}"
          >
            <svg class="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 truncate">{chat.title}</div>
              <div class="text-xs text-gray-400 truncate">
                {chat.messageCount} messages
              </div>
            </div>
          </button>
        {/each}
        {#if filteredChats.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 text-center">
            {availableChats.length === 0 ? "Loading chats..." : "No matching chats"}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Skills bar - inside input box -->
  {#if activeSkills.length > 0 || !isShellCommand(value)}
    <div class="border-t {isShellCommand(value) ? 'border-[#3d59a1]/30' : 'border-gray-100'} px-3 py-2 flex items-center justify-between">
      <div class="flex items-center gap-2 flex-wrap">
        {#if activeSkills.length > 0}
          <div class="flex items-center gap-1 text-purple-500">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          {#each activeSkills.slice(0, 4) as skill}
            <button
              onclick={() => onManageSkills?.()}
              class="group relative flex items-center gap-1.5 text-[11px] pl-2 pr-2.5 py-1 bg-gradient-to-r from-purple-50 to-fuchsia-50 text-purple-700 rounded-full font-medium border border-purple-200/60 hover:border-purple-300 hover:from-purple-100 hover:to-fuchsia-100 hover:shadow-sm transition-all duration-150 cursor-pointer"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-500 group-hover:scale-110 transition-transform"></span>
              <span class="truncate max-w-[120px]">{skill.name}</span>
            </button>
          {/each}
          {#if activeSkills.length > 4}
            <button
              onclick={() => onManageSkills?.()}
              class="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full font-medium border border-gray-200 hover:bg-gray-150 hover:border-gray-300 transition-all duration-150 cursor-pointer"
            >
              <span>+{activeSkills.length - 4}</span>
            </button>
          {/if}
        {:else}
          <div class="flex items-center gap-1.5 text-gray-400">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            <span class="text-[11px]">No skills active</span>
          </div>
        {/if}
      </div>

      <div class="flex items-center gap-1.5">
        <!-- Until Done toggle -->
        <button
          onclick={() => onToggleUntilDone?.()}
          class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full transition-all duration-150 font-medium border {untilDoneEnabled ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200/60 hover:border-emerald-300 hover:from-emerald-100 hover:to-teal-100' : 'text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-50 hover:border-gray-300'}"
          title={untilDoneEnabled ? 'Until Done mode: ON - Claude will keep working until task is complete' : 'Until Done mode: OFF - Click to enable auto-continue'}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          <span>{untilDoneEnabled ? 'Loop' : 'Loop'}</span>
        </button>

        <button
          onclick={() => onManageSkills?.()}
          class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full transition-all duration-150 font-medium border text-gray-500 border-gray-200 hover:text-purple-600 hover:bg-purple-50 hover:border-purple-200"
          title="Manage skills"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          <span>Edit</span>
        </button>

        {#if activeSkills.length > 0}
          <div class="relative">
            <button
              onclick={() => showSkillsMenu = !showSkillsMenu}
              class="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all duration-150"
              title="View all skills"
            >
              <svg class="w-4 h-4 transition-transform duration-150 {showSkillsMenu ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            {#if showSkillsMenu}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="fixed inset-0 z-40"
                onclick={() => showSkillsMenu = false}
              ></div>
              <div class="absolute bottom-full right-0 mb-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl py-2 z-50">
                <div class="px-3 py-2 text-[11px] text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100 flex items-center gap-2">
                  <svg class="w-3.5 h-3.5 text-purple-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  Active Skills ({activeSkills.length})
                </div>
                <div class="py-1">
                  {#each activeSkills as skill}
                    <div class="px-3 py-2 text-sm text-gray-700 flex items-center gap-2.5 hover:bg-gray-50 transition-colors">
                      <span class="w-2 h-2 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-500 flex-shrink-0"></span>
                      <span class="truncate">{skill.name}</span>
                    </div>
                  {/each}
                </div>
                <div class="border-t border-gray-100 pt-2 px-2">
                  <button
                    onclick={() => { showSkillsMenu = false; onManageSkills?.(); }}
                    class="w-full px-3 py-2 text-left text-sm text-purple-600 hover:bg-purple-50 rounded-lg flex items-center gap-2.5 transition-colors font-medium"
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
        {/if}
      </div>
    </div>
  {/if}
</div>
