# (experimental) nanobot-gui

Minimal workspace for NanoClaw + Dashboard.

## Codebase layout

- `nanoclaw/`: core TypeScript/Node service (chat handling, SQLite state, task scheduling, containerized agent runs).
- `dashboard/`: Next.js UI + API for monitoring/managing NanoClaw.
- `indexes/`: architecture and indexing docs for quick system understanding.

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop (or Apple Container on macOS)
- Optional: Claude Code CLI (for guided NanoClaw setup)

## Basic installation

1. Start NanoClaw:

```bash
cd nanoclaw
npm install
npm run dev
```

2. Start Dashboard (new terminal):

```bash
cd dashboard
npm install
```

Set required dashboard auth token:

```powershell
$env:DASHBOARD_ADMIN_TOKEN="change-me"
```

Optional (only if NanoClaw is not at `../nanoclaw` relative to `dashboard/`):

```powershell
$env:NANOCLAW_ROOT="C:\\path\\to\\nanoclaw"
```

Run dashboard:

```bash
npm run dev
```

3. Open `http://localhost:3000` and sign in using `DASHBOARD_ADMIN_TOKEN`.

## Notes

- Dashboard reads NanoClaw data from `store/messages.db` under the resolved NanoClaw root.
- For first-time NanoClaw provisioning/auth/service setup, run `claude` inside `nanoclaw/` and execute `/setup`.
