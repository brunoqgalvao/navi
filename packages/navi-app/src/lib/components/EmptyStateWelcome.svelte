<script lang="ts">
  interface Props {
    title?: string;
    subtitle?: string;
    projectContext?: { summary: string; suggestions: string[] } | null;
    projectDescription?: string | null;
    isGitRepo?: boolean;
    onSuggestionClick?: (prompt: string) => void;
  }

  let {
    title = "What would you like to build?",
    subtitle = "Start a conversation or ask a question",
    projectContext = null,
    projectDescription = null,
    isGitRepo = false,
    onSuggestionClick
  }: Props = $props();

  function handleClick(prompt: string) {
    onSuggestionClick?.(prompt);
  }

  // Input capabilities hints
  const capabilities = [
    { icon: "image", label: "Paste images", hint: "⌘V or drag & drop" },
    { icon: "file", label: "@file", hint: "Reference files" },
    { icon: "terminal", label: "@terminal", hint: "Include terminal output" },
    { icon: "chat", label: "@chat", hint: "Reference other chats" },
    { icon: "command", label: "/commands", hint: "Slash commands" },
  ];
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

    <!-- Project Description Card -->
    {#if projectDescription}
      <div class="project-card">
        <div class="project-card-header">
          <svg class="project-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
          </svg>
          <span class="project-label">Workspace</span>
        </div>
        <p class="project-description">{projectDescription}</p>
      </div>
    {/if}

    <!-- Project Context Summary -->
    {#if projectContext?.summary}
      <p class="context-summary">{projectContext.summary}</p>
    {/if}

    <!-- Suggestions -->
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
    {/if}

    <!-- Capabilities Hints -->
    <div class="capabilities-section">
      <div class="capabilities-grid">
        {#each capabilities as cap}
          <div class="capability-item">
            {#if cap.icon === "image"}
              <svg class="cap-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"></path>
              </svg>
            {:else if cap.icon === "file"}
              <svg class="cap-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"></path>
              </svg>
            {:else if cap.icon === "terminal"}
              <svg class="cap-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"></path>
              </svg>
            {:else if cap.icon === "chat"}
              <svg class="cap-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"></path>
              </svg>
            {:else if cap.icon === "command"}
              <svg class="cap-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"></path>
              </svg>
            {/if}
            <div class="cap-text">
              <span class="cap-label">{cap.label}</span>
              <span class="cap-hint">{cap.hint}</span>
            </div>
          </div>
        {/each}
      </div>

      <!-- Git repo hint -->
      {#if isGitRepo}
        <div class="git-hint">
          <svg class="git-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <span>Use the <strong>parallel branch</strong> toggle for isolated changes</span>
        </div>
      {/if}
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
    gap: 1.5rem;
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

  /* Project Card */
  .project-card {
    width: 100%;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1rem 1.25rem;
  }

  .project-card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .project-icon {
    width: 16px;
    height: 16px;
    color: #64748b;
  }

  .project-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
  }

  .project-description {
    font-size: 0.875rem;
    color: #334155;
    line-height: 1.5;
    margin: 0;
  }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .suggestion-pill {
    font-size: 0.75rem;
    color: #71717a;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 9999px;
    padding: 0.375rem 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .suggestion-pill:hover {
    color: #18181b;
    border-color: #a1a1aa;
    background: #fafafa;
  }

  .context-summary {
    font-size: 0.9375rem;
    color: #52525b;
    text-align: center;
    max-width: 480px;
    margin: 0;
    line-height: 1.6;
  }

  /* Capabilities Section */
  .capabilities-section {
    width: 100%;
    margin-top: 0.5rem;
  }

  .capabilities-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem 1.5rem;
  }

  .capability-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .cap-icon {
    width: 14px;
    height: 14px;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .cap-text {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
  }

  .cap-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #64748b;
  }

  .cap-hint {
    font-size: 0.6875rem;
    color: #94a3b8;
  }

  /* Git Hint */
  .git-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.625rem 1rem;
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 1px solid #a7f3d0;
    border-radius: 8px;
    font-size: 0.75rem;
    color: #047857;
  }

  .git-hint strong {
    font-weight: 600;
  }

  .git-icon {
    width: 14px;
    height: 14px;
    color: #10b981;
    flex-shrink: 0;
  }
</style>
