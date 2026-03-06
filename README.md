# SuperClaw

A mutation of [NanoClaw](https://github.com/qwibitai/nanoclaw) with opinionated core changes and a built-in dashboard for operations and end-user workflows.

NanoClaw gives you an AI assistant that runs agents securely in containers. SuperClaw adds a full web UI on top so you can manage chats, agents, tasks, and system configuration from a browser instead of the command line.

## What's Different from NanoClaw

| | NanoClaw | SuperClaw |
|---|---|---|
| **Interface** | CLI / chat only | Web dashboard + chat |
| **Config** | Edit `.env` by hand | Form builder with validation |
| **Agent management** | Chat commands | Visual registration + editing |
| **Task scheduling** | Chat commands | Create/pause/cancel from UI |
| **Chat history** | SQLite queries | Searchable chat viewer |
| **System monitoring** | Log files | Live health dashboard + log tail |

SuperClaw is a not a fork it a mutation. The core NanoClaw engine (`nanoclaw/`) runs majorly unchanged currently. The dashboard reads its SQLite database directly and writes IPC files for actions.

## Workspace Layout

```
superclaw/
  nanoclaw/       # Core service (message intake, DB, scheduler, container runner)
  dashboard/      # Next.js UI + API surface
  indexes/        # Architecture summaries and codebase indexes
```

## Quick Start

### 1. Start NanoClaw core

```bash
cd nanoclaw
npm install
npm run dev
```

If this is a fresh install, run `claude` then `/setup` to authenticate WhatsApp, build the container image, and configure services.

### 2. Start the dashboard

```bash
cd dashboard
bun install   # or npm install
```

Set environment variables before starting:

**macOS/Linux:**
```bash
export DASHBOARD_ADMIN_TOKEN="your-secret-token"
# Optional: defaults to ../nanoclaw
export NANOCLAW_ROOT="/absolute/path/to/nanoclaw"
bun dev
```

**Windows PowerShell:**
```powershell
$env:DASHBOARD_ADMIN_TOKEN="your-secret-token"
# Optional: defaults to ..\nanoclaw
$env:NANOCLAW_ROOT="C:\path\to\nanoclaw"
bun dev
```

### 3. Open the dashboard

Navigate to `http://localhost:3000` and log in with your `DASHBOARD_ADMIN_TOKEN`.

## Dashboard Pages

| Page | Purpose |
|------|---------|
| `/chat` | Browse conversations, search messages, send replies |
| `/agents` | Register/edit/delete group agents with trigger patterns |
| `/tasks` | Create scheduled tasks (cron/interval/once), pause/resume/cancel |
| `/system` | Health monitoring, `.env` config editor (form + raw), mount allowlist, logs |
| `/login` | Token authentication |

## How It Works

The dashboard does **not** run its own bot or connect to WhatsApp. It sits alongside NanoClaw and communicates through two mechanisms:

- **Reads**: Direct SQLite queries against NanoClaw's database (chats, messages, tasks, agents, sessions)
- **Writes**: Atomic JSON files dropped into NanoClaw's IPC directories (messages, task actions, agent registration)

This means the dashboard is stateless and can be started/stopped independently without affecting the running bot.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, shadcn/ui, lucide-react |
| Forms | React Hook Form + zod |
| State | Zustand (client), SQLite (server reads) |
| Auth | Token-based with HTTP-only cookies |
| Database | better-sqlite3 (read-only against NanoClaw DB) |

## Container Image

NanoClaw uses a local Docker image: `nanoclaw-agent:latest`. Rebuild when container code changes:

```bash
cd nanoclaw
docker build -t nanoclaw-agent:latest -f container/Dockerfile container
```

Supported runtimes:
- **macOS**: Docker Desktop or Apple Container
- **Linux**: Docker
- **Windows**: Docker Desktop (Linux containers mode)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DASHBOARD_ADMIN_TOKEN` | Yes | Token for dashboard login |
| `NANOCLAW_ROOT` | No | Path to NanoClaw directory (defaults to `../nanoclaw`) |
| `DASHBOARD_RESTART_COMMAND` | No | Shell command to restart NanoClaw from the dashboard |

NanoClaw's own `.env` (API keys, container settings, etc.) is managed through the dashboard's System page.

## Fork Baseline

- Upstream: [NanoClaw](https://github.com/qwibitai/nanoclaw) `v1.1.3`
- Runtime model: containerized agent execution + SQLite state
- UI model: unified dashboard for chat, agents, tasks, and system controls

## Status

Work in progress. Interfaces and behavior can change.

## License

MIT
