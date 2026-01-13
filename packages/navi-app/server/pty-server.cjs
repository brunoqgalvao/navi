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
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// Resolve the user's actual PATH by running their login shell
// GUI apps on macOS don't inherit shell PATH, so we need to fetch it
let cachedUserPath = null;
function getUserPath() {
  if (cachedUserPath) return cachedUserPath;

  const shell = process.env.SHELL || '/bin/zsh';
  const baseEnv = { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };

  try {
    // -ilc loads both login files and ~/.zshrc where users typically set PATH
    cachedUserPath = execFileSync(shell, ['-ilc', 'printf %s "$PATH"'], {
      env: baseEnv,
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    return cachedUserPath;
  } catch (e) {
    console.error('[PTY] Failed to get user PATH from shell:', e.message);
    // Fallback: try path_helper (macOS system utility)
    try {
      const out = execFileSync('/usr/libexec/path_helper', ['-s'], { encoding: 'utf8' });
      const match = out.match(/PATH="([^"]+)"/);
      if (match) {
        cachedUserPath = match[1];
        return cachedUserPath;
      }
    } catch {}
    // Final fallback: common paths
    cachedUserPath = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
    return cachedUserPath;
  }
}

// When running in Tauri bundled mode, modules are in pty-node_modules directory
// alongside this script in the resources folder
function loadModule(moduleName) {
  // Try standard require first
  try {
    return require(moduleName);
  } catch (e) {
    // If that fails, try from pty-node_modules relative to this script
    const ptyNodeModulesPath = path.join(__dirname, 'pty-node_modules', moduleName);
    if (fs.existsSync(ptyNodeModulesPath)) {
      return require(ptyNodeModulesPath);
    }
    // Re-throw original error if not found
    throw e;
  }
}

const { WebSocketServer } = loadModule('ws');
const pty = loadModule('node-pty');

const PREFERRED_PORT = parseInt(process.env.PTY_PORT || '3002', 10);
let PORT = PREFERRED_PORT;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(preferredPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferredPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find available port starting from ${preferredPort}`);
}

// Active PTY sessions
const terminals = new Map();

// Index terminals by projectId for quick lookup
const terminalsByProject = new Map(); // projectId -> Set<terminalId>

// Output buffer settings - store raw chunks, not split lines
const MAX_BUFFER_SIZE = 100000; // ~100KB of terminal output
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Create HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({
      status: 'ok',
      terminals: terminals.size,
      uptime: process.uptime()
    }));
    return;
  }

  if (req.url === '/terminals' || req.url.startsWith('/terminals?')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const projectId = url.searchParams.get('projectId');
    
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    
    let terminalList;
    if (projectId) {
      // Filter by projectId
      const projectTerminalIds = terminalsByProject.get(projectId) || new Set();
      terminalList = Array.from(projectTerminalIds)
        .map(id => terminals.get(id))
        .filter(Boolean)
        .map(t => ({
          terminalId: t.id,
          pid: t.pty.pid,
          cwd: t.cwd,
          createdAt: t.createdAt,
          projectId: t.projectId,
          name: t.name,
        }));
    } else {
      terminalList = Array.from(terminals.entries()).map(([id, t]) => ({
        terminalId: id,
        pid: t.pty.pid,
        cwd: t.cwd,
        createdAt: t.createdAt,
        projectId: t.projectId,
        name: t.name,
      }));
    }
    res.end(JSON.stringify(terminalList));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
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
      const { cwd = os.homedir(), cols = 80, rows = 24, projectId, name = 'Terminal' } = message;
      const safeCols = Number.isFinite(cols) && cols > 1 ? Math.floor(cols) : 80;
      const safeRows = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : 24;

      const shell = process.platform === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/bash';

      const terminalId = crypto.randomUUID();

      // Get the user's actual PATH by running their shell
      // This ensures npm, bun, node etc. are available in the terminal
      const shellEnv = { ...process.env, PATH: getUserPath() };

      try {
        // Don't use -l flag as the PATH is already resolved from user's shell
        const ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: safeCols,
          rows: safeRows,
          cwd,
          env: shellEnv,
        });

        const terminal = {
          id: terminalId,
          pty: ptyProcess,
          cwd,
          createdAt: Date.now(),
          projectId,
          name,
          outputBuffer: '', // Raw string buffer
          clients: new Set([ws]),
        };

        terminals.set(terminalId, terminal);
        attachedTerminals.add(terminalId);

        // Add to project index
        if (projectId) {
          if (!terminalsByProject.has(projectId)) {
            terminalsByProject.set(projectId, new Set());
          }
          terminalsByProject.get(projectId).add(terminalId);
        }

        // Handle output
        ptyProcess.onData((data) => {
          // Buffer raw output
          terminal.outputBuffer += data;
          // Trim if too large (keep last MAX_BUFFER_SIZE chars)
          if (terminal.outputBuffer.length > MAX_BUFFER_SIZE) {
            terminal.outputBuffer = terminal.outputBuffer.slice(-MAX_BUFFER_SIZE);
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
              context: terminal.outputBuffer.slice(-2000),
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
          // Clean up from indexes
          terminals.delete(terminalId);
          if (projectId && terminalsByProject.has(projectId)) {
            terminalsByProject.get(projectId).delete(terminalId);
          }
        });

        ws.send(JSON.stringify({
          type: 'created',
          terminalId,
          pid: ptyProcess.pid,
          shell,
          cwd,
          projectId,
          name,
        }));
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

      // Send full buffer (entire terminal history)
      if (terminal.outputBuffer) {
        ws.send(JSON.stringify({
          type: 'output',
          terminalId,
          data: terminal.outputBuffer,
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
        
        // Clean up project index
        if (terminal.projectId && terminalsByProject.has(terminal.projectId)) {
          terminalsByProject.get(terminal.projectId).delete(terminalId);
        }

        ws.send(JSON.stringify({
          type: 'killed',
          terminalId,
        }));
      }
      break;
    }

    case 'list': {
      const { projectId } = message;
      
      let terminalList;
      if (projectId) {
        const projectTerminalIds = terminalsByProject.get(projectId) || new Set();
        terminalList = Array.from(projectTerminalIds)
          .map(id => terminals.get(id))
          .filter(Boolean)
          .map(t => ({
            terminalId: t.id,
            pid: t.pty.pid,
            cwd: t.cwd,
            createdAt: t.createdAt,
            projectId: t.projectId,
            name: t.name,
          }));
      } else {
        terminalList = Array.from(terminals.entries()).map(([id, t]) => ({
          terminalId: id,
          pid: t.pty.pid,
          cwd: t.cwd,
          createdAt: t.createdAt,
          projectId: t.projectId,
          name: t.name,
        }));
      }
      
      ws.send(JSON.stringify({
        type: 'list',
        terminals: terminalList,
        projectId,
      }));
      break;
    }

    case 'buffer': {
      const { terminalId, chars = 10000 } = message;
      const terminal = terminals.get(terminalId);

      if (terminal) {
        ws.send(JSON.stringify({
          type: 'buffer',
          terminalId,
          data: terminal.outputBuffer.slice(-chars),
          totalSize: terminal.outputBuffer.length,
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
  for (const [id, terminal] of terminals) {
    try {
      terminal.pty.kill();
    } catch {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  for (const [id, terminal] of terminals) {
    try {
      terminal.pty.kill();
    } catch {}
  }
  process.exit(0);
});

async function start() {
  PORT = await findAvailablePort(PREFERRED_PORT);
  httpServer.listen(PORT);
}

start().catch(err => {
  console.error('[PTY] Failed to start:', err);
  process.exit(1);
});
