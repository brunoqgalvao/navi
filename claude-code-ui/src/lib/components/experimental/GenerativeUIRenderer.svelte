<script lang="ts">
  import { onMount } from 'svelte';
  import GenerativeUI from './GenerativeUI.svelte';

  interface Props {
    element: HTMLElement;
  }

  let { element }: Props = $props();

  let genuiBlocks: Array<{
    element: HTMLElement;
    id: string;
    html: string;
  }> = $state([]);

  function handleInteraction(event: CustomEvent) {
    const { type, target, data } = event.detail;
    
    // Log interactions for debugging - in a real app, you'd handle these appropriately
    console.log('Generative UI Interaction:', { type, target, data });
    
    // Example: Handle form submissions
    if (type === 'form_submit') {
      console.log('Form submitted with data:', data);
    }
    
    // Example: Handle button clicks
    if (type === 'click' && target?.tagName === 'BUTTON') {
      console.log('Button clicked:', target.textContent);
    }
  }

  function handleError(event: CustomEvent) {
    console.error('Generative UI Error:', event.detail);
  }

  onMount(() => {
    // Find all generative UI blocks in the element
    const blocks = element.querySelectorAll('[data-genui-id]');
    
    genuiBlocks = Array.from(blocks).map((blockElement) => {
      const id = blockElement.getAttribute('data-genui-id') || '';
      const encodedHtml = blockElement.getAttribute('data-genui-html') || '';
      const html = decodeURIComponent(encodedHtml);
      
      return {
        element: blockElement as HTMLElement,
        id,
        html
      };
    });
  });
</script>

{#each genuiBlocks as block (block.id)}
  <div class="genui-wrapper">
    <GenerativeUI 
      html={block.html} 
      id={block.id}
      oninteraction={handleInteraction}
      onerror={handleError}
    />
  </div>
{/each}

<style>
  .genui-wrapper {
    margin: 16px 0;
  }
</style>