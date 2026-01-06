<script lang="ts">
  interface Suggestion {
    icon: string;
    label: string;
    prompt: string;
  }

  interface Props {
    onSuggestionClick?: (prompt: string) => void;
  }

  let { onSuggestionClick }: Props = $props();

  const suggestions: Suggestion[] = [
    { icon: "🚀", label: "Build a web app", prompt: "Help me build a web application" },
    { icon: "🐛", label: "Fix a bug", prompt: "Help me debug this issue" },
    { icon: "📖", label: "Explain code", prompt: "Explain how this code works" },
    { icon: "✨", label: "Add a feature", prompt: "Help me add a new feature" },
    { icon: "🔧", label: "Refactor code", prompt: "Help me refactor this code" },
    { icon: "📝", label: "Write tests", prompt: "Help me write tests for this code" },
  ];

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
      <h1 class="title">What would you like to build?</h1>
      <p class="subtitle">Start a conversation or pick a suggestion below</p>
    </div>

    <div class="suggestions-grid">
      {#each suggestions as suggestion}
        <button
          class="suggestion-tile"
          onclick={() => handleClick(suggestion.prompt)}
        >
          <span class="suggestion-icon">{suggestion.icon}</span>
          <span class="suggestion-label">{suggestion.label}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .empty-state-container {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 2rem;
    overflow: hidden;
  }

  .dotted-bg {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.08) 1px, transparent 0);
    background-size: 24px 24px;
    mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 100%);
    -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 100%);
    pointer-events: none;
  }

  .content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2.5rem;
    max-width: 600px;
    width: 100%;
  }

  .header {
    text-align: center;
  }

  .title {
    font-size: 1.875rem;
    font-weight: 600;
    color: #18181b;
    letter-spacing: -0.025em;
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    font-size: 1rem;
    color: #71717a;
    margin: 0;
  }

  .suggestions-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    width: 100%;
  }

  @media (max-width: 640px) {
    .suggestions-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .suggestion-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem 1rem;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .suggestion-tile:hover {
    border-color: #a1a1aa;
    background: #fafafa;
    transform: translateY(-1px);
  }

  .suggestion-tile:active {
    transform: translateY(0);
  }

  .suggestion-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .suggestion-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #3f3f46;
  }
</style>
