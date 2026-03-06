# SuperClaw

SuperClaw is a Mutation of NanoClaw `v1.1.3` with opinionated core changes and a built-in dashboard UX for operations and end-user workflows.

## Status

Work in progress. Interfaces and behavior can change.

## Fork baseline

- Upstream base: NanoClaw `v1.1.3`
- Runtime model: containerized agent execution + SQLite state
- UI model: unified dashboard for chat, agents, tasks, and system controls

## Opinionated changes

- Unified dashboard-first workflow for both admin and end-user operations
- Trigger-gated group processing with strict regex control per registered group
- Local IPC-driven control plane for tasks, registration, and outbound messages
- Focus on explicit configuration over hidden defaults

## Workspace layout

- `nanoclaw/` - core service (message intake, DB, scheduler, container runner)
- `dashboard/` - Next.js UI + API surface
- `indexes/` - architecture summaries and codebase indexes

## Quick start

1. Start SuperClaw core:

```bash
cd nanoclaw
npm install
npm run dev
```

2. Start dashboard in a second terminal:

```bash
cd dashboard
npm install
```

Set environment variables before `npm run dev` in `dashboard/`.

macOS/Linux (bash/zsh):
```bash
export DASHBOARD_ADMIN_TOKEN="change-me"
# optional if core is not ../nanoclaw
export NANOCLAW_ROOT="/absolute/path/to/nanoclaw"
npm run dev
```

Windows PowerShell:
```powershell
$env:DASHBOARD_ADMIN_TOKEN="change-me"
# optional if core is not ..\nanoclaw
$env:NANOCLAW_ROOT="C:\\path\\to\\nanoclaw"
npm run dev
```

3. Open `http://localhost:3000` and log in with `DASHBOARD_ADMIN_TOKEN`.

## Docker image notes

Core uses a local image tag: `nanoclaw-agent:latest`.
You do not need to manually pull a public "latest" image by default.

Rebuild the local image when container code changes or on a fresh machine:

```bash
cd nanoclaw
docker build -t nanoclaw-agent:latest -f container/Dockerfile container
```

Runtime expectations:

- macOS/Linux: Docker or Apple Container runtime
- Windows: Docker Desktop (Linux containers mode)

If you run NanoClaw setup flow, image build/test is handled automatically.
