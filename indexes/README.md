# NanoBot GUI Codebase Index

## Overview

Monorepo containing two packages:
- **dashboard/** - Next.js 16 admin UI (React 19, shadcn/ui, better-sqlite3)
- **nanoclaw/** - Node.js WhatsApp bot engine (Baileys, Docker containers, Claude Agent SDK)

The dashboard observes and controls the NanoClaw backend via direct SQLite reads and file-based IPC writes.

## Index Files

| File | Purpose |
|------|---------|
| [architecture.md](./architecture.md) | System architecture, data flows, container boundary, IPC protocol |
| [modules.md](./modules.md) | Module-by-module breakdown of both packages |
| [data-model.md](./data-model.md) | SQLite schema, API contracts, IPC message formats |
| [config-surface.md](./config-surface.md) | All env vars, constants, config files, and their effects |
| [api-surface.md](./api-surface.md) | Dashboard REST API endpoints and authentication |
| [instruction.md](./instruction.md) | Indexing methodology for LLMs |

## Quick Reference

### Project Structure
```
nanobot-gui/
  dashboard/               Next.js 16 app (port 3000)
    src/app/               App Router pages + API routes
    src/components/        UI components (shadcn + custom)
    src/lib/               Client utilities, contracts, API client
    src/lib/server/        Server-side DB access, path resolution, auth
    middleware.ts          Auth middleware
  nanoclaw/                Node.js bot engine
    src/                   Host process (channels, DB, containers, IPC)
    container/             Docker image + agent-runner
    container/agent-runner/ Claude Agent SDK runner + MCP tools
  indexes/                 This directory
```

### Key Technologies
- **Dashboard**: Next.js 16.1.6, React 19, Tailwind 4, shadcn/ui, axios, better-sqlite3, zod
- **NanoClaw**: Node.js 22, Baileys (WhatsApp), better-sqlite3, Docker, pino
- **Agent Runner**: Claude Agent SDK, MCP SDK, cron-parser, zod

### Three-Layer Architecture
1. **Dashboard** (Next.js) - Admin UI + REST API, reads SQLite directly, writes IPC files
2. **Host Process** (nanoclaw/src/) - Persistent service managing channels, DB, containers
3. **Agent Runner** (container/agent-runner/) - Claude Agent SDK inside Docker containers

### Data Storage
- **SQLite** (nanoclaw/store/messages.db) - Messages, groups, tasks, sessions, state
- **Filesystem** (nanoclaw/groups/, nanoclaw/data/) - Group folders, IPC files, logs
- **In-Memory** (nanoclaw host process) - Runtime cursors, queues, connections

## Version

**Index Version**: 3.0.0
**Last Updated**: 2026-03-06
