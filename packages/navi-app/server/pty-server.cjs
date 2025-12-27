#!/usr/bin/env node
/**
 * Standalone PTY Server
 *
 * Runs with Node.js (not Bun) because node-pty has issues with Bun's
 * file descriptor handling, causing ENXIO errors.
 *
 * Communicates with the main server via WebSocket.
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const os = require('os');

const PORT = parseInt(process.env.PTY_PORT || '3002', 10);

// Active PTY sessions
const terminals = new Map();

// Output buffer settings
const MAX_BUFFER_LINES = 500;
const ERROR_PATTERNS = [
  /error:/i,
  /ERR!/,
  /failed/i,
  /exception/i,
  /ENOENT/,
  /Cannot find module/,
  /command not found/,
  /permission denied/i,
  /EACCES/,
  /ECONNREFUSED/,
  /TypeError:/,
  /SyntaxError:/,
  /ReferenceError:/,
];

// Create HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      terminals: terminals.size,
      uptime: process.uptime()
    }));
    return;
  }

  if (req.url === '/terminals') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const list = Array.from(terminals.entries()).map(([id, t]) => ({
      terminalId: id,
      pid: t.pty.pid,
      cwd: t.cwd,
      createdAt: t.createdAt,
      sessionId: t.sessionId,
    }));
    res.end(JSON.stringify(list));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('[PTY] Client connected');

  // Track which terminals this client is attached to
  const attachedTerminals = new Set();

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, message, attachedTerminals);
    } catch (e) {
      console.error('[PTY] Failed to parse message:', e);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    console.log('[PTY] Client disconnected');
    // Detach from all terminals
    for (const terminalId of attachedTerminals) {
      const terminal = terminals.get(terminalId);
      if (terminal) {
        terminal.clients.delete(ws);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[PTY] WebSocket error:', err);
  });
});

function handleMessage(ws, message, attachedTerminals) {
  switch (message.type) {
    case 'create': {
      const { cwd = os.homedir(), cols = 80, rows = 24, sessionId } = message;
      const safeCols = Number.isFinite(cols) && cols > 1 ? Math.floor(cols) : 80;
      const safeRows = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : 24;

      const shell = process.platform === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/bash';

      const terminalId = crypto.randomUUID();

      try {
        const ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: safeCols,
          rows: safeRows,
          cwd,
          env: process.env,
        });

        const terminal = {
          pty: ptyProcess,
          cwd,
          createdAt: Date.now(),
          sessionId,
          outputBuffer: [],
          clients: new Set([ws]),
        };

        terminals.set(terminalId, terminal);
        attachedTerminals.add(terminalId);

        // Handle output
        ptyProcess.onData((data) => {
          // Buffer output
          const lines = data.split('\n');
          terminal.outputBuffer.push(...lines);
          while (terminal.outputBuffer.length > MAX_BUFFER_LINES) {
            terminal.outputBuffer.shift();
          }

          // Broadcast to clients
          const outputMsg = JSON.stringify({
            type: 'output',
            terminalId,
            data,
          });
          for (const client of terminal.clients) {
            try {
              client.send(outputMsg);
            } catch {
              terminal.clients.delete(client);
            }
          }

          // Check for errors
          if (ERROR_PATTERNS.some(p => p.test(data))) {
            const errorMsg = JSON.stringify({
              type: 'error_detected',
              terminalId,
              context: terminal.outputBuffer.slice(-30).join('\n'),
            });
            for (const client of terminal.clients) {
              try {
                client.send(errorMsg);
              } catch {}
            }
          }
        });

        // Handle exit
        ptyProcess.onExit(({ exitCode, signal }) => {
          const exitMsg = JSON.stringify({
            type: 'exit',
            terminalId,
            exitCode,
            signal,
          });
          for (const client of terminal.clients) {
            try {
              client.send(exitMsg);
            } catch {}
          }
          terminals.delete(terminalId);
        });

        ws.send(JSON.stringify({
          type: 'created',
          terminalId,
          pid: ptyProcess.pid,
          shell,
          cwd,
          sessionId,
        }));

        console.log(`[PTY] Created terminal ${terminalId} (pid: ${ptyProcess.pid})`);
      } catch (e) {
        ws.send(JSON.stringify({
          type: 'error',
          message: e.message || 'Failed to create terminal',
        }));
      }
      break;
    }

    case 'attach': {
      const { terminalId } = message;
      const terminal = terminals.get(terminalId);

      if (!terminal) {
        ws.send(JSON.stringify({ type: 'error', message: 'Terminal not found' }));
        return;
      }

      terminal.clients.add(ws);
      attachedTerminals.add(terminalId);

      // Send recent buffer
      const recentOutput = terminal.outputBuffer.slice(-100).join('');
      if (recentOutput) {
        ws.send(JSON.stringify({
          type: 'output',
          terminalId,
          data: recentOutput,
        }));
      }

      ws.send(JSON.stringify({
        type: 'attached',
        terminalId,
        pid: terminal.pty.pid,
      }));
      break;
    }

    case 'detach': {
      const { terminalId } = message;
      const terminal = terminals.get(terminalId);

      if (terminal) {
        terminal.clients.delete(ws);
        attachedTerminals.delete(terminalId);
      }
      break;
    }

    case 'input': {
      const { terminalId, data } = message;
      const terminal = terminals.get(terminalId);

      if (terminal && data) {
        terminal.pty.write(data);
      }
      break;
    }

    case 'resize': {
      const { terminalId, cols, rows } = message;
      const terminal = terminals.get(terminalId);

      if (terminal) {
        const safeCols = Number.isFinite(cols) && cols > 1 ? Math.floor(cols) : 0;
        const safeRows = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : 0;

        if (safeCols && safeRows) {
          try {
            terminal.pty.resize(safeCols, safeRows);
          } catch (e) {
            ws.send(JSON.stringify({
              type: 'resize_error',
              terminalId,
              message: e.message,
            }));
          }
        }
      }
      break;
    }

    case 'kill': {
      const { terminalId } = message;
      const terminal = terminals.get(terminalId);

      if (terminal) {
        try {
          terminal.pty.kill();
        } catch {}
        terminals.delete(terminalId);

        ws.send(JSON.stringify({
          type: 'killed',
          terminalId,
        }));
        console.log(`[PTY] Killed terminal ${terminalId}`);
      }
      break;
    }

    case 'buffer': {
      const { terminalId, lines = 100 } = message;
      const terminal = terminals.get(terminalId);

      if (terminal) {
        ws.send(JSON.stringify({
          type: 'buffer',
          terminalId,
          lines: terminal.outputBuffer.slice(-lines),
          totalLines: terminal.outputBuffer.length,
        }));
      }
      break;
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }));
  }
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('[PTY] Shutting down...');
  for (const [id, terminal] of terminals) {
    try {
      terminal.pty.kill();
    } catch {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[PTY] Shutting down...');
  for (const [id, terminal] of terminals) {
    try {
      terminal.pty.kill();
    } catch {}
  }
  process.exit(0);
});

httpServer.listen(PORT, () => {
  console.log(`[PTY] Server running on http://localhost:${PORT}`);
  console.log(`[PTY] WebSocket endpoint: ws://localhost:${PORT}`);
});
