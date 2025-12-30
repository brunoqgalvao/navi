<script lang="ts">
  import { attachedFiles, textReferences, type AttachedFile } from "../stores";
  import FileAttachment from "./FileAttachment.svelte";
  import ReferenceChip from "./ReferenceChip.svelte";
  import AudioRecorder from "./AudioRecorder.svelte";
  import { getApiBase } from "../config";

  interface FileEntry {
    name: string;
    path: string;
    type: "file" | "directory";
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
    onSubmit: () => void;
    onStop?: () => void;
    onPreview?: (path: string) => void;
    onExecCommand?: (command: string) => void;
    onManageSkills?: () => void;
  }

  let { value = $bindable(), disabled = false, loading = false, queuedCount = 0, projectPath, activeSkills = [], onSubmit, onStop, onPreview, onExecCommand, onManageSkills }: Props = $props();

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

  function handleKeydown(e: KeyboardEvent) {
    if (showFilePicker) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        filePickerIndex = Math.min(filePickerIndex + 1, filteredFiles.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        filePickerIndex = Math.max(filePickerIndex - 1, 0);
      } else if (e.key === "Enter" && filteredFiles.length > 0) {
        e.preventDefault();
        selectFile(filteredFiles[filePickerIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeFilePicker();
      } else if (e.key === "Tab" && filteredFiles.length > 0) {
        e.preventDefault();
        selectFile(filteredFiles[filePickerIndex]);
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

    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      filePickerQuery = atMatch[1];
      filePickerIndex = 0;
      showFilePicker = true;
    } else {
      showFilePicker = false;
      filePickerQuery = "";
    }

    adjustTextareaHeight(target);
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

  {#if $attachedFiles.length > 0 || $textReferences.length > 0}
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
    </div>
  {/if}

  <div class="relative">
    {#if isShellCommand(value)}
      <div class="absolute left-3 top-2 flex items-center gap-1.5 text-[10px] font-medium text-[#7aa2f7] bg-[#1a1b26] border border-[#3d59a1] px-2 py-0.5 rounded z-10 font-mono">
        <span class="text-[#9ece6a]">$</span>
        <span>terminal</span>
      </div>
    {/if}
    <textarea
      bind:this={inputRef}
      bind:value
      onkeydown={handleKeydown}
      oninput={handleInput}
      onpaste={handlePaste}
      placeholder={loading ? (queuedCount > 0 ? `${queuedCount} message${queuedCount > 1 ? 's' : ''} queued...` : "Type to queue message...") : "Message Claude... (@ to attach files, ! for shell)"}
      {disabled}
      class="w-full bg-transparent border-none rounded-xl pl-4 pr-24 {isShellCommand(value) ? 'pt-8 text-[#c0caf5] placeholder-[#565f89] font-mono' : 'pt-3.5 text-gray-900 placeholder-gray-400'} pb-3.5 focus:outline-none focus:ring-0 resize-none min-h-[56px] text-[15px] disabled:opacity-50 overflow-y-auto"
      rows="1"
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
        <div class="px-3 py-2 border-b border-gray-100 text-xs text-gray-500 font-medium">
          Files in project
        </div>
        {#each filteredFiles as file, i}
          <button
            onclick={() => selectFile(file)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 {i === filePickerIndex ? 'bg-blue-50' : ''}"
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
        {#if filteredFiles.length === 0}
          <div class="px-3 py-4 text-sm text-gray-500 text-center">
            {availableFiles.length === 0 ? "Loading files..." : "No matching files"}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Skills bar - inside input box -->
  {#if activeSkills.length > 0 || !isShellCommand(value)}
    <div class="border-t {isShellCommand(value) ? 'border-[#3d59a1]/30' : 'border-gray-100'} px-3 py-1.5 flex items-center justify-between">
      <div class="flex items-center gap-1.5 flex-wrap">
        {#if activeSkills.length > 0}
          <svg class="w-3 h-3 text-purple-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {#each activeSkills.slice(0, 4) as skill}
            <span class="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded font-medium border border-purple-100">{skill.name}</span>
          {/each}
          {#if activeSkills.length > 4}
            <span class="text-[10px] px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded border border-gray-100">+{activeSkills.length - 4}</span>
          {/if}
        {:else}
          <svg class="w-3 h-3 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <span class="text-[10px] text-gray-400">No skills active</span>
        {/if}
      </div>

      <div class="flex items-center gap-1">
        <button
          onclick={() => onManageSkills?.()}
          class="flex items-center gap-1 px-2 py-0.5 text-[10px] text-purple-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors font-medium"
          title="Manage skills"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          {activeSkills.length > 0 ? 'Edit' : 'Add'}
        </button>

        {#if activeSkills.length > 0}
          <div class="relative">
            <button
              onclick={() => showSkillsMenu = !showSkillsMenu}
              class="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="View all skills"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            {#if showSkillsMenu}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="fixed inset-0 z-40"
                onclick={() => showSkillsMenu = false}
              ></div>
              <div class="absolute bottom-full right-0 mb-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                <div class="px-3 py-1.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide border-b border-gray-100">
                  Active Skills ({activeSkills.length})
                </div>
                {#each activeSkills as skill}
                  <div class="px-3 py-1.5 text-xs text-gray-600 flex items-center gap-2">
                    <span class="w-1.5 h-1.5 bg-purple-400 rounded-full flex-shrink-0"></span>
                    <span class="truncate">{skill.name}</span>
                  </div>
                {/each}
                <div class="border-t border-gray-100 mt-1 pt-1">
                  <button
                    onclick={() => { showSkillsMenu = false; onManageSkills?.(); }}
                    class="w-full px-3 py-1.5 text-left text-xs text-purple-600 hover:bg-purple-50 flex items-center gap-2"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
