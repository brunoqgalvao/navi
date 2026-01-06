<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { terminalApi, type ExecEvent } from "../api";
  import { getWsUrl, getPtyWsUrl } from "../config";
  import type { Terminal } from "xterm";
  import type { FitAddon } from "xterm-addon-fit";

  interface Props {
    cwd?: string;
    initialCommand?: string;
    projectId?: string;
    name?: string;
    existingTerminalId?: string; // For reconnecting to existing PTY
    onClose?: () => void;
    onSendToClaude?: (context: string) => void;
    onTerminalIdChange?: (terminalId: string | null) => void; // Notify parent of new terminal ID
  }

  let { cwd = "", initialCommand = "", projectId, name = "Terminal", existingTerminalId, onClose, onSendToClaude, onTerminalIdChange }: Props = $props();

  let terminalContainer: HTMLDivElement;
  let terminal: Terminal | null = $state(null);
  let fitAddon: FitAddon | null = $state(null);
  let terminalId: string | null = $state(null);
  let focusOnClick: (() => void) | null = $state(null);
  let isConnected = $state(false);
  let isLoading = $state(true);
  let error: string | null = $state(null);
  let ws: WebSocket | null = $state(null);
  let dataDisposable: { dispose: () => void } | null = $state(null);
  let resizeDisposable: { dispose: () => void } | null = $state(null);
  let ptyRecoverAttempts = $state(0);
  let isRecoveringPty = $state(false);
  const MAX_PTY_RECOVER = 2;

  // For simple exec mode (SSE)
  let execId: string | null = $state(null);
  let useExecMode = $state(false);

  // Command history for exec mode
  let commandHistory = $state<string[]>([]);
  const HISTORY_SIZE = 50;

  // Output buffer for Claude context
  let outputBuffer: string[] = $state([]);
  const MAX_BUFFER_LINES = 500;
  let hasRecentError = $state(false);

  // Error detection patterns
  const ERROR_PATTERNS = [
    /error:/i,
    /ERR!/,
    /failed/i,
    /exception/i,
    /ENOENT/,
    /Cannot find module/,
    /command not found/,
    /permission denied/i,
  ];

  function captureOutput(data: string) {
    const lines = data.split('\n');
    outputBuffer = [...outputBuffer, ...lines].slice(-MAX_BUFFER_LINES);

    // Check for errors
    if (ERROR_PATTERNS.some(p => p.test(data))) {
      hasRecentError = true;
    }
  }

  function handleSendToClaude() {
    const context = outputBuffer.slice(-100).join('\n');
    const formatted = `Here's the recent terminal output:\n\n\`\`\`\n${context}\n\`\`\`\n\nCan you help me understand what's happening?`;
    onSendToClaude?.(formatted);
    hasRecentError = false;
  }

  function clearBuffer() {
    outputBuffer = [];
    hasRecentError = false;
  }

  function setDataHandler(handler: (data: string) => void) {
    dataDisposable?.dispose();
    dataDisposable = terminal?.onData(handler) || null;
  }

  function setResizeHandler(handler: (size: { cols: number; rows: number }) => void) {
    resizeDisposable?.dispose();
    resizeDisposable = terminal?.onResize(handler) || null;
  }

  function getCreateSize() {
    const cols = terminal?.cols;
    const rows = terminal?.rows;
    return {
      cols: Number.isFinite(cols) && cols && cols > 1 ? Math.floor(cols) : 80,
      rows: Number.isFinite(rows) && rows && rows > 1 ? Math.floor(rows) : 24,
    };
  }

  function getResizeSize(cols: number, rows: number) {
    const safeCols = Number.isFinite(cols) && cols > 1 ? Math.floor(cols) : 0;
    const safeRows = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : 0;
    if (!safeCols || !safeRows) return null;
    return { cols: safeCols, rows: safeRows };
  }

  function initExecMode(reason?: string) {
    if (!terminal || useExecMode) return;
    useExecMode = true;
    isLoading = false;
    isConnected = false;

    if (ws) {
      if (terminalId) {
        ws.send(JSON.stringify({ type: "kill", terminalId }));
      }
      ws.close();
      ws = null;
    }
    terminalId = null;
    onTerminalIdChange?.(null);
    resizeDisposable?.dispose();
    resizeDisposable = null;

    if (reason) {
      terminal.writeln(`\x1b[33m${reason}\x1b[0m`);
    }
    terminal.writeln("\x1b[33mPTY not available. Using simple command execution mode.\x1b[0m");
    terminal.writeln("\x1b[90mType a command and press Enter to execute.\x1b[0m");
    terminal.writeln("");

    // Connect WebSocket for exec mode
    connectExecWebSocket();

    // Input state for exec mode
    let currentLine = "";
    let cursorPos = 0;
    let historyIndex = -1;
    let savedInput = ""; // Save current input when navigating history

    terminal.write(`\x1b[32m$ \x1b[0m`);

    // Helper to clear line and redraw with new content
    function redrawLine(newLine: string) {
      // Move cursor to start of input (after prompt)
      for (let i = 0; i < cursorPos; i++) {
        terminal!.write('\x1b[D');
      }
      // Clear from cursor to end of line
      terminal!.write('\x1b[K');
      // Write new content
      terminal!.write(newLine);
      currentLine = newLine;
      cursorPos = newLine.length;
    }

    setDataHandler((data) => {
      // Handle escape sequences (arrow keys, etc.)
      if (data.startsWith('\x1b[')) {
        const seq = data.slice(2);
        switch (seq) {
          case 'A': // Up arrow - previous history
            if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
              if (historyIndex === -1) {
                savedInput = currentLine; // Save current input
              }
              historyIndex++;
              redrawLine(commandHistory[commandHistory.length - 1 - historyIndex]);
            }
            break;
          case 'B': // Down arrow - next history
            if (historyIndex > 0) {
              historyIndex--;
              redrawLine(commandHistory[commandHistory.length - 1 - historyIndex]);
            } else if (historyIndex === 0) {
              historyIndex = -1;
              redrawLine(savedInput);
            }
            break;
          case 'C': // Right arrow
            if (cursorPos < currentLine.length) {
              terminal!.write('\x1b[C');
              cursorPos++;
            }
            break;
          case 'D': // Left arrow
            if (cursorPos > 0) {
              terminal!.write('\x1b[D');
              cursorPos--;
            }
            break;
          case 'H': // Home
            while (cursorPos > 0) {
              terminal!.write('\x1b[D');
              cursorPos--;
            }
            break;
          case 'F': // End
            while (cursorPos < currentLine.length) {
              terminal!.write('\x1b[C');
              cursorPos++;
            }
            break;
          case '3~': // Delete key
            if (cursorPos < currentLine.length) {
              const before = currentLine.slice(0, cursorPos);
              const after = currentLine.slice(cursorPos + 1);
              currentLine = before + after;
              // Rewrite from cursor position
              terminal!.write(after + ' ');
              // Move cursor back
              for (let i = 0; i <= after.length; i++) {
                terminal!.write('\x1b[D');
              }
            }
            break;
        }
        return;
      }

      if (data === "\x03") {
        // Ctrl+C - kill current process
        if (execId) {
          terminal!.writeln("^C");
          killCurrentProcess();
          currentLine = "";
          cursorPos = 0;
          historyIndex = -1;
          terminal!.write(`\x1b[32m$ \x1b[0m`);
        } else {
          // No process running, just show ^C and new prompt
          terminal!.writeln("^C");
          currentLine = "";
          cursorPos = 0;
          historyIndex = -1;
          terminal!.write(`\x1b[32m$ \x1b[0m`);
        }
      } else if (data === "\x01") {
        // Ctrl+A - move to start
        while (cursorPos > 0) {
          terminal!.write('\x1b[D');
          cursorPos--;
        }
      } else if (data === "\x05") {
        // Ctrl+E - move to end
        while (cursorPos < currentLine.length) {
          terminal!.write('\x1b[C');
          cursorPos++;
        }
      } else if (data === "\x0b") {
        // Ctrl+K - delete from cursor to end
        terminal!.write('\x1b[K');
        currentLine = currentLine.slice(0, cursorPos);
      } else if (data === "\x15") {
        // Ctrl+U - delete from start to cursor
        const deleted = cursorPos;
        currentLine = currentLine.slice(cursorPos);
        // Move to start
        for (let i = 0; i < deleted; i++) {
          terminal!.write('\x1b[D');
        }
        // Clear and rewrite
        terminal!.write('\x1b[K');
        terminal!.write(currentLine);
        // Move cursor back to start
        for (let i = 0; i < currentLine.length; i++) {
          terminal!.write('\x1b[D');
        }
        cursorPos = 0;
      } else if (data === "\x17") {
        // Ctrl+W - delete word before cursor
        let newPos = cursorPos;
        // Skip trailing spaces
        while (newPos > 0 && currentLine[newPos - 1] === ' ') newPos--;
        // Skip word
        while (newPos > 0 && currentLine[newPos - 1] !== ' ') newPos--;

        const deleted = cursorPos - newPos;
        const before = currentLine.slice(0, newPos);
        const after = currentLine.slice(cursorPos);
        currentLine = before + after;

        // Move cursor back
        for (let i = 0; i < deleted; i++) {
          terminal!.write('\x1b[D');
        }
        // Rewrite and clear
        terminal!.write(after + ' '.repeat(deleted));
        // Move cursor back to position
        for (let i = 0; i < after.length + deleted; i++) {
          terminal!.write('\x1b[D');
        }
        cursorPos = newPos;
      } else if (data === "\r") {
        terminal!.writeln("");
        if (currentLine.trim()) {
          // Add to history
          if (commandHistory[commandHistory.length - 1] !== currentLine.trim()) {
            commandHistory = [...commandHistory, currentLine.trim()].slice(-HISTORY_SIZE);
          }
          executeCommandViaWs(currentLine.trim());
        } else {
          terminal!.write(`\x1b[32m$ \x1b[0m`);
        }
        currentLine = "";
        cursorPos = 0;
        historyIndex = -1;
        savedInput = "";
      } else if (data === "\x7f") {
        // Backspace
        if (cursorPos > 0) {
          const before = currentLine.slice(0, cursorPos - 1);
          const after = currentLine.slice(cursorPos);
          currentLine = before + after;
          cursorPos--;

          // Move cursor back, rewrite, clear extra char
          terminal!.write('\x1b[D');
          terminal!.write(after + ' ');
          // Move cursor back to position
          for (let i = 0; i <= after.length; i++) {
            terminal!.write('\x1b[D');
          }
        }
      } else if (data >= " " && data.length === 1) {
        // Printable character - insert at cursor position
        const before = currentLine.slice(0, cursorPos);
        const after = currentLine.slice(cursorPos);
        currentLine = before + data + after;
        cursorPos++;

        // Write char and everything after
        terminal!.write(data + after);
        // Move cursor back to position
        for (let i = 0; i < after.length; i++) {
          terminal!.write('\x1b[D');
        }
      }
    });

    // Run initial command if provided
    if (initialCommand) {
      currentLine = initialCommand;
      cursorPos = initialCommand.length;
      terminal.write(initialCommand);
      terminal.writeln("");
      // Add to history
      if (commandHistory[commandHistory.length - 1] !== initialCommand.trim()) {
        commandHistory = [...commandHistory, initialCommand.trim()].slice(-HISTORY_SIZE);
      }
      executeCommandViaWs(initialCommand);
      currentLine = "";
      cursorPos = 0;
    }
  }

  async function recoverPty(reason: string) {
    if (useExecMode || isRecoveringPty) return;
    if (ptyRecoverAttempts >= MAX_PTY_RECOVER) {
      initExecMode("PTY is unstable. Switching to command mode.");
      return;
    }
    isRecoveringPty = true;
    ptyRecoverAttempts += 1;

    terminal?.writeln(`\x1b[33mPTY error: ${reason}. Reconnecting...\x1b[0m`);

    if (ws) {
      if (terminalId) {
        ws.send(JSON.stringify({ type: "kill", terminalId }));
      }
      ws.close();
      ws = null;
    }
    terminalId = null;
    onTerminalIdChange?.(null);

    try {
      connectPtyWebSocket("create");
    } catch (e: any) {
      initExecMode(`PTY recovery failed: ${e.message || "Unknown error"}`);
    } finally {
      isRecoveringPty = false;
    }
  }

  async function initTerminal() {
    console.log("[TerminalPanel] initTerminal called, container:", terminalContainer);
    if (!terminalContainer) {
      console.warn("[TerminalPanel] No container, aborting init");
      return;
    }

    try {
      console.log("[TerminalPanel] Importing xterm...");
      const { Terminal } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");
      const { WebLinksAddon } = await import("xterm-addon-web-links");

      // Import CSS
      await import("xterm/css/xterm.css");
      console.log("[TerminalPanel] xterm imported, creating terminal...");

      terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#1a1b26",
          foreground: "#a9b1d6",
          cursor: "#c0caf5",
          cursorAccent: "#1a1b26",
          black: "#32344a",
          red: "#f7768e",
          green: "#9ece6a",
          yellow: "#e0af68",
          blue: "#7aa2f7",
          magenta: "#ad8ee6",
          cyan: "#449dab",
          white: "#787c99",
          brightBlack: "#444b6a",
          brightRed: "#ff7a93",
          brightGreen: "#b9f27c",
          brightYellow: "#ff9e64",
          brightBlue: "#7da6ff",
          brightMagenta: "#bb9af7",
          brightCyan: "#0db9d7",
          brightWhite: "#acb0d0",
        },
      });

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon());

      terminal.open(terminalContainer);
      fitAddon.fit();
      terminal.focus();
      focusOnClick = () => terminal?.focus();
      terminalContainer.addEventListener("click", focusOnClick);
      console.log("[TerminalPanel] Terminal opened, cols:", terminal.cols, "rows:", terminal.rows);

      // Try to create or reconnect to a PTY terminal via PTY server
      try {
        if (existingTerminalId) {
          terminal.writeln("\x1b[90mReconnecting to terminal...\x1b[0m");
          console.log("[TerminalPanel] Reconnecting to existing terminal:", existingTerminalId);
          terminalId = existingTerminalId;
          connectPtyWebSocket("attach", existingTerminalId);
        } else {
          console.log("[TerminalPanel] Creating new PTY, cwd:", cwd, "projectId:", projectId);
          connectPtyWebSocket("create");
        }

        setDataHandler((data) => {
          if (ws && ws.readyState === WebSocket.OPEN && terminalId) {
            ws.send(JSON.stringify({
              type: "input",
              terminalId,
              data,
            }));
          }
        });

        setResizeHandler(({ cols, rows }) => {
          const safeSize = getResizeSize(cols, rows);
          if (ws && ws.readyState === WebSocket.OPEN && terminalId && safeSize) {
            ws.send(JSON.stringify({
              type: "resize",
              terminalId,
              cols: safeSize.cols,
              rows: safeSize.rows,
            }));
          }
        });

        isLoading = false;

        // Run initial command if provided (only for new terminals)
        if (initialCommand && !existingTerminalId) {
          setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN && terminalId) {
              ws.send(JSON.stringify({
                type: "input",
                terminalId,
                data: initialCommand + "\r",
              }));
            }
          }, 500);
        }
      } catch (e: any) {
        // Fall back to exec mode if PTY fails
        console.warn("PTY not available, using exec mode:", e.message);
        initExecMode(e.message);
      }
    } catch (e: any) {
      console.error("[TerminalPanel] Fatal error during init:", e);
      error = e.message;
      isLoading = false;
    }
  }

  // WebSocket for exec mode (non-PTY)
  function connectExecWebSocket() {
    const wsUrl = getWsUrl();
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "exec_started") {
          execId = data.execId;
        } else if (data.type === "exec_stdout" && terminal) {
          terminal.write(data.data || "");
          captureOutput(data.data || "");
        } else if (data.type === "exec_stderr" && terminal) {
          terminal.write(data.data || "");
          captureOutput(data.data || "");
        } else if (data.type === "exec_exit" && terminal) {
          if (data.code !== 0) {
            terminal.writeln(`\x1b[31mExited with code ${data.code}\x1b[0m`);
            hasRecentError = true;
          }
          terminal.write(`\x1b[32m$ \x1b[0m`);
          execId = null;
        } else if (data.type === "exec_error" && terminal) {
          terminal.writeln(`\x1b[31mError: ${data.message}\x1b[0m`);
          terminal.write(`\x1b[32m$ \x1b[0m`);
          hasRecentError = true;
          execId = null;
        }
      } catch (e) {
        console.warn("[Terminal] Failed to parse exec WebSocket message:", e);
      }
    };

    ws.onclose = () => {
      isConnected = false;
    };

    ws.onerror = () => {
      error = "WebSocket connection failed";
      isConnected = false;
    };
  }

  function executeCommandViaWs(command: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      terminal?.writeln(`\x1b[31mWebSocket not connected\x1b[0m`);
      terminal?.write(`\x1b[32m$ \x1b[0m`);
      return;
    }

    ws.send(JSON.stringify({
      type: "exec_start",
      command,
      cwd: cwd || undefined,
    }));
  }

  function connectPtyWebSocket(mode: "create" | "attach", termId?: string) {
    const wsUrl = getPtyWsUrl();
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
      if (mode === "create") {
        const { cols, rows } = getCreateSize();
        ws!.send(JSON.stringify({
          type: "create",
          cwd: cwd || undefined,
          cols,
          rows,
          projectId,
          name,
        }));
      } else if (mode === "attach" && termId) {
        ws!.send(JSON.stringify({
          type: "attach",
          terminalId: termId,
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "created") {
          terminalId = data.terminalId;
          onTerminalIdChange?.(data.terminalId);
          console.log("[TerminalPanel] PTY created:", data.terminalId);
        } else if (data.type === "attached") {
          console.log("[TerminalPanel] Attached to PTY:", data.terminalId);
        } else if (data.type === "output" && terminal) {
          terminal.write(data.data);
          captureOutput(data.data);
        } else if (data.type === "error_detected") {
          hasRecentError = true;
        } else if (data.type === "exit") {
          terminal?.writeln(`\r\n\x1b[90mTerminal exited with code ${data.exitCode}\x1b[0m`);
          isConnected = false;
          terminalId = null;
          onTerminalIdChange?.(null);
        } else if (data.type === "resize_error") {
          console.warn("[TerminalPanel] Resize error:", data.message);
        } else if (data.type === "error") {
          console.error("[TerminalPanel] PTY error:", data.message);
          if (data.message?.toLowerCase().includes("terminal not found")) {
            recoverPty(data.message);
          }
        }
      } catch (e) {
        console.warn("[Terminal] Failed to parse PTY WebSocket message:", e);
      }
    };

    ws.onclose = () => {
      isConnected = false;
    };

    ws.onerror = () => {
      error = "PTY WebSocket connection failed";
      isConnected = false;
    };
  }

  async function executeCommand(command: string) {
    if (!terminal) return;

    try {
      const response = await terminalApi.exec(command, cwd || undefined);
      const reader = response.body?.getReader();
      if (!reader) {
        terminal.writeln(`\x1b[31mFailed to start command\x1b[0m`);
        terminal.write(`\x1b[32m$ \x1b[0m`);
        return;
      }

      const decoder = new TextDecoder();
      execId = null;
      let streamBuffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          streamBuffer += text;

          // Process complete SSE lines
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event: ExecEvent = JSON.parse(line.slice(6));
                switch (event.type) {
                  case "started":
                    execId = event.execId || null;
                    break;
                  case "stdout":
                    terminal.write(event.data || "");
                    captureOutput(event.data || "");
                    break;
                  case "stderr":
                    terminal.write(`\x1b[31m${event.data || ""}\x1b[0m`);
                    captureOutput(event.data || "");
                    break;
                  case "exit":
                    if (event.code !== 0) {
                      terminal.writeln(`\x1b[31mExited with code ${event.code}\x1b[0m`);
                      hasRecentError = true;
                    }
                    terminal.write(`\x1b[32m$ \x1b[0m`);
                    execId = null;
                    break;
                  case "error":
                    terminal.writeln(`\x1b[31mError: ${event.message}\x1b[0m`);
                    terminal.write(`\x1b[32m$ \x1b[0m`);
                    hasRecentError = true;
                    execId = null;
                    break;
                }
              } catch (parseError) {
                console.warn("[Terminal] Failed to parse SSE event:", parseError);
              }
            }
          }
        }
      } catch (streamError: any) {
        // Stream was interrupted but process may still be running
        if (execId) {
          terminal.writeln(`\x1b[33m\nStream disconnected. Process may still be running (ID: ${execId})\x1b[0m`);
          terminal.writeln(`\x1b[90mPress Ctrl+C to kill the process, or it will continue in background.\x1b[0m`);
        } else {
          terminal.writeln(`\x1b[31mStream error: ${streamError.message}\x1b[0m`);
          terminal.write(`\x1b[32m$ \x1b[0m`);
        }
      }
    } catch (e: any) {
      terminal.writeln(`\x1b[31mFailed to execute: ${e.message}\x1b[0m`);
      terminal.write(`\x1b[32m$ \x1b[0m`);
    }
  }

  async function killCurrentProcess() {
    if (execId) {
      // Try WebSocket kill first (for WS exec mode)
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "exec_kill",
          execId,
        }));
      }
      // Also try REST API (for SSE exec mode fallback)
      try {
        await terminalApi.killExec(execId);
      } catch { /* REST API fallback - ignore if not found */ }
      execId = null;
    }
  }

  function handleResize() {
    if (fitAddon && terminal) {
      fitAddon.fit();
    }
  }

  onMount(() => {
    // Need to wait a tick for bind:this to be set in Svelte 5
    requestAnimationFrame(() => {
      initTerminal();
    });
    window.addEventListener("resize", handleResize);
  });

  onDestroy(() => {
    window.removeEventListener("resize", handleResize);
    dataDisposable?.dispose();
    resizeDisposable?.dispose();
    dataDisposable = null;
    resizeDisposable = null;
    if (terminalContainer && focusOnClick) {
      terminalContainer.removeEventListener("click", focusOnClick);
      focusOnClick = null;
    }
    // Don't kill terminal on destroy - it persists for workspace
    // Just detach from it
    if (ws && terminalId) {
      ws.send(JSON.stringify({ type: "detach", terminalId }));
      ws.close();
      ws = null;
    }
    if (terminal) {
      terminal.dispose();
    }
  });

  // Public method to paste command
  export function pasteCommand(command: string) {
    if (!terminal) return;

    if (useExecMode) {
      terminal.write(command);
    } else if (ws && ws.readyState === WebSocket.OPEN && terminalId) {
      ws.send(JSON.stringify({
        type: "input",
        terminalId,
        data: command,
      }));
    }
  }

  // Public method to run command
  export function runCommand(command: string) {
    if (!terminal) return;

    if (useExecMode) {
      terminal.writeln("");
      executeCommand(command);
    } else if (ws && ws.readyState === WebSocket.OPEN && terminalId) {
      ws.send(JSON.stringify({
        type: "input",
        terminalId,
        data: command + "\r",
      }));
    }
  }

  // Public method to kill this terminal
  export function killTerminal() {
    if (ws && ws.readyState === WebSocket.OPEN && terminalId) {
      ws.send(JSON.stringify({ type: "kill", terminalId }));
    }
  }
</script>

<div class="terminal-panel">
  <div class="terminal-header">
    <div class="terminal-title">
      <span class="terminal-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      </span>
      <span class="terminal-label">{name || "Terminal"}</span>
      {#if cwd}
        <span class="terminal-cwd" title={cwd}>{cwd.split("/").pop()}</span>
      {/if}
    </div>
    <div class="terminal-actions">
      {#if execId}
        <button class="terminal-btn stop" onclick={killCurrentProcess} title="Stop process">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
          </svg>
        </button>
      {/if}
      {#if onSendToClaude && outputBuffer.length > 0}
        <button
          class="terminal-btn send-claude"
          class:has-error={hasRecentError}
          onclick={handleSendToClaude}
          title={hasRecentError ? "Error detected - Send to Claude" : "Send output to Claude"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19V5M5 12l7-7 7 7"></path>
          </svg>
        </button>
      {/if}
      <button
        class="terminal-btn"
        class:connected={isConnected}
        title={isConnected ? "Connected" : "Disconnected"}
      >
        <span class="status-dot"></span>
      </button>
      {#if onClose}
        <button class="terminal-btn close" onclick={onClose} title="Close terminal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Error detection banner -->
  {#if hasRecentError && onSendToClaude}
    <div class="error-banner">
      <span class="error-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </span>
      <span>Error detected in terminal</span>
      <button class="ask-claude-btn" onclick={handleSendToClaude}>
        Ask Claude for help
      </button>
      <button class="dismiss-btn" onclick={() => hasRecentError = false}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  {/if}

  <div class="terminal-content">
    {#if isLoading}
      <div class="terminal-loading">
        <span class="spinner"></span>
        <span>Initializing terminal...</span>
      </div>
    {:else if error}
      <div class="terminal-error">
        <span>Error: {error}</span>
      </div>
    {/if}
    <div
      bind:this={terminalContainer}
      class="terminal-container"
      class:hidden={isLoading || error}
    ></div>
  </div>
</div>

<style>
  .terminal-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1a1b26;
    border-radius: 8px;
    overflow: hidden;
  }

  .terminal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #24283b;
    border-bottom: 1px solid #32344a;
  }

  .terminal-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #a9b1d6;
    font-size: 12px;
  }

  .terminal-icon {
    display: flex;
    color: #7aa2f7;
  }

  .terminal-label {
    font-weight: 500;
  }

  .terminal-cwd {
    color: #565f89;
    font-size: 11px;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .terminal-actions {
    display: flex;
    gap: 4px;
  }

  .terminal-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s;
  }

  .terminal-btn:hover {
    background: #32344a;
    color: #a9b1d6;
  }

  .terminal-btn.stop {
    color: #f7768e;
  }

  .terminal-btn.stop:hover {
    background: rgba(247, 118, 142, 0.15);
  }

  .terminal-btn.close:hover {
    background: rgba(247, 118, 142, 0.15);
    color: #f7768e;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #565f89;
  }

  .terminal-btn.connected .status-dot {
    background: #9ece6a;
  }

  .terminal-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .terminal-container {
    width: 100%;
    height: 100%;
    padding: 8px;
    box-sizing: border-box;
    background: #1a1b26;
  }

  .terminal-container.hidden {
    visibility: hidden;
  }

  .terminal-loading,
  .terminal-error {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #a9b1d6;
    font-size: 13px;
  }

  .terminal-error {
    color: #f7768e;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #32344a;
    border-top-color: #7aa2f7;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.terminal-container .xterm) {
    height: 100% !important;
  }

  :global(.terminal-container .xterm-screen) {
    height: 100% !important;
  }

  :global(.terminal-container .xterm-viewport) {
    overflow-y: auto !important;
    height: 100% !important;
  }

  :global(.terminal-container .xterm-viewport::-webkit-scrollbar) {
    width: 8px;
  }

  :global(.terminal-container .xterm-viewport::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(.terminal-container .xterm-viewport::-webkit-scrollbar-thumb) {
    background: #32344a;
    border-radius: 4px;
  }

  :global(.terminal-container .xterm-viewport::-webkit-scrollbar-thumb:hover) {
    background: #444b6a;
  }

  .terminal-btn.send-claude {
    color: #7aa2f7;
  }

  .terminal-btn.send-claude:hover {
    background: rgba(122, 162, 247, 0.15);
    color: #7aa2f7;
  }

  .terminal-btn.send-claude.has-error {
    color: #f7768e;
    animation: pulse 2s ease-in-out infinite;
  }

  .terminal-btn.send-claude.has-error:hover {
    background: rgba(247, 118, 142, 0.15);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(247, 118, 142, 0.1);
    border-bottom: 1px solid rgba(247, 118, 142, 0.2);
    font-size: 12px;
    color: #f7768e;
  }

  .error-icon {
    display: flex;
    flex-shrink: 0;
  }

  .ask-claude-btn {
    margin-left: auto;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    color: #f7768e;
    background: rgba(247, 118, 142, 0.15);
    border: 1px solid rgba(247, 118, 142, 0.3);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ask-claude-btn:hover {
    background: rgba(247, 118, 142, 0.25);
    border-color: rgba(247, 118, 142, 0.5);
  }

  .dismiss-btn {
    display: flex;
    padding: 4px;
    background: transparent;
    border: none;
    color: #565f89;
    cursor: pointer;
    border-radius: 4px;
  }

  .dismiss-btn:hover {
    background: rgba(247, 118, 142, 0.15);
    color: #f7768e;
  }
</style>
