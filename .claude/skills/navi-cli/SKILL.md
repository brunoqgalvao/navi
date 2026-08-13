---
name: navi-cli
description: Operate Navi programmatically from a terminal — manage workspaces (projects), sessions, run commands, and control PTY terminals via the navi CLI or the local REST API on http://localhost:3021. Use when an agent or script needs to drive Navi without the GUI.
---

# Navi CLI & Local API

Drive Navi from the command line or over its local REST API. The CLI lives at
`packages/navi-app/bin/navi.ts` and is what ships as the `navi` binary.

## Targeting the right instance

All API subcommands default to `http://localhost:3021` (the live backend).
Override with `--port <n>` on any command or the `NAVI_PORT` env var.

**When developing Navi itself, do NOT experiment against :3021 — that's the
process we run inside.** Use the sandbox instead:

```bash
bun run sandbox start        # isolated backend on :4021 (own data dir)
navi ws list --port 4021
```

## CLI commands

```bash
navi help                                # full usage

# Workspaces (projects)
navi ws list                             # id, name, path
navi ws create <name> [path]             # path defaults to cwd; must exist
navi ws rm <id|name>                     # accepts full id, id prefix, or exact name

# Sessions
navi session new <ws> [--title t] [--prompt p]
navi session ls <ws>

# One-shot command execution (streams stdout/stderr, propagates exit code)
navi run "ls -la | head" [--cwd dir]     # quote anything with pipes/globs

# PTY terminals
navi term new [--cwd dir] [--session <sessionId>]
navi term ls
navi term kill <terminalId>
```

Workspace arguments (`<ws>`) resolve by full project id, id prefix, or exact
name — ambiguous prefixes error out.

## Behavior notes & gotchas

- **`session new --prompt` needs a connected UI.** `POST /api/sessions/:id/messages`
  dispatches the query through the Navi UI's WebSocket (`triggerQuery`). If no
  UI client is connected the backend returns 503; the CLI creates the session
  anyway and tells you the prompt wasn't dispatched.
- **`navi run` is synchronous**: it streams SSE until the process exits and
  exits with the same code. Ctrl+C kills the remote process
  (`DELETE /api/terminal/exec/:execId`).
- **PTY input is not HTTP.** Creating/listing/killing PTYs is REST, but typing
  into one goes over the main backend WebSocket (see below).

## Raw API reference

Base: `http://localhost:3021` (or your `--port`).

### Workspaces (projects)

```bash
curl -s localhost:3021/api/projects                        # list
curl -s -X POST localhost:3021/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"My App","path":"/abs/path"}'                # create (path must be an existing dir)
curl -s -X DELETE localhost:3021/api/projects/<id>         # delete
```

### Sessions & messages

```bash
curl -s localhost:3021/api/projects/<projectId>/sessions   # list
curl -s -X POST localhost:3021/api/projects/<projectId>/sessions \
  -H 'Content-Type: application/json' -d '{"title":"CLI session"}'
curl -s localhost:3021/api/sessions/<id>/messages          # message history
curl -s -X POST localhost:3021/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' -d '{"message":"Fix the failing test"}'
# → 503 "No active connection" if the Navi UI isn't open
```

### Command execution (SSE stream)

```bash
curl -sN -X POST localhost:3021/api/terminal/exec \
  -H 'Content-Type: application/json' \
  -d '{"command":"echo hi","cwd":"/tmp"}'
# events: {"type":"started","execId":...} → stdout/stderr → {"type":"exit","code":0}
curl -s -X DELETE localhost:3021/api/terminal/exec/<execId>   # kill
curl -s localhost:3021/api/terminal/exec                      # list running
```

### PTY terminals

```bash
curl -s -X POST localhost:3021/api/terminal/pty \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/abs/path","cols":80,"rows":24}'             # → {terminalId, pid, ...}
curl -s localhost:3021/api/terminal/pty                    # list
curl -s "localhost:3021/api/terminal/pty/<id>/buffer?lines=100"  # read output
curl -s -X DELETE localhost:3021/api/terminal/pty/<id>     # kill
```

**Sending input**: connect to the main WebSocket at `ws://localhost:3021/ws`
and send:

```json
{ "type": "terminal_attach", "terminalId": "<id>" }
{ "type": "terminal_input", "terminalId": "<id>", "data": "ls -la\n" }
```

Output arrives as `terminal_output` messages on the same socket; without a
socket you can poll the `/buffer` endpoint instead.
