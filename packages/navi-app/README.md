# Navi App

The local Navi application package. This is the browser UI, Bun backend, PTY server, and CLI launcher without the marketing site.

## Run

```bash
cd packages/navi-app
bun install
bun run start
```

Opens at `http://localhost:1420`.

## CLI

After installing through the repo-level installer:

```bash
navi
```

You can also override the backend base port:

```bash
navi --port 3101
```
