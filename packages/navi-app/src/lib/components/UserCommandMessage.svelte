<script lang="ts">
  import InlineCommandBlock from "./InlineCommandBlock.svelte";

  interface Props {
    command: string;
    cwd?: string;
    timestamp: Date;
    onOpenInDock?: (command: string) => void;
    onSendToClaude?: (context: string) => void;
  }

  let { command, cwd, timestamp, onOpenInDock, onSendToClaude }: Props = $props();

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
</script>

<div class="user-command-message">
  <div class="command-header">
    <div class="user-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
      </svg>
      <span>You ran a command</span>
    </div>
    <span class="timestamp">{formatTime(timestamp)}</span>
  </div>
  
  <InlineCommandBlock
    {command}
    {cwd}
    {onOpenInDock}
    {onSendToClaude}
  />
</div>

<style>
  .user-command-message {
    width: 100%;
    max-width: 100%;
  }

  .command-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    padding: 0 2px;
  }

  .user-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: #7aa2f7;
  }

  .timestamp {
    font-size: 11px;
    color: #6b7280;
  }
</style>
