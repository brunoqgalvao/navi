<script lang="ts">
  import { marked } from "marked";
  import hljs from "highlight.js";
  import * as XLSX from "xlsx";
  import { jsPDF } from "jspdf";
  import html2canvas from "html2canvas";
  import MermaidRenderer from "./components/MermaidRenderer.svelte";
  import JsonTreeViewer from "./components/JsonTreeViewer.svelte";
  import ContextMenu from "./components/ContextMenu.svelte";
  import STLViewer from "./components/STLViewer.svelte";
  import GLBViewer from "./components/GLBViewer.svelte";
  import LogViewer from "./components/LogViewer.svelte";
  import CodeEditor from "./components/CodeEditor.svelte";
  import { api } from "./api";
  import { getApiBase } from "./config";
  import { textReferences } from "./stores";
  import type { TextReference } from "./stores/types";
  import { showSuccess, showError } from "./errorHandler";

  type PreviewType = "file" | "markdown" | "code" | "image" | "pdf" | "audio" | "video" | "csv" | "xlsx" | "json" | "stl" | "glb" | "logs" | "directory" | "none";

  interface Props {
    source: string;
    type?: PreviewType;
    onClose?: () => void;
    // Start in edit mode when opening file
    startInEditMode?: boolean;
  }

  let {
    source,
    type = "none",
    onClose,
    startInEditMode = false,
  }: Props = $props();

  let content = $state("");
  let loading = $state(false);
  let error = $state("");
  let detectedType = $state<PreviewType>("none");
  let mediaKey = $state(Date.now()); // Cache-busting for images/media

  // Edit mode state
  let isEditMode = $state(false);
  let isSaving = $state(false);
  let hasUnsavedChanges = $state(false);
  let editedContent = $state("");

  // Initialize editedContent when content loads and we're in edit mode
  $effect(() => {
    if (isEditMode && content && !editedContent) {
      editedContent = content;
    }
  });

  // Context menu state for text references
  interface SelectionInfo {
    text: string;
    type: "code" | "csv" | "xlsx" | "json" | "markdown" | "text";
    startLine?: number;
    endLine?: number;
    rows?: [number, number];
    columns?: string[];
    jsonPath?: string;
    sheet?: string;
  }
  let contextMenu = $state<{ x: number; y: number; selection: SelectionInfo } | null>(null);

  const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
  const audioExtensions = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"];
  const videoExtensions = ["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv"];
  const csvExtensions = ["csv", "tsv"];
  const xlsxExtensions = ["xlsx", "xls", "xlsm", "xlsb"];
  const codeExtensions = ["js", "ts", "jsx", "tsx", "svelte", "vue", "py", "rs", "go", "java", "c", "cpp", "h", "css", "scss", "sass", "less", "html", "xml", "yaml", "yml", "toml", "sh", "bash", "zsh", "sql", "graphql", "prisma"];
  const jsonExtensions = ["json"];
  const markdownExtensions = ["md", "mdx", "markdown"];
  const pdfExtensions = ["pdf"];
  const stlExtensions = ["stl"];
  const glbExtensions = ["glb", "gltf"];

  function detectType(src: string): PreviewType {
    if (!src) return "none";

    // Check for logs: prefix (e.g., "logs:process-id" or "logs:terminal:terminal-id")
    if (src.startsWith("logs:")) {
      return "logs";
    }

    const ext = src.split(".").pop()?.toLowerCase() || "";
    
    if (imageExtensions.includes(ext)) return "image";
    if (audioExtensions.includes(ext)) return "audio";
    if (videoExtensions.includes(ext)) return "video";
    if (csvExtensions.includes(ext)) return "csv";
    if (xlsxExtensions.includes(ext)) return "xlsx";
    if (pdfExtensions.includes(ext)) return "pdf";
    if (stlExtensions.includes(ext)) return "stl";
    if (glbExtensions.includes(ext)) return "glb";
    if (markdownExtensions.includes(ext)) return "markdown";
    if (jsonExtensions.includes(ext)) return "json";
    if (codeExtensions.includes(ext)) return "code";
    
    return "file";
  }

  function getLanguage(ext: string): string {
    const map: Record<string, string> = {
      js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
      py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp",
      svelte: "html", vue: "html", html: "html", xml: "xml",
      css: "css", scss: "scss", sass: "sass", less: "less",
      json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
      sh: "bash", bash: "bash", zsh: "bash", sql: "sql",
      md: "markdown", mdx: "markdown", graphql: "graphql", prisma: "prisma"
    };
    return map[ext] || "plaintext";
  }

  async function loadFile(path: string) {
    loading = true;
    error = "";
    try {
      // Extract line number from fragment if present
      const [filePath, fragment] = path.split('#');
      const lineNumber = fragment?.startsWith('line') ? parseInt(fragment.slice(4), 10) : null;

      const res = await fetch(`${getApiBase()}/fs/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.error) {
        // If file read fails, try loading as directory
        const dirRes = await fetch(`${getApiBase()}/fs/list?path=${encodeURIComponent(filePath)}`);
        const dirData = await dirRes.json();
        if (!dirData.error && dirData.entries) {
          // It's a directory - switch to directory mode
          dirEntries = dirData.entries || [];
          detectedType = "directory";
          error = "";
        } else {
          error = data.error;
        }
      } else {
        content = data.content;
        // Scroll to line after content is rendered
        if (lineNumber) {
          setTimeout(() => scrollToLine(lineNumber), 100);
        }
      }
    } catch (e) {
      error = "Failed to load file";
    } finally {
      loading = false;
    }
  }

  async function loadDirectory(path: string) {
    loading = true;
    error = "";
    try {
      const res = await fetch(`${getApiBase()}/fs/list?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) {
        error = data.error;
      } else {
        dirEntries = data.entries || [];
      }
    } catch (e) {
      error = "Failed to load directory";
    } finally {
      loading = false;
    }
  }

  function scrollToLine(lineNumber: number) {
    try {
      // Find the preview container
      const previewElement = document.querySelector('.preview-content pre');
      if (!previewElement) return;

      // Calculate the approximate line height and scroll position
      const lineHeight = 24; // Approximate line height in pixels
      const scrollPosition = (lineNumber - 1) * lineHeight;

      // Scroll to the line
      previewElement.scrollTo({
        top: scrollPosition,
        behavior: 'smooth'
      });

      // Optionally, try to find and highlight the specific line
      const codeElement = previewElement.querySelector('code');
      if (codeElement) {
        const lines = codeElement.textContent?.split('\n') || [];
        if (lineNumber <= lines.length) {
          // Add a temporary highlight class to make the line visible
          setTimeout(() => {
            const lineElements = previewElement.querySelectorAll('.hljs-ln-line');
            if (lineElements[lineNumber - 1]) {
              (lineElements[lineNumber - 1] as HTMLElement).style.backgroundColor = 'rgba(250, 204, 21, 0.15)';
              setTimeout(() => {
                (lineElements[lineNumber - 1] as HTMLElement).style.backgroundColor = '';
              }, 2000);
            }
          }, 200);
        }
      }
    } catch (e) {
      console.warn('Failed to scroll to line:', e);
    }
  }

  function renderMarkdown(md: string): string {
    return marked(md) as string;
  }

  function highlightCode(code: string, ext: string): string {
    const lang = getLanguage(ext);
    if (hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  }

  let csvData = $state<string[][]>([]);
  let csvHeaders = $state<string[]>([]);

  // Directory contents state
  interface DirEntry {
    name: string;
    type: "file" | "directory";
    path: string;
  }
  let dirEntries = $state<DirEntry[]>([]);

  // Excel/XLSX support
  let xlsxData = $state<string[][]>([]);
  let xlsxHeaders = $state<string[]>([]);
  let xlsxSheets = $state<string[]>([]);
  let xlsxActiveSheet = $state<string>("");

  async function loadXlsxFile(path: string) {
    loading = true;
    error = "";
    try {
      // Fetch the file as binary
      const res = await fetch(`${getApiBase()}/fs/read-binary?path=${encodeURIComponent(path)}`);
      const arrayBuffer = await res.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      xlsxSheets = workbook.SheetNames;
      xlsxActiveSheet = workbook.SheetNames[0] || "";

      if (xlsxActiveSheet) {
        parseXlsxSheet(workbook, xlsxActiveSheet);
      }
    } catch (e) {
      error = "Failed to load Excel file";
      console.error("XLSX load error:", e);
    } finally {
      loading = false;
    }
  }

  function parseXlsxSheet(workbook: XLSX.WorkBook, sheetName: string) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (jsonData.length > 0) {
      xlsxHeaders = (jsonData[0] || []).map((h, i) => String(h || `Column ${i + 1}`));
      xlsxData = jsonData.slice(1).map(row =>
        Array.isArray(row) ? row.map(cell => String(cell ?? "")) : []
      );
    } else {
      xlsxHeaders = [];
      xlsxData = [];
    }
  }

  function switchXlsxSheet(sheetName: string) {
    xlsxActiveSheet = sheetName;
    // Re-parse the sheet - need to reload the workbook
    loading = true;
    fetch(`${getApiBase()}/fs/read-binary?path=${encodeURIComponent(source)}`)
      .then(res => res.arrayBuffer())
      .then(arrayBuffer => {
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        parseXlsxSheet(workbook, sheetName);
      })
      .catch(() => { error = "Failed to switch sheet"; })
      .finally(() => { loading = false; });
  }

  function parseCSV(text: string, delimiter = ","): { headers: string[]; rows: string[][] } {
    const lines = text.trim().split("\n");
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(parseRow);
    return { headers, rows };
  }

  // Export markdown as PDF
  let isExporting = $state(false);

  // Fullscreen mode state
  let isFullscreen = $state(false);

  async function exportAsPdf() {
    const previewContent = document.querySelector('.markdown-preview') as HTMLElement;
    if (!previewContent || isExporting) return;

    isExporting = true;
    const fileName = source.split('/').pop()?.replace(/\.(md|mdx|markdown)$/i, '') || 'document';

    try {
      // Render the content to canvas
      const canvas = await html2canvas(previewContent, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Create PDF with proper dimensions
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Save and open
      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      isExporting = false;
    }
  }

  // Edit mode functions
  function canEdit(): boolean {
    return detectedType === "code" || detectedType === "file" || detectedType === "json" || detectedType === "markdown";
  }

  function toggleEditMode() {
    if (isEditMode) {
      // Exiting edit mode
      if (hasUnsavedChanges) {
        const confirm = window.confirm("You have unsaved changes. Discard them?");
        if (!confirm) return;
      }
      isEditMode = false;
      hasUnsavedChanges = false;
      editedContent = "";
    } else {
      // Entering edit mode
      isEditMode = true;
      editedContent = content;
      hasUnsavedChanges = false;
    }
  }

  function handleEditorChange(newContent: string) {
    editedContent = newContent;
    hasUnsavedChanges = newContent !== content;
  }

  async function saveFile() {
    if (!source || isSaving) return;

    const filePath = source.split('#')[0]; // Remove line number fragment
    isSaving = true;

    try {
      await api.fs.write(filePath, editedContent);
      content = editedContent;
      hasUnsavedChanges = false;
      showSuccess("Saved", filePath.split('/').pop() || "File saved");
    } catch (e: any) {
      showError({ title: "Save failed", message: e.message || "Failed to save file" });
    } finally {
      isSaving = false;
    }
  }

  // Selection detection for text references
  function getSelection(): SelectionInfo | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    switch (detectedType) {
      case "code":
      case "file":
        return getCodeSelection(selection, text);
      case "markdown":
        return { text, type: "markdown", ...getLineNumbers(selection, text) };
      case "csv":
        return getCsvSelection(selection, text);
      case "xlsx":
        return getXlsxSelection(selection, text);
      case "json":
        return getJsonSelection(selection, text);
      default:
        return { text, type: "text" };
    }
  }

  function getLineNumbers(selection: Selection, text: string): { startLine?: number; endLine?: number } {
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const preElement = container instanceof Element
        ? container.closest("pre")
        : container.parentElement?.closest("pre");

      if (!preElement) return {};

      const fullContent = preElement.textContent || "";
      const selectionStart = fullContent.indexOf(text);
      if (selectionStart === -1) return {};

      const beforeSelection = fullContent.slice(0, selectionStart);
      const startLine = (beforeSelection.match(/\n/g) || []).length + 1;
      const endLine = startLine + (text.match(/\n/g) || []).length;

      return {
        startLine,
        endLine: endLine > startLine ? endLine : undefined,
      };
    } catch {
      return {};
    }
  }

  function getCodeSelection(selection: Selection, text: string): SelectionInfo {
    const ext = source.split(".").pop()?.toLowerCase() || "";
    const codeType = codeExtensions.includes(ext) ? "code" : "text";
    return {
      text,
      type: codeType as "code" | "text",
      ...getLineNumbers(selection, text),
    };
  }

  function getCsvSelection(selection: Selection, text: string): SelectionInfo {
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const cell = container instanceof Element
        ? container.closest("td")
        : container.parentElement?.closest("td");

      if (!cell) return { text, type: "csv" };

      const row = cell.closest("tr");
      const table = cell.closest("table");
      if (!row || !table) return { text, type: "csv" };

      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const rowIndex = rows.indexOf(row as HTMLTableRowElement) + 1;

      const cellIndex = Array.from(row.cells).indexOf(cell as HTMLTableCellElement);
      const headerCell = table.querySelector(`thead th:nth-child(${cellIndex + 1})`);
      const columnName = headerCell?.textContent || `Column ${cellIndex}`;

      return {
        text,
        type: "csv",
        rows: [rowIndex, rowIndex],
        columns: [columnName],
      };
    } catch {
      return { text, type: "csv" };
    }
  }

  function getXlsxSelection(selection: Selection, text: string): SelectionInfo {
    const result = getCsvSelection(selection, text);
    return {
      ...result,
      type: "xlsx",
      sheet: xlsxActiveSheet || undefined,
    };
  }

  function getJsonSelection(selection: Selection, text: string): SelectionInfo {
    // JSON path detection is complex - for now just capture the text
    // Could enhance later to walk DOM and build path
    return { text, type: "json" };
  }

  function handlePreviewContextMenu(e: MouseEvent) {
    const selection = getSelection();
    if (selection) {
      e.preventDefault();
      contextMenu = { x: e.clientX, y: e.clientY, selection };
    }
  }

  function handleReferenceInChat() {
    if (!contextMenu) return;

    const ref: TextReference = {
      id: crypto.randomUUID(),
      text: contextMenu.selection.text,
      truncatedText:
        contextMenu.selection.text.slice(0, 50) +
        (contextMenu.selection.text.length > 50 ? "..." : ""),
      source: {
        type: contextMenu.selection.type,
        path: source,
        startLine: contextMenu.selection.startLine,
        endLine: contextMenu.selection.endLine,
        rows: contextMenu.selection.rows,
        columns: contextMenu.selection.columns,
        jsonPath: contextMenu.selection.jsonPath,
        sheet: contextMenu.selection.sheet,
      },
    };

    textReferences.add(ref);
    contextMenu = null;
    window.getSelection()?.removeAllRanges();
  }

  function getContextMenuItems() {
    return [
      {
        label: "Reference in Chat",
        icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>`,
        onclick: handleReferenceInChat,
      },
      {
        label: "Copy",
        icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`,
        onclick: () => {
          navigator.clipboard.writeText(contextMenu?.selection.text || "");
          contextMenu = null;
        },
      },
    ];
  }

  let lastSource = "";

  $effect(() => {
    if (!source) {
      detectedType = "none";
      content = "";
      lastSource = "";
      // Reset edit mode when source is cleared
      isEditMode = false;
      hasUnsavedChanges = false;
      editedContent = "";
      return;
    }

    // Handle file change - reset edit mode unless startInEditMode is set
    if (source !== lastSource) {
      hasUnsavedChanges = false;
      editedContent = "";
      // If startInEditMode is true, enter edit mode for the new file
      // Otherwise reset to preview mode
      isEditMode = startInEditMode && (detectType(source) === "code" || detectType(source) === "file" || detectType(source) === "json" || detectType(source) === "markdown");
    }

    detectedType = type !== "none" ? type : detectType(source);

    if (detectedType === "csv") {
      if (source !== lastSource) {
        lastSource = source;
        loading = true;
        error = "";
        fetch(`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}`)
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              error = data.error;
            } else {
              const delimiter = source.endsWith(".tsv") ? "\t" : ",";
              const parsed = parseCSV(data.content, delimiter);
              csvHeaders = parsed.headers;
              csvData = parsed.rows;
            }
          })
          .catch(() => { error = "Failed to load file"; })
          .finally(() => { loading = false; });
      }
    } else if (detectedType === "xlsx") {
      if (source !== lastSource) {
        lastSource = source;
        loadXlsxFile(source);
      }
    } else if (detectedType === "markdown" || detectedType === "code" || detectedType === "json" || detectedType === "file") {
      if (source !== lastSource) {
        lastSource = source;
        loadFile(source);
      }
    } else if (detectedType === "image" || detectedType === "pdf" || detectedType === "audio" || detectedType === "video" || detectedType === "stl" || detectedType === "glb") {
      content = source;
      lastSource = source;
    }
  });
</script>

<div class="h-full flex flex-col bg-white">
    <div class="h-12 px-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50 shrink-0">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <div class="p-1.5 bg-white border border-gray-200 rounded shadow-sm">
          {#if detectedType === "pdf"}
            <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
          {:else if detectedType === "image"}
            <svg class="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          {:else if detectedType === "audio"}
            <svg class="w-3.5 h-3.5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
          {:else if detectedType === "video"}
            <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
          {:else if detectedType === "csv"}
            <svg class="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
          {:else if detectedType === "markdown"}
            <svg class="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          {:else if detectedType === "stl"}
            <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"></path></svg>
          {:else if detectedType === "glb"}
            <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
          {:else if detectedType === "directory"}
            <svg class="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"></path></svg>
          {:else}
            <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
          {/if}
        </div>
        <span class="text-xs text-gray-600 truncate font-mono">{source || "No preview"}</span>
        {#if isEditMode && hasUnsavedChanges}
          <span class="text-xs text-amber-600 font-medium ml-2">Modified</span>
        {/if}
      </div>

      <div class="flex items-center gap-1">
        <!-- Edit/Save buttons for editable files -->
        {#if canEdit() && content}
          {#if isEditMode}
            <button
              onclick={saveFile}
              disabled={isSaving || !hasUnsavedChanges}
              class="px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 {hasUnsavedChanges ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400'} disabled:opacity-50"
              title="Save (Cmd+S)"
            >
              {#if isSaving}
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              {:else}
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
              {/if}
              Save
            </button>
            <button
              onclick={toggleEditMode}
              class="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              title="Exit edit mode"
            >
              Done
            </button>
          {:else}
            <button
              onclick={toggleEditMode}
              class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Edit file"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
          {/if}
        {/if}
        {#if detectedType === "markdown" && content && !isEditMode}
          <button
            onclick={exportAsPdf}
            disabled={isExporting}
            class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-wait"
            title="Export as PDF"
          >
            {#if isExporting}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            {/if}
          </button>
        {/if}
        {#if source && detectedType !== "none"}
          <button
            onclick={() => isFullscreen = true}
            class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded transition-colors"
            title="Fullscreen (expand)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
          </button>
          <button
            onclick={() => api.fs.reveal(source.split('#')[0])}
            class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded transition-colors"
            title="Open in Finder"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
          </button>
        {/if}
        {#if onClose}
          <button onclick={onClose} class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded transition-colors" title="Close preview">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        {/if}
      </div>
    </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex-1 overflow-auto min-h-0 flex flex-col" oncontextmenu={handlePreviewContextMenu}>
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="flex items-center gap-2 text-gray-400">
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <span class="text-sm">Loading...</span>
        </div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center h-full">
        <div class="text-center p-8">
          <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <p class="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    {:else if detectedType === "none" || !source}
      <div class="flex items-center justify-center h-full">
        <div class="text-center p-8">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
          </div>
          <p class="text-sm text-gray-500 mb-1">No preview</p>
          <p class="text-xs text-gray-400">Select a file to preview</p>
        </div>
      </div>
    {:else if detectedType === "pdf"}
      <div class="relative w-full h-full">
        <button
          onclick={() => mediaKey = Date.now()}
          class="absolute top-2 right-2 z-10 p-1.5 bg-white/80 hover:bg-white text-gray-500 hover:text-gray-700 rounded-lg shadow-sm transition-colors"
          title="Refresh PDF"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        </button>
        <iframe
          src={`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}&raw=true&_t=${mediaKey}`}
          class="w-full h-full border-0"
          title="PDF Preview"
        ></iframe>
      </div>
    {:else if detectedType === "image"}
      <div class="relative flex items-center justify-center h-full p-4 bg-[#f5f5f5]" style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><rect width=%2220%22 height=%2220%22 fill=%22%23f5f5f5%22/><rect width=%2210%22 height=%2210%22 fill=%22%23e5e5e5%22/><rect x=%2210%22 y=%2210%22 width=%2210%22 height=%2210%22 fill=%22%23e5e5e5%22/></svg>')">
        <!-- Refresh button -->
        <button
          onclick={() => mediaKey = Date.now()}
          class="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-white text-gray-500 hover:text-gray-700 rounded-lg shadow-sm transition-colors"
          title="Refresh image"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        </button>
        {#key mediaKey}
          <img src={`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}&raw=true&_t=${mediaKey}`} alt="Preview" class="max-w-full max-h-full object-contain shadow-lg rounded" />
        {/key}
      </div>
    {:else if detectedType === "audio"}
      <div class="flex flex-col items-center justify-center h-full gap-5 p-8 bg-gray-50">
        <div class="w-20 h-20 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center">
          <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
        </div>
        <div class="text-center">
          <p class="text-sm font-medium text-gray-700 mb-0.5">{source.split('/').pop()}</p>
          <p class="text-xs text-gray-400">Audio</p>
        </div>
        <audio
          controls
          src={`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}&raw=true&_t=${mediaKey}`}
          class="w-full max-w-sm"
        >
          Your browser does not support the audio element.
        </audio>
      </div>
    {:else if detectedType === "video"}
      <div class="flex flex-col h-full bg-black">
        <video
          controls
          src={`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}&raw=true&_t=${mediaKey}`}
          class="flex-1 w-full h-full object-contain"
        >
          Your browser does not support the video element.
        </video>
        <div class="px-3 py-2 bg-gray-900">
          <span class="text-xs text-gray-400 truncate">{source.split('/').pop()}</span>
        </div>
      </div>
    {:else if detectedType === "stl"}
      <div class="flex-1 min-h-0">
        <STLViewer src={`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}&raw=true&_t=${mediaKey}`} />
      </div>
    {:else if detectedType === "glb"}
      <div class="flex-1 min-h-0">
        <GLBViewer src={`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}&raw=true&_t=${mediaKey}`} />
      </div>
    {:else if detectedType === "logs"}
      {@const logSource = source.replace(/^logs:/, "")}
      {@const isTerminal = logSource.startsWith("terminal:")}
      {@const sourceId = isTerminal ? logSource.replace(/^terminal:/, "") : logSource}
      <div class="flex-1 min-h-0">
        <LogViewer {sourceId} sourceType={isTerminal ? "terminal" : "process"} onClose={onClose} />
      </div>
    {:else if detectedType === "directory"}
      <div class="h-full overflow-auto">
        <div class="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between sticky top-0">
          <span class="text-xs text-gray-500">{dirEntries.length} items</span>
          <span class="text-xs text-yellow-600 font-medium">Folder</span>
        </div>
        <div class="p-2">
          {#if dirEntries.length === 0}
            <div class="flex items-center justify-center h-32 text-gray-400 text-sm">Empty folder</div>
          {:else}
            <div class="space-y-px">
              {#each dirEntries as entry}
                <button
                  onclick={() => {
                    // Navigate to this item
                    if (entry.type === "directory") {
                      loadDirectory(entry.path);
                      // Update source to reflect the new path - but we don't control source externally
                      // So we just load and display it
                    }
                    // For files, we don't have onPreview callback here - Preview is meant to display, not navigate
                  }}
                  class="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 transition-colors text-left"
                >
                  {#if entry.type === "directory"}
                    <svg class="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"></path>
                    </svg>
                  {:else}
                    <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                  {/if}
                  <span class="text-sm text-gray-700 truncate">{entry.name}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {:else if detectedType === "csv"}
      <div class="h-full overflow-auto">
        <div class="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between sticky top-0">
          <span class="text-xs text-gray-500">{csvData.length} rows × {csvHeaders.length} columns</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead class="bg-gray-50 sticky top-[41px]">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b border-gray-200 bg-gray-100 w-12">#</th>
                {#each csvHeaders as header, i}
                  <th class="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200 bg-gray-50 whitespace-nowrap">{header || `Column ${i + 1}`}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each csvData as row, rowIndex}
                <tr class="hover:bg-blue-50/50 transition-colors {rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}">
                  <td class="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 font-mono">{rowIndex + 1}</td>
                  {#each row as cell}
                    <td class="px-3 py-1.5 text-gray-700 border-b border-gray-100 whitespace-nowrap max-w-xs truncate" title={cell}>{cell}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if csvData.length === 0 && !loading}
          <div class="flex items-center justify-center h-32 text-gray-400 text-sm">No data</div>
        {/if}
      </div>
    {:else if detectedType === "xlsx"}
      <div class="h-full overflow-auto">
        <div class="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between sticky top-0 z-10">
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-500">{xlsxData.length} rows × {xlsxHeaders.length} columns</span>
            {#if xlsxSheets.length > 1}
              <select
                class="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                value={xlsxActiveSheet}
                onchange={(e) => switchXlsxSheet((e.target as HTMLSelectElement).value)}
              >
                {#each xlsxSheets as sheet}
                  <option value={sheet}>{sheet}</option>
                {/each}
              </select>
            {:else if xlsxSheets.length === 1}
              <span class="text-xs text-gray-400">Sheet: {xlsxActiveSheet}</span>
            {/if}
          </div>
          <span class="text-xs text-green-600 font-medium">Excel</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead class="bg-gray-50 sticky top-[41px]">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b border-gray-200 bg-gray-100 w-12">#</th>
                {#each xlsxHeaders as header, i}
                  <th class="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200 bg-gray-50 whitespace-nowrap">{header || `Column ${i + 1}`}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each xlsxData as row, rowIndex}
                <tr class="hover:bg-green-50/50 transition-colors {rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}">
                  <td class="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 font-mono">{rowIndex + 1}</td>
                  {#each row as cell}
                    <td class="px-3 py-1.5 text-gray-700 border-b border-gray-100 whitespace-nowrap max-w-xs truncate" title={cell}>{cell}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if xlsxData.length === 0 && !loading}
          <div class="flex items-center justify-center h-32 text-gray-400 text-sm">No data</div>
        {/if}
      </div>
    {:else if detectedType === "markdown"}
      {#if isEditMode}
        <div class="h-full">
          <CodeEditor
            content={editedContent || content}
            language="markdown"
            onSave={saveFile}
            onChange={handleEditorChange}
          />
        </div>
      {:else}
        <article class="preview-content markdown-preview p-6">
          <MermaidRenderer {content} {renderMarkdown} />
        </article>
      {/if}
    {:else if detectedType === "json"}
      {#if isEditMode}
        <div class="h-full">
          <CodeEditor
            content={editedContent || content}
            language="json"
            onSave={saveFile}
            onChange={handleEditorChange}
          />
        </div>
      {:else}
        <div class="h-full overflow-auto p-4">
          {#if content}
            {@const jsonData = (() => { try { return JSON.parse(content); } catch { return null; } })()}
            {#if jsonData !== null}
              <JsonTreeViewer value={jsonData} maxHeight="100%" showButtons={true} />
            {:else}
              <div class="text-red-500 text-sm mb-4">Invalid JSON</div>
              <pre class="p-4 text-sm font-mono leading-relaxed bg-[#0d1117] text-[#e6edf3] rounded-lg"><code class="hljs">{@html highlightCode(content, "json")}</code></pre>
            {/if}
          {/if}
        </div>
      {/if}
    {:else}
      {#if isEditMode}
        <div class="h-full">
          <CodeEditor
            content={editedContent || content}
            language={source.split(".").pop() || "plaintext"}
            onSave={saveFile}
            onChange={handleEditorChange}
          />
        </div>
      {:else}
        <div class="preview-content h-full overflow-auto bg-[#0d1117]">
          <pre class="p-4 text-sm font-mono leading-relaxed bg-[#0d1117] text-[#e6edf3]"><code class="hljs">{@html highlightCode(content, source.split(".").pop() || "")}</code></pre>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems()}
    onclose={() => contextMenu = null}
  />
{/if}

<!-- Fullscreen Modal -->
{#if isFullscreen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
    onkeydown={(e) => e.key === 'Escape' && (isFullscreen = false)}
  >
    <div class="bg-white rounded-xl shadow-2xl w-[95vw] h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
      <!-- Fullscreen Header -->
      <div class="h-12 px-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/80 shrink-0">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="p-1.5 bg-white border border-gray-200 rounded shadow-sm">
            {#if detectedType === "pdf"}
              <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            {:else if detectedType === "image"}
              <svg class="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            {:else if detectedType === "markdown"}
              <svg class="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            {:else if detectedType === "json"}
              <svg class="w-3.5 h-3.5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            {:else}
              <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
            {/if}
          </div>
          <span class="text-sm text-gray-700 font-medium truncate">{source.split('/').pop() || source}</span>
          <span class="text-xs text-gray-400 truncate hidden sm:block">{source}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            onclick={() => api.fs.reveal(source.split('#')[0])}
            class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded-lg transition-colors"
            title="Open in Finder"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
          </button>
          <button
            onclick={() => isFullscreen = false}
            class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded-lg transition-colors"
            title="Exit fullscreen (Escape)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
      </div>

      <!-- Fullscreen Content -->
      <div class="flex-1 overflow-auto min-h-0">
        {#if detectedType === "markdown" && !isEditMode}
          <article class="fullscreen-markdown-preview max-w-4xl mx-auto p-8 lg:p-12">
            <MermaidRenderer {content} {renderMarkdown} />
          </article>
        {:else if detectedType === "json" && !isEditMode}
          <div class="max-w-6xl mx-auto p-8">
            {#if content}
              {@const jsonData = (() => { try { return JSON.parse(content); } catch { return null; } })()}
              {#if jsonData !== null}
                <JsonTreeViewer value={jsonData} maxHeight="100%" showButtons={true} />
              {:else}
                <div class="text-red-500 text-sm mb-4">Invalid JSON</div>
                <pre class="p-4 text-sm font-mono leading-relaxed bg-[#0d1117] text-[#e6edf3] rounded-lg"><code class="hljs">{@html highlightCode(content, "json")}</code></pre>
              {/if}
            {/if}
          </div>
        {:else if detectedType === "image"}
          <div class="flex items-center justify-center h-full p-8 bg-[#f5f5f5]" style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><rect width=%2220%22 height=%2220%22 fill=%22%23f5f5f5%22/><rect width=%2210%22 height=%2210%22 fill=%22%23e5e5e5%22/><rect x=%2210%22 y=%2210%22 width=%2210%22 height=%2210%22 fill=%22%23e5e5e5%22/></svg>')">
            <img src={`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}&raw=true&_t=${mediaKey}`} alt="Preview" class="max-w-full max-h-full object-contain shadow-lg rounded-lg" />
          </div>
        {:else if detectedType === "pdf"}
          <iframe
            src={`${getApiBase()}/fs/read?path=${encodeURIComponent(source)}&raw=true&_t=${mediaKey}`}
            class="w-full h-full border-0"
            title="PDF Preview"
          ></iframe>
        {:else if detectedType === "csv"}
          <div class="p-6">
            <div class="mb-4 text-sm text-gray-500">{csvData.length} rows × {csvHeaders.length} columns</div>
            <div class="overflow-x-auto rounded-lg border border-gray-200">
              <table class="w-full text-sm border-collapse">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 border-b border-gray-200 bg-gray-100 w-12">#</th>
                    {#each csvHeaders as header, i}
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 border-b border-gray-200 bg-gray-50 whitespace-nowrap">{header || `Column ${i + 1}`}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each csvData as row, rowIndex}
                    <tr class="hover:bg-blue-50/50 transition-colors {rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}">
                      <td class="px-4 py-2 text-xs text-gray-400 border-b border-gray-100 font-mono">{rowIndex + 1}</td>
                      {#each row as cell}
                        <td class="px-4 py-2 text-gray-700 border-b border-gray-100 whitespace-nowrap max-w-xs truncate" title={cell}>{cell}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {:else if (detectedType === "code" || detectedType === "file") && !isEditMode}
          <div class="max-w-6xl mx-auto p-6">
            <pre class="p-6 text-sm font-mono leading-relaxed bg-[#0d1117] text-[#e6edf3] rounded-lg border border-gray-700/50"><code class="hljs">{@html highlightCode(content, source.split(".").pop() || "")}</code></pre>
          </div>
        {:else}
          <div class="p-8 text-center text-gray-500">
            <p>Preview not available in fullscreen for this file type</p>
            <button onclick={() => isFullscreen = false} class="mt-4 text-blue-600 hover:underline">Exit fullscreen</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.hljs) {
    background: transparent !important;
    padding: 0 !important;
  }
  
  :global(.markdown-preview) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    font-size: 15px;
    line-height: 1.7;
    color: #1f2937;
  }
  
  :global(.markdown-preview h1) {
    font-size: 2em;
    font-weight: 700;
    margin: 1.5em 0 0.75em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #e5e7eb;
    line-height: 1.3;
  }
  
  :global(.markdown-preview h2) {
    font-size: 1.5em;
    font-weight: 600;
    margin: 1.5em 0 0.75em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid #e5e7eb;
    line-height: 1.3;
  }
  
  :global(.markdown-preview h3) {
    font-size: 1.25em;
    font-weight: 600;
    margin: 1.25em 0 0.5em;
    line-height: 1.4;
  }
  
  :global(.markdown-preview h4) {
    font-size: 1.1em;
    font-weight: 600;
    margin: 1em 0 0.5em;
    line-height: 1.4;
  }
  
  :global(.markdown-preview h5),
  :global(.markdown-preview h6) {
    font-size: 1em;
    font-weight: 600;
    margin: 1em 0 0.5em;
  }
  
  :global(.markdown-preview p) {
    margin: 0 0 1em;
  }
  
  :global(.markdown-preview ul),
  :global(.markdown-preview ol) {
    margin: 0 0 1em;
    padding-left: 2em;
  }
  
  :global(.markdown-preview ul) {
    list-style-type: disc;
  }
  
  :global(.markdown-preview ol) {
    list-style-type: decimal;
  }
  
  :global(.markdown-preview li) {
    margin: 0.35em 0;
  }
  
  :global(.markdown-preview li > ul),
  :global(.markdown-preview li > ol) {
    margin: 0.25em 0 0;
  }
  
  :global(.markdown-preview strong) {
    font-weight: 600;
    color: #111827;
  }
  
  :global(.markdown-preview em) {
    font-style: italic;
  }
  
  :global(.markdown-preview blockquote) {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #d1d5db;
    background: #f9fafb;
    color: #4b5563;
  }
  
  :global(.markdown-preview blockquote p:last-child) {
    margin-bottom: 0;
  }
  
  :global(.markdown-preview code) {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.875em;
    background: #f3f4f6;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    color: #be185d;
  }
  
  :global(.markdown-preview pre) {
    margin: 1em 0;
    padding: 1em;
    background: #1f2937;
    border-radius: 8px;
    overflow-x: auto;
  }
  
  :global(.markdown-preview pre code) {
    background: none;
    padding: 0;
    color: #e5e7eb;
    font-size: 0.85em;
    line-height: 1.6;
  }
  
  :global(.markdown-preview a) {
    color: #2563eb;
    text-decoration: none;
  }
  
  :global(.markdown-preview a:hover) {
    text-decoration: underline;
  }
  
  :global(.markdown-preview hr) {
    margin: 2em 0;
    border: none;
    border-top: 1px solid #e5e7eb;
  }
  
  :global(.markdown-preview table) {
    width: 100%;
    margin: 1em 0;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  
  :global(.markdown-preview th),
  :global(.markdown-preview td) {
    padding: 0.75em 1em;
    border: 1px solid #e5e7eb;
    text-align: left;
  }
  
  :global(.markdown-preview th) {
    background: #f9fafb;
    font-weight: 600;
  }
  
  :global(.markdown-preview tr:nth-child(even)) {
    background: #fafafa;
  }
  
  :global(.markdown-preview img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }
  
  :global(.markdown-preview > *:first-child) {
    margin-top: 0;
  }
  
  :global(.markdown-preview > *:last-child) {
    margin-bottom: 0;
  }

  /* Fullscreen markdown styles - larger, more readable */
  :global(.fullscreen-markdown-preview) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    font-size: 17px;
    line-height: 1.8;
    color: #1f2937;
  }

  :global(.fullscreen-markdown-preview h1) {
    font-size: 2.25em;
    font-weight: 700;
    margin: 1.5em 0 0.75em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #e5e7eb;
    line-height: 1.3;
  }

  :global(.fullscreen-markdown-preview h2) {
    font-size: 1.75em;
    font-weight: 600;
    margin: 1.5em 0 0.75em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid #e5e7eb;
    line-height: 1.3;
  }

  :global(.fullscreen-markdown-preview h3) {
    font-size: 1.4em;
    font-weight: 600;
    margin: 1.25em 0 0.5em;
    line-height: 1.4;
  }

  :global(.fullscreen-markdown-preview h4) {
    font-size: 1.2em;
    font-weight: 600;
    margin: 1em 0 0.5em;
    line-height: 1.4;
  }

  :global(.fullscreen-markdown-preview p) {
    margin: 0 0 1.25em;
  }

  :global(.fullscreen-markdown-preview ul),
  :global(.fullscreen-markdown-preview ol) {
    margin: 0 0 1.25em;
    padding-left: 2em;
  }

  :global(.fullscreen-markdown-preview ul) {
    list-style-type: disc;
  }

  :global(.fullscreen-markdown-preview ol) {
    list-style-type: decimal;
  }

  :global(.fullscreen-markdown-preview li) {
    margin: 0.5em 0;
  }

  :global(.fullscreen-markdown-preview blockquote) {
    margin: 1.25em 0;
    padding: 0.75em 1.25em;
    border-left: 4px solid #d1d5db;
    background: #f9fafb;
    color: #4b5563;
    border-radius: 0 8px 8px 0;
  }

  :global(.fullscreen-markdown-preview code) {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.9em;
    background: #f3f4f6;
    padding: 0.2em 0.5em;
    border-radius: 4px;
    color: #be185d;
  }

  :global(.fullscreen-markdown-preview pre) {
    margin: 1.25em 0;
    padding: 1.25em;
    background: #1f2937;
    border-radius: 12px;
    overflow-x: auto;
  }

  :global(.fullscreen-markdown-preview pre code) {
    background: none;
    padding: 0;
    color: #e5e7eb;
    font-size: 0.9em;
    line-height: 1.7;
  }

  :global(.fullscreen-markdown-preview a) {
    color: #2563eb;
    text-decoration: none;
  }

  :global(.fullscreen-markdown-preview a:hover) {
    text-decoration: underline;
  }

  :global(.fullscreen-markdown-preview hr) {
    margin: 2.5em 0;
    border: none;
    border-top: 1px solid #e5e7eb;
  }

  :global(.fullscreen-markdown-preview table) {
    width: 100%;
    margin: 1.25em 0;
    border-collapse: collapse;
    font-size: 0.95em;
  }

  :global(.fullscreen-markdown-preview th),
  :global(.fullscreen-markdown-preview td) {
    padding: 0.875em 1.25em;
    border: 1px solid #e5e7eb;
    text-align: left;
  }

  :global(.fullscreen-markdown-preview th) {
    background: #f9fafb;
    font-weight: 600;
  }

  :global(.fullscreen-markdown-preview img) {
    max-width: 100%;
    height: auto;
    border-radius: 12px;
    margin: 1em 0;
  }

  :global(.fullscreen-markdown-preview > *:first-child) {
    margin-top: 0;
  }

  :global(.fullscreen-markdown-preview > *:last-child) {
    margin-bottom: 0;
  }
</style>
