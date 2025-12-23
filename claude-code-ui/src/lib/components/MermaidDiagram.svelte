<script lang="ts">
  import { Mermaid } from '@friendofsvelte/mermaid';
  
  interface Props {
    code: string;
  }

  let { code }: Props = $props();
</script>

<div class="mermaid-diagram">
  <Mermaid string={code} />
</div>

<style>
  .mermaid-diagram {
    margin: 1rem 0;
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background-color: #fafafa;
    overflow-x: auto;
  }

  .mermaid-diagram :global(.mermaid) {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100px;
  }

  .mermaid-diagram :global(svg) {
    max-width: 100%;
    height: auto;
  }
</style>