<script lang="ts">
  interface Props {
    title?: string;
    subtitle?: string;
    projectContext?: { summary: string; suggestions: string[] } | null;
    onSuggestionClick?: (prompt: string) => void;
  }

  let {
    title = "What would you like to build?",
    subtitle = "Start a conversation or ask a question",
    projectContext = null,
    onSuggestionClick
  }: Props = $props();

  function handleClick(prompt: string) {
    onSuggestionClick?.(prompt);
  }
</script>

<div class="empty-state-container">
  <!-- Dotted gradient background -->
  <div class="dotted-bg"></div>

  <!-- Content -->
  <div class="content">
    <div class="header">
      <h1 class="title">{title}</h1>
      <p class="subtitle">{subtitle}</p>
    </div>

    {#if projectContext?.suggestions && projectContext.suggestions.length > 0}
      <div class="suggestions">
        {#each projectContext.suggestions as suggestion}
          <button
            class="suggestion-pill"
            onclick={() => handleClick(suggestion)}
          >
            {suggestion}
          </button>
        {/each}
      </div>

      {#if projectContext.summary}
        <p class="context-summary">{projectContext.summary}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .empty-state-container {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    padding: 2rem;
    overflow: hidden;
  }

  .dotted-bg {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.07) 1px, transparent 0);
    background-size: 20px 20px;
    mask-image: radial-gradient(ellipse 70% 50% at 50% 40%, black 10%, transparent 70%);
    -webkit-mask-image: radial-gradient(ellipse 70% 50% at 50% 40%, black 10%, transparent 70%);
    pointer-events: none;
  }

  .content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    max-width: 540px;
    width: 100%;
  }

  .header {
    text-align: center;
  }

  .title {
    font-size: 1.75rem;
    font-weight: 600;
    color: #18181b;
    letter-spacing: -0.02em;
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    font-size: 0.9375rem;
    color: #71717a;
    margin: 0;
  }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .suggestion-pill {
    font-size: 0.875rem;
    color: #52525b;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 9999px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .suggestion-pill:hover {
    color: #18181b;
    border-color: #a1a1aa;
    background: #fafafa;
  }

  .context-summary {
    font-size: 0.75rem;
    color: #a1a1aa;
    text-align: center;
    max-width: 400px;
    margin: 0;
    line-height: 1.5;
  }
</style>
