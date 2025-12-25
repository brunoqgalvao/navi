<script lang="ts">
  import { attachedFiles, type AttachedFile } from "../stores";
  import FileAttachment from "./FileAttachment.svelte";
  import AudioRecorder from "./AudioRecorder.svelte";

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
  }

  let { value = $bindable(), disabled = false, loading = false, queuedCount = 0, projectPath, activeSkills = [], onSubmit, onStop }: Props = $props();

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
      const res = await fetch(`http://localhost:3001/api/fs/list?path=${encodeURIComponent(currentPath)}`);
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
      onSubmit();
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
  }

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
          const res = await fetch("http://localhost:3001/api/fs/upload", {
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
          const res = await fetch("http://localhost:3001/api/fs/upload", {
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
  class="relative group bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border transition-shadow focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] {isDraggingOver ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 focus-within:border-gray-300'}" 
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

  {#if $attachedFiles.length > 0}
    <div class="px-3 pt-2 pb-1">
      <FileAttachment 
        files={$attachedFiles} 
        removable={true} 
        onRemove={removeAttachedFile}
        size="sm"
      />
    </div>
  {/if}

  <div class="relative">
    <textarea
      bind:this={inputRef}
      bind:value
      onkeydown={handleKeydown}
      oninput={handleInput}
      onpaste={handlePaste}
      placeholder={loading ? (queuedCount > 0 ? `${queuedCount} message${queuedCount > 1 ? 's' : ''} queued...` : "Type to queue message...") : "Message Claude... (@ to attach files)"}
      {disabled}
      class="w-full bg-transparent text-gray-900 placeholder-gray-400 border-none rounded-xl pl-4 pr-24 py-3.5 focus:outline-none focus:ring-0 resize-none max-h-48 min-h-[56px] text-[15px] disabled:opacity-50"
      rows="1"
    ></textarea>

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
  
  <div class="absolute right-2 bottom-2 flex items-center gap-1">
    <AudioRecorder 
      bind:this={audioRecorderRef}
      onTranscript={(text) => { value = value ? value + " " + text : text; }}
      {disabled}
    />
    {#if loading}
      {#if queuedCount > 0}
        <span class="text-xs text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg font-medium">
          {queuedCount} queued
        </span>
      {/if}
      <button
        onclick={onStop}
        class="p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-all"
        title="Stop generation"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>
      </button>
    {:else}
      <button
        onclick={onSubmit}
        disabled={disabled || !value.trim()}
        class="p-1.5 text-gray-400 bg-transparent rounded-lg hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"></path>
        </svg>
      </button>
    {/if}
  </div>

  {#if activeSkills.length > 0}
    <div class="absolute -bottom-6 left-3 flex items-center gap-1">
      {#each activeSkills.slice(0, 3) as skill}
        <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium">{skill.name}</span>
      {/each}
      {#if activeSkills.length > 3}
        <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">+{activeSkills.length - 3}</span>
      {/if}
    </div>
  {/if}
</div>
