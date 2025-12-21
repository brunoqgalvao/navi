<script lang="ts">
  import { onMount } from "svelte";
  import { marked } from "marked";
  import hljs from "highlight.js";

  type PreviewType = "url" | "file" | "markdown" | "code" | "image" | "pdf" | "none";

  interface Props {
    source: string;
    type?: PreviewType;
    onClose?: () => void;
  }

  let { source, type = "none", onClose }: Props = $props();

  let content = $state("");
  let loading = $state(false);
  let error = $state("");
  let detectedType = $state<PreviewType>("none");
  let iframeKey = $state(0);

  const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
  const codeExtensions = ["js", "ts", "jsx", "tsx", "svelte", "vue", "py", "rs", "go", "java", "c", "cpp", "h", "css", "scss", "sass", "less", "html", "xml", "json", "yaml", "yml", "toml", "sh", "bash", "zsh", "sql", "graphql", "prisma"];
  const markdownExtensions = ["md", "mdx", "markdown"];
  const pdfExtensions = ["pdf"];

  function detectType(src: string): PreviewType {
    if (!src) return "none";
    
    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("localhost") || src.match(/^:\d+/)) {
      return "url";
    }

    const ext = src.split(".").pop()?.toLowerCase() || "";
    
    if (imageExtensions.includes(ext)) return "image";
    if (pdfExtensions.includes(ext)) return "pdf";
    if (markdownExtensions.includes(ext)) return "markdown";
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
      const res = await fetch(`http://localhost:3001/api/fs/read?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) {
        error = data.error;
      } else {
        content = data.content;
      }
    } catch (e) {
      error = "Failed to load file";
    } finally {
      loading = false;
    }
  }

  function formatUrl(url: string): string {
    if (url.startsWith(":")) return `http://localhost${url}`;
    if (url.startsWith("localhost")) return `http://${url}`;
    return url;
  }

  function renderMarkdown(md: string): string {
    marked.setOptions({
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
    });
    return marked(md) as string;
  }

  function highlightCode(code: string, ext: string): string {
    const lang = getLanguage(ext);
    if (hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  }

  $effect(() => {
    if (!source) {
      detectedType = "none";
      content = "";
      return;
    }

    detectedType = type !== "none" ? type : detectType(source);

    if (detectedType === "url") {
      iframeKey++;
    } else if (detectedType === "markdown" || detectedType === "code" || detectedType === "file") {
      loadFile(source);
    } else if (detectedType === "image" || detectedType === "pdf") {
      content = source;
    }
  });
</script>

<div class="h-full flex flex-col bg-white border-l border-gray-200">
  <div class="h-12 px-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50 shrink-0">
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <div class="p-1.5 bg-white border border-gray-200 rounded shadow-sm">
        {#if detectedType === "url"}
          <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
        {:else if detectedType === "pdf"}
          <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
        {:else if detectedType === "image"}
          <svg class="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
        {:else if detectedType === "markdown"}
          <svg class="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        {:else}
          <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
        {/if}
      </div>
      <span class="text-xs text-gray-600 truncate font-mono">{source || "No preview"}</span>
    </div>
    
    <div class="flex items-center gap-1">
      {#if detectedType === "url"}
        <button onclick={() => iframeKey++} class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded transition-colors" title="Refresh">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        </button>
        <a href={formatUrl(source)} target="_blank" class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded transition-colors" title="Open in browser">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
        </a>
      {/if}
      {#if onClose}
        <button onclick={onClose} class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded transition-colors" title="Close preview">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      {/if}
    </div>
  </div>

  <div class="flex-1 overflow-auto min-h-0">
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
          <p class="text-xs text-gray-400">Enter a URL or file path to preview</p>
        </div>
      </div>
    {:else if detectedType === "url"}
      {#key iframeKey}
        <iframe
          src={formatUrl(source)}
          class="w-full h-full border-0"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        ></iframe>
      {/key}
    {:else if detectedType === "pdf"}
      <iframe
        src={`http://localhost:3001/api/fs/read?path=${encodeURIComponent(source)}&raw=true`}
        class="w-full h-full border-0"
        title="PDF Preview"
      ></iframe>
    {:else if detectedType === "image"}
      <div class="flex items-center justify-center h-full p-4 bg-[#f5f5f5]" style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><rect width=%2220%22 height=%2220%22 fill=%22%23f5f5f5%22/><rect width=%2210%22 height=%2210%22 fill=%22%23e5e5e5%22/><rect x=%2210%22 y=%2210%22 width=%2210%22 height=%2210%22 fill=%22%23e5e5e5%22/></svg>')">
        <img src={`http://localhost:3001/api/fs/read?path=${encodeURIComponent(source)}&raw=true`} alt="Preview" class="max-w-full max-h-full object-contain shadow-lg rounded" />
      </div>
    {:else if detectedType === "markdown"}
      <article class="prose prose-gray max-w-none p-6 prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:text-pink-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
        {@html renderMarkdown(content)}
      </article>
    {:else}
      <div class="h-full overflow-auto">
        <pre class="p-4 text-sm font-mono leading-relaxed"><code class="hljs">{@html highlightCode(content, source.split(".").pop() || "")}</code></pre>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(.hljs) {
    background: transparent !important;
    padding: 0 !important;
  }
  
  :global(.prose pre) {
    margin: 1rem 0;
    border-radius: 0.5rem;
  }
  
  :global(.prose pre code) {
    background: transparent !important;
    padding: 0 !important;
    color: inherit !important;
  }
</style>
