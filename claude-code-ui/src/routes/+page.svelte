<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { ClaudeClient, type ClaudeMessage, type ContentBlock, type TextBlock, type ToolUseBlock } from "$lib/claude";
  import { messages, session, isConnected } from "$lib/stores";

  let client: ClaudeClient;
  let inputText = $state("");
  let projectPath = $state("");
  let messagesContainer: HTMLElement;

  onMount(async () => {
    client = new ClaudeClient();
    
    try {
      await client.connect();
      isConnected.set(true);
    } catch (e) {
      console.error("Failed to connect:", e);
    }

    client.onMessage(handleMessage);
  });

  onDestroy(() => {
    client?.disconnect();
  });

  function handleMessage(msg: ClaudeMessage) {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") {
          session.setSessionId(msg.sessionId);
          if (msg.model) session.setModel(msg.model);
        }
        break;

      case "assistant":
        const existingMsgs = $messages;
        const lastMsg = existingMsgs[existingMsgs.length - 1];
        
        if (lastMsg?.role === "assistant") {
          messages.updateLastAssistant(msg.content);
        } else {
          messages.addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: msg.content,
            timestamp: new Date(),
          });
        }
        scrollToBottom();
        break;

      case "result":
        session.setCost(msg.costUsd);
        session.setLoading(false);
        break;

      case "error":
        messages.addMessage({
          id: crypto.randomUUID(),
          role: "system",
          content: `Error: ${msg.error}`,
          timestamp: new Date(),
        });
        session.setLoading(false);
        break;

      case "done":
        session.setLoading(false);
        break;
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      messagesContainer?.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }

  function sendMessage() {
    if (!inputText.trim() || !$isConnected) return;

    messages.addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: inputText,
      timestamp: new Date(),
    });

    session.setLoading(true);

    client.query({
      prompt: inputText,
      workingDirectory: projectPath || undefined,
      sessionId: $session.id || undefined,
    });

    inputText = "";
    scrollToBottom();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function formatContent(content: ContentBlock[] | string): string {
    if (typeof content === "string") return content;
    
    return content
      .map((block) => {
        if (block.type === "text") {
          return (block as TextBlock).text;
        }
        if (block.type === "tool_use") {
          const tool = block as ToolUseBlock;
          return `[Using ${tool.name}]`;
        }
        return "";
      })
      .join("\n");
  }

  function getToolCalls(content: ContentBlock[] | string): ToolUseBlock[] {
    if (typeof content === "string") return [];
    return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
  }
</script>

<main class="app">
  <header class="header">
    <h1>Claude Code UI</h1>
    <div class="status">
      <span class="dot" class:connected={$isConnected}></span>
      {$isConnected ? "Connected" : "Disconnected"}
      {#if $session.model}
        <span class="model">({$session.model})</span>
      {/if}
      {#if $session.costUsd > 0}
        <span class="cost">${$session.costUsd.toFixed(4)}</span>
      {/if}
    </div>
  </header>

  <div class="project-path">
    <label>
      <span>Project Path:</span>
      <input
        type="text"
        bind:value={projectPath}
        placeholder="Leave empty for current directory"
      />
    </label>
  </div>

  <div class="messages" bind:this={messagesContainer}>
    {#each $messages as msg (msg.id)}
      <div class="message {msg.role}">
        <div class="message-header">
          <span class="role">{msg.role}</span>
          <span class="time">{msg.timestamp.toLocaleTimeString()}</span>
        </div>
        <div class="message-content">
          <pre>{formatContent(msg.content)}</pre>
          {#each getToolCalls(msg.content) as tool}
            <div class="tool-call">
              <strong>{tool.name}</strong>
              <code>{JSON.stringify(tool.input, null, 2)}</code>
            </div>
          {/each}
        </div>
      </div>
    {/each}

    {#if $session.isLoading}
      <div class="message assistant loading">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    {/if}
  </div>

  <div class="input-area">
    <textarea
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder="Ask Claude anything..."
      disabled={!$isConnected || $session.isLoading}
    ></textarea>
    <button
      onclick={sendMessage}
      disabled={!$isConnected || $session.isLoading || !inputText.trim()}
    >
      Send
    </button>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #1a1b26;
    color: #c0caf5;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #3b4261;
  }

  .header h1 {
    margin: 0;
    font-size: 1.25rem;
    color: #7aa2f7;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f7768e;
  }

  .dot.connected {
    background: #9ece6a;
  }

  .model {
    color: #7aa2f7;
  }

  .cost {
    background: #3b4261;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .project-path {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #3b4261;
  }

  .project-path label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .project-path span {
    font-size: 0.875rem;
    color: #a9b1d6;
  }

  .project-path input {
    flex: 1;
    background: #24283b;
    border: 1px solid #3b4261;
    border-radius: 4px;
    padding: 0.5rem;
    color: #c0caf5;
    font-family: monospace;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    padding: 1rem;
    border-radius: 8px;
    max-width: 85%;
  }

  .message.user {
    background: #3b4261;
    align-self: flex-end;
  }

  .message.assistant {
    background: #24283b;
    align-self: flex-start;
  }

  .message.system {
    background: #f7768e22;
    border: 1px solid #f7768e44;
    align-self: center;
    max-width: 100%;
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
  }

  .role {
    text-transform: uppercase;
    color: #7aa2f7;
  }

  .time {
    color: #565f89;
  }

  .message-content pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
  }

  .tool-call {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: #1a1b26;
    border-radius: 4px;
    border-left: 3px solid #bb9af7;
  }

  .tool-call strong {
    color: #bb9af7;
  }

  .tool-call code {
    display: block;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #9aa5ce;
    overflow-x: auto;
  }

  .loading {
    padding: 1rem;
  }

  .typing-indicator {
    display: flex;
    gap: 4px;
  }

  .typing-indicator span {
    width: 8px;
    height: 8px;
    background: #7aa2f7;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
  .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }

  .input-area {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid #3b4261;
    background: #1a1b26;
  }

  .input-area textarea {
    flex: 1;
    background: #24283b;
    border: 1px solid #3b4261;
    border-radius: 8px;
    padding: 0.75rem;
    color: #c0caf5;
    font-family: inherit;
    font-size: 1rem;
    resize: none;
    min-height: 60px;
    max-height: 200px;
  }

  .input-area textarea:focus {
    outline: none;
    border-color: #7aa2f7;
  }

  .input-area button {
    background: #7aa2f7;
    color: #1a1b26;
    border: none;
    border-radius: 8px;
    padding: 0.75rem 1.5rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .input-area button:hover:not(:disabled) {
    background: #89b4fa;
  }

  .input-area button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
