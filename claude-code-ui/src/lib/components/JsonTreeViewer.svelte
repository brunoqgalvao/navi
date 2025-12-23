<script lang="ts">
  import JSONTree from 'svelte-json-tree';

  interface Props {
    value: any;
    maxHeight?: string;
    showButtons?: boolean;
  }

  let { value, maxHeight = '400px', showButtons = true }: Props = $props();

  let defaultExpandedLevel = $state(10);
  
  function expandAll() {
    defaultExpandedLevel = 10;
  }
  
  function collapseAll() {
    defaultExpandedLevel = 0;
  }
</script>

<div class="json-tree-container">
  <div 
    class="json-tree-wrapper"
    style:max-height={maxHeight}
  >
    {#if showButtons}
      <div class="json-controls">
        <button 
          onclick={expandAll}
          class="json-control-btn"
          type="button"
          title="Expand All"
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
        <button 
          onclick={collapseAll}
          class="json-control-btn"
          type="button"
          title="Collapse All"
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6" />
          </svg>
        </button>
      </div>
    {/if}
    <JSONTree 
      {value} 
      {defaultExpandedLevel}
    />
  </div>
</div>

<style>
  .json-tree-container {
    @apply border border-gray-200 rounded-lg overflow-hidden bg-white;
  }

  .json-controls {
    @apply absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity duration-150 z-10;
  }

  .json-tree-wrapper:hover .json-controls {
    @apply opacity-100;
  }

  .json-control-btn {
    @apply p-1.5 text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50 hover:text-gray-700 transition-colors duration-150 shadow-sm;
  }

  .json-tree-wrapper {
    @apply overflow-auto px-3 py-2 relative;
  }

  .json-tree-wrapper :global(.svelte-json-tree) {
    --json-tree-string-color: #059669;
    --json-tree-symbol-color: #6b7280;
    --json-tree-boolean-color: #7c3aed;
    --json-tree-function-color: #dc2626;
    --json-tree-number-color: #ea580c;
    --json-tree-label-color: #374151;
    --json-tree-arrow-color: #6b7280;
    --json-tree-null-color: #6b7280;
    --json-tree-undefined-color: #6b7280;
    --json-tree-date-color: #0891b2;
    
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.75rem;
    line-height: 1.25rem;
  }

  .json-tree-wrapper :global(.svelte-json-tree li) {
    margin: 0;
    padding: 0.125rem 0;
  }

  .json-tree-wrapper :global(.svelte-json-tree .indent) {
    width: 1rem;
  }

  .json-tree-wrapper :global(.svelte-json-tree .arrow) {
    color: var(--json-tree-arrow-color);
    cursor: pointer;
    user-select: none;
    margin-right: 0.25rem;
  }

  .json-tree-wrapper :global(.svelte-json-tree .arrow:hover) {
    color: #374151;
  }

  .json-tree-wrapper :global(.svelte-json-tree .label) {
    color: var(--json-tree-label-color);
    font-weight: 500;
  }

  .json-tree-wrapper :global(.svelte-json-tree .string) {
    color: var(--json-tree-string-color);
  }

  .json-tree-wrapper :global(.svelte-json-tree .number) {
    color: var(--json-tree-number-color);
  }

  .json-tree-wrapper :global(.svelte-json-tree .boolean) {
    color: var(--json-tree-boolean-color);
    font-weight: 500;
  }

  .json-tree-wrapper :global(.svelte-json-tree .null) {
    color: var(--json-tree-null-color);
    font-style: italic;
  }

  .json-tree-wrapper :global(.svelte-json-tree .undefined) {
    color: var(--json-tree-undefined-color);
    font-style: italic;
  }

  .json-tree-wrapper :global(.svelte-json-tree .symbol) {
    color: var(--json-tree-symbol-color);
  }

  .json-tree-wrapper :global(.svelte-json-tree .function) {
    color: var(--json-tree-function-color);
    font-style: italic;
  }

  .json-tree-wrapper :global(.svelte-json-tree .date) {
    color: var(--json-tree-date-color);
  }
</style>
