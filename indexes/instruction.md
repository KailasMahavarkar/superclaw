# Codebase Indexing Guide

## Purpose

Guide for LLMs to systematically index and understand the NanoBot GUI monorepo.

## Codebase Organization

### Package 1: Dashboard (`dashboard/`)
- **Stack**: Next.js 16, React 19, Tailwind 4, shadcn/ui, better-sqlite3, axios, zod
- **Entry**: `src/app/layout.tsx` (root layout), `middleware.ts` (auth)
- **Pages**: `/chat`, `/agents`, `/tasks`, `/system`, `/login`
- **API**: `/api/v1/chats`, `/api/v1/tasks`, `/api/v1/agents`, `/api/v1/system`
- **Server logic**: `src/lib/server/nanoclaw.ts` (DB queries, IPC writes)

### Package 2: NanoClaw (`nanoclaw/`)
- **Stack**: Node.js 22, Baileys (WhatsApp), better-sqlite3, Docker, pino
- **Entry**: `src/index.ts` (main orchestrator)
- **Layers**: Host process (src/) -> Docker containers -> Agent runner (container/agent-runner/)

## Reading Priority

### Tier 1: Core Data Models
1. `nanoclaw/src/types.ts` - All interfaces
2. `nanoclaw/src/db.ts` - SQLite schema
3. `nanoclaw/src/config.ts` - Configuration constants
4. `dashboard/src/lib/contracts.ts` - API type contracts

### Tier 2: Orchestration
5. `nanoclaw/src/index.ts` - Main loop, state management
6. `nanoclaw/src/group-queue.ts` - Concurrency control
7. `nanoclaw/src/container-runner.ts` - Container lifecycle

### Tier 3: Subsystems
8. `nanoclaw/src/ipc.ts` - IPC watcher
9. `nanoclaw/src/task-scheduler.ts` - Task scheduling
10. `nanoclaw/src/channels/whatsapp.ts` - WhatsApp channel
11. `nanoclaw/src/router.ts` - Message formatting

### Tier 4: Dashboard
12. `dashboard/src/lib/server/nanoclaw.ts` - Server-side DB/IPC logic
13. `dashboard/src/lib/server/paths.ts` - Path resolution
14. `dashboard/src/lib/api.ts` - Client API calls
15. `dashboard/src/app/chat/page.tsx` - Main chat UI
16. `dashboard/middleware.ts` - Auth middleware

### Tier 5: Container Side
17. `nanoclaw/container/agent-runner/src/index.ts` - Agent runner
18. `nanoclaw/container/agent-runner/src/ipc-mcp-stdio.ts` - MCP tools

### Tier 6: Supporting
19. `nanoclaw/src/mount-security.ts` - Mount validation
20. `nanoclaw/src/group-folder.ts` - Path validation
21. `nanoclaw/src/env.ts` - Environment parsing
22. `nanoclaw/src/logger.ts` - Logging

## Key Data Flows

### Message Flow
WhatsApp -> Baileys -> storeMessage() -> SQLite -> messageLoop (2s) -> trigger check -> GroupQueue -> runContainerAgent() -> Claude SDK -> OUTPUT_MARKER -> sendMessage()

### Dashboard -> NanoClaw
Browser -> Next.js API route -> better-sqlite3 (read) or IPC file write (action) -> NanoClaw IPC watcher (1s) picks up

### Task Scheduling
Agent MCP tool -> IPC file -> ipc.ts processTaskIpc() -> createTask() SQLite -> schedulerLoop (60s) -> getDueTasks() -> runContainerAgent()

## Pitfalls

1. Dashboard reads SQLite directly (not via NanoClaw API) - no HTTP dependency between them
2. Dashboard writes actions as IPC files, not SQL - NanoClaw IPC watcher processes them
3. In-memory state (registeredGroups, queue state) not observable from dashboard
4. Config.ts values read once at import - most changes require NanoClaw restart
5. Secrets (ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN) re-read from .env per container spawn
6. Mount allowlist cached in memory after first load
7. Client-side polling pauses when browser tab is hidden

## When to Update Indexes

- New pages/API routes: Update modules.md, api-surface.md
- New DB tables/columns: Update data-model.md
- New env vars/config: Update config-surface.md
- Architecture changes: Update architecture.md
- New packages: Update README.md
