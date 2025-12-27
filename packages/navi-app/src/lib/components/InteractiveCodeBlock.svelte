<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import hljs from "highlight.js";
  import CopyButton from "./CopyButton.svelte";

  interface Props {
    code: string;
    language?: string;
    maxLines?: number;
  }

  let { code, language = "", maxLines = 15 }: Props = $props();

  const dispatch = createEventDispatcher<{
    run: { code: string; language: string };
    runInDock: { code: string; language: string };
  }>();

  let codeElement: HTMLElement;
  let isCollapsed = $state(false);
  let shouldCollapse = $state(false);
  let highlightedCode = $state("");

  onMount(() => {
    highlightCode();
    checkIfShouldCollapse();
  });

  function highlightCode() {
    if (language && hljs.getLanguage(language)) {
      highlightedCode = hljs.highlight(code, { language }).value;
    } else {
      highlightedCode = hljs.highlightAuto(code).value;
    }
  }

  function checkIfShouldCollapse() {
    const lines = code.split('\n');
    shouldCollapse = lines.length > maxLines;
    isCollapsed = shouldCollapse;
  }

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
  }

  function handleRun() {
    dispatch('run', { code, language });
  }

  function handleRunInDock() {
    dispatch('runInDock', { code, language });
  }

  function isRunnableLanguage(lang: string): boolean {
    const runnableLanguages = [
      'bash', 'sh', 'shell', 'zsh', 'fish',
      'javascript', 'js', 'node',
      'python', 'py',
      'typescript', 'ts'
    ];
    return runnableLanguages.includes(lang.toLowerCase());
  }

  function isShellLanguage(lang: string): boolean {
    const shellLanguages = ['bash', 'sh', 'shell', 'zsh', 'fish', 'console', 'terminal'];
    return shellLanguages.includes(lang.toLowerCase());
  }

  $effect(() => {
    highlightCode();
    checkIfShouldCollapse();
  });

  let displayCode = $derived.by(() => {
    if (!isCollapsed || !shouldCollapse) return highlightedCode;
    
    const lines = highlightedCode.split('\n');
    const visibleLines = lines.slice(0, maxLines);
    return visibleLines.join('\n');
  });
</script>

<div class="interactive-code-block relative group rounded-lg overflow-hidden border border-gray-700/50 shadow-lg">
  <!-- Header bar -->
  <div class="code-header flex items-center justify-between bg-[#1e1e2e] px-4 py-2.5 border-b border-gray-700/50">
    <div class="flex items-center gap-3">
      {#if language}
        <span class="language-label text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {language}
        </span>
      {/if}
      {#if shouldCollapse}
        <button 
          onclick={toggleCollapse}
          class="collapse-btn text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          title={isCollapsed ? 'Expand code' : 'Collapse code'}
        >
          <svg class="w-3 h-3 transition-transform {isCollapsed ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
          {isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      {/if}
    </div>
    
    <div class="flex items-center gap-2">
      {#if isShellLanguage(language)}
        <button
          onclick={handleRunInDock}
          class="run-btn px-2 py-1 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-all flex items-center gap-1.5 text-xs"
          title="Run in Dock Terminal"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          Run in Dock
        </button>
      {:else if isRunnableLanguage(language)}
        <button
          onclick={handleRun}
          class="run-btn px-2 py-1 text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-all flex items-center gap-1.5 text-xs"
          title="Run code"
        >
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Run
        </button>
      {/if}
      <CopyButton text={code} class="text-xs text-gray-400 hover:text-gray-200" />
    </div>
  </div>

  <!-- Code content -->
  <div class="code-content relative">
    <pre class="hljs bg-[#11111b] text-gray-200 p-4 overflow-x-auto text-sm leading-relaxed {isCollapsed && shouldCollapse ? 'max-h-96' : ''}"><code bind:this={codeElement}>{@html displayCode}</code></pre>
    
    {#if isCollapsed && shouldCollapse}
      <div class="fade-overlay absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#11111b] to-transparent pointer-events-none"></div>
      <div class="expand-hint absolute bottom-3 right-3 text-xs text-gray-500 bg-[#1e1e2e]/80 px-2 py-1 rounded pointer-events-none backdrop-blur-sm">
        +{code.split('\n').length - maxLines} more lines
      </div>
    {/if}
  </div>
</div>

<style>
  :global(.hljs) {
    background: transparent !important;
    padding: 0 !important;
  }
  
  .interactive-code-block {
    margin: 1rem 0;
  }

  .code-header {
    font-size: 0.75rem;
  }

  .language-label {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  }

  .code-content pre {
    margin: 0;
  }

  .code-content pre code {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  }

  .expand-hint {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  }
</style>