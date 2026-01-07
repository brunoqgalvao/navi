<script lang="ts">
  interface Props {
    enabled: boolean;
    description: string;
    isGitRepo: boolean;
    onToggle: (enabled: boolean) => void;
    onDescriptionChange: (description: string) => void;
  }

  let {
    enabled = $bindable(false),
    description = $bindable(""),
    isGitRepo,
    onToggle,
    onDescriptionChange,
  }: Props = $props();

  function handleToggle() {
    const newValue = !enabled;
    enabled = newValue;
    onToggle(newValue);
  }
</script>

<div class="worktree-toggle">
  <button
    class="toggle-btn"
    class:active={enabled}
    onclick={handleToggle}
    title={enabled ? "Parallel branch mode ON - working in isolated copy" : "Enable parallel branch - work in an isolated copy of your code"}
  >
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  </button>

  {#if enabled}
    <input
      type="text"
      placeholder="Branch name (e.g., add-auth)"
      bind:value={description}
      oninput={(e) => onDescriptionChange(e.currentTarget.value)}
      class="branch-input"
    />
  {/if}
</div>

<style>
  .worktree-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background: #f5f5f5;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    color: #737373;
  }

  .toggle-btn:hover {
    background: #ebebeb;
    border-color: #d4d4d4;
    color: #525252;
  }

  .toggle-btn.active {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border-color: #34d399;
    color: #10b981;
  }

  .icon {
    width: 1rem;
    height: 1rem;
  }

  .branch-input {
    flex: 1;
    padding: 0.375rem 0.625rem;
    font-size: 0.8125rem;
    border: 1px solid #d4d4d4;
    border-radius: 6px;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    min-width: 0;
  }

  .branch-input:focus {
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);
  }

  .branch-input::placeholder {
    color: #a3a3a3;
  }
</style>
