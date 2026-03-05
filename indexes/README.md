# NanoClaw Codebase Index

## Overview

This directory contains comprehensive semantic indexing of the NanoClaw codebase, designed to enable dashboard development, feature extraction, and system understanding. All documents are structured for both human readers and LLM consumption.

## Index Files

### 1. [instruction.md](./instruction.md)
**Purpose**: Systematic methodology for indexing the NanoClaw codebase

**Contents**:
- How the codebase is organized (3-layer architecture)
- Step-by-step indexing methodology
- Which files to read first (priority order)
- How to trace features through the codebase
- How to identify extension points
- Dashboard-specific indexing checklist
- Validation checklist

**Use this when**: You need to understand how to analyze NanoClaw or guide another LLM through the indexing process

---

### 2. [architecture.md](./architecture.md)
**Purpose**: System architecture, component relationships, and data flows

**Contents**:
- Host process components and their relationships
- Container boundary (what crosses, how, why)
- Complete data flow: Message In → Agent → Message Out
- SQLite schema (all tables with detailed descriptions)
- IPC protocol (file-based messaging formats)
- Channel abstraction layer

**Use this when**: You need to understand how the system works end-to-end, how components interact, or how data flows through the system

---

### 3. [data-model.md](./data-model.md)
**Purpose**: Comprehensive data structures and storage mechanisms

**Contents**:
- SQLite tables (schema, relationships, indexes)
- In-memory state (index.ts, group-queue.ts)
- Filesystem state (groups/, data/, store/, logs/)
- IPC message formats (container ↔ host)
- Container input/output protocol

**Use this when**: You need to understand what data exists, where it's stored, how to query it, or how to modify it

---

### 4. [config-surface.md](./config-surface.md)
**Purpose**: All configuration surfaces and their effects

**Contents**:
- Environment variables (.env file) with defaults and effects
- Config constants in config.ts
- Per-group configuration (registered_groups table)
- Mount allowlist (~/.config/nanoclaw/mount-allowlist.json)
- Memory files (CLAUDE.md hierarchy)
- Service configuration (launchd/systemd)

**Use this when**: You need to understand what can be configured, where config is stored, how to change it, or what effects changes have

---

### 5. [dashboard-hooks.md](./dashboard-hooks.md)
**Purpose**: Dashboard integration points and observability

**Contents**:
- SQLite queries the dashboard should run
- File paths to watch for changes
- How to observe container lifecycle
- How to read/write config without restarting
- How to trigger actions via IPC file writes
- Real-time data sources
- Dashboard config file specification

**Use this when**: You're building a dashboard and need to know what data to display, how to observe it, and how to trigger actions

---

### 6. [dashboard-architecture.md](./dashboard-architecture.md)
**Purpose**: High-level dashboard architecture diagram, data flows, and security model

**Contents**:
- System overview diagram
- Read/write data flows (Dashboard ↔ NanoClaw)
- Dashboard state management architecture (Zustand)
- Polling hooks and file watching strategies
- Config-driven rendering examples
- Security model and guarantees
- Recommended deployment options

**Use this when**: You are designing the initial dashboard application architecture, making decisions about state management, or reviewing security implications of dashboard actions

---

### 7. [modules.md](./modules.md)
**Purpose**: Module-by-module breakdown of the codebase

**Contents**:
- Purpose of each module
- Key exports and internal functions
- Dependencies and dependents
- Config surface per module
- Dashboard relevance per module

**Use this when**: You need to understand a specific module, find where functionality lives, or trace dependencies

---

## Quick Reference

### For Dashboard Development
1. Start with [dashboard-architecture.md](./dashboard-architecture.md) for the high-level dashboard design
2. Read [dashboard-hooks.md](./dashboard-hooks.md) for integration points
3. Read [data-model.md](./data-model.md) for data structures
4. Reference [config-surface.md](./config-surface.md) for configuration
5. Use [architecture.md](./architecture.md) for understanding data flows

### For Feature Extraction
1. Start with [instruction.md](./instruction.md) for methodology
2. Read [architecture.md](./architecture.md) for system overview
3. Use [modules.md](./modules.md) to find relevant code
4. Reference [data-model.md](./data-model.md) for data structures

### For System Understanding
1. Start with [architecture.md](./architecture.md) for big picture
2. Read [data-model.md](./data-model.md) for data structures
3. Reference [modules.md](./modules.md) for module details
4. Use [config-surface.md](./config-surface.md) for configuration

---

## Key Concepts

### Three-Layer Architecture
1. **Host Process** (src/) - Node.js service managing channels, database, containers
2. **Container Runtime** (container/) - Docker isolation boundary
3. **Agent Runner** (container/agent-runner/) - Claude Agent SDK execution

### Data Storage
- **SQLite** (store/messages.db) - Persistent state (messages, groups, tasks, sessions)
- **Filesystem** (groups/, data/) - Group folders, IPC files, logs, conversations
- **In-Memory** (index.ts, group-queue.ts) - Runtime state (cursors, queues, connections)

### Communication Patterns
- **Polling Loops** - Message loop (2s), scheduler (60s), IPC watcher (1s)
- **IPC Protocol** - File-based messaging (container ↔ host)
- **Streaming Output** - OUTPUT_MARKER protocol for container stdout

### Security Model
- **Container Isolation** - OS-level filesystem isolation
- **Mount Allowlist** - Tamper-proof security config outside project root
- **IPC Authorization** - Per-group permissions for IPC actions
- **Secret Handling** - Secrets passed via stdin, never mounted

---

## Dashboard Config-Driven Design

The dashboard is designed to be **configuration-driven**, meaning all features, layouts, and data sources are defined in `dashboard-config.json`. This allows:

1. **Feature Toggles**: Enable/disable panels (groups, messages, tasks, containers)
2. **Capability Control**: Read-only vs full admin control
3. **Polling Intervals**: Customize update frequencies per data source
4. **Layout Customization**: Position panels, set display limits
5. **Theme Control**: Dark/light mode, compact mode

See [ui-dashboard-analysis.md](../ui-dashboard-analysis.md) for complete dashboard design.

---

## Maintenance

### When to Update These Indexes

- **New features added**: Update architecture.md, data-model.md, modules.md
- **Config changes**: Update config-surface.md
- **New data sources**: Update data-model.md, dashboard-hooks.md
- **New IPC messages**: Update architecture.md, data-model.md
- **New modules**: Update modules.md

### How to Validate Indexes

Use the validation checklist in [instruction.md](./instruction.md) to ensure all indexes are complete and accurate.

---

## Related Documents

- [../ui-dashboard-analysis.md](../ui-dashboard-analysis.md) - Complete dashboard UI/UX design
- [../nanoclaw/README.md](../nanoclaw/README.md) - NanoClaw project README
- [../nanoclaw/docs/](../nanoclaw/docs/) - Additional technical documentation

---

## Version

**Index Version**: 2.0.0 (Re-indexed February 2026)
**NanoClaw Version**: 1.1.3
**Last Updated**: 2026-02-26

---

## Contributing

When updating these indexes:
1. Maintain the existing structure and format
2. Cross-reference between documents
3. Include code examples where relevant
4. Keep language precise and technical
5. Focus on actionable information
6. Update this README if adding new index files
