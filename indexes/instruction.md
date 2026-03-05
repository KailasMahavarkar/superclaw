# NanoClaw Codebase Indexing Guide for LLMs

## Purpose of This Document

This guide instructs another LLM on how to approach indexing the NanoClaw codebase for feature extraction, dashboard integration, and system understanding. It provides a systematic methodology for analyzing the codebase and extracting actionable knowledge.

---

## How the Codebase is Organized

NanoClaw is a three-layer system with clear separation of concerns:

### Layer 1: Host Process (Node.js on the host machine)
- **Location**: `nanoclaw/src/`
- **Runtime**: Persistent service (launchd on macOS, systemd on Linux)
- **Responsibilities**:
  - Connects to messaging channels (WhatsApp via Baileys, Discord, Telegram, Slack)
  - Manages SQLite database (messages, groups, tasks, sessions, state)
  - Routes messages between channels and containers
  - Schedules and executes tasks
  - Watches IPC directories for container communication
  - Spawns and manages Docker containers for agent execution
- **Key entry point**: `src/index.ts` -- the `main()` function wires everything together
- **State management**: Mix of SQLite (persistent) and in-memory (runtime)

### Layer 2: Container Runtime (Docker/Apple Container)
- **Location**: `nanoclaw/container/Dockerfile`, `container/build.sh`
- **Purpose**: Isolation boundary for agent execution
- **Characteristics**:
  - Each agent invocation runs inside a Docker container (`nanoclaw-agent:latest`)
  - Container provides OS-level isolation: separate filesystem, no access to host secrets
  - Container mounts: group folder (rw), IPC directory (rw), project root (ro for main only), sessions directory (rw)
  - Entrypoint recompiles agent-runner TypeScript, then runs it with stdin JSON input
- **Security**: Mount allowlist enforced at host level, never accessible from container

### Layer 3: Agent Runner (inside the container)
- **Location**: `nanoclaw/container/agent-runner/src/`
- **Components**:
  - `index.ts` -- reads ContainerInput from stdin, calls Claude Agent SDK `query()`, writes ContainerOutput to stdout
  - `ipc-mcp-stdio.ts` -- MCP server providing tools to the agent: `send_message`, `schedule_task`, `list_tasks`, `pause_task`, `resume_task`, `cancel_task`, `register_group`
- **Protocol**: Uses OUTPUT_START_MARKER / OUTPUT_END_MARKER sentinel protocol for robust stdout parsing
- **Multi-turn support**: After initial query completes, polls `/workspace/ipc/input/` for follow-up messages
- **Lifecycle**: Container stays alive until idle timeout or explicit close signal


---

## Systematic Indexing Methodology

### Step 1: Identify Core Data Models (Start Here)

**Files to read first**:
1. `src/types.ts` -- All TypeScript interfaces (RegisteredGroup, NewMessage, ScheduledTask, TaskRunLog, Channel, ContainerConfig, MountAllowlist)
2. `src/db.ts` -- SQLite schema (the source of truth for all persistent state)
3. `src/config.ts` -- All constants, paths, intervals, env var reads

**What to extract**:
- Data structures and their relationships
- Database schema (tables, columns, indexes, foreign keys)
- Configuration constants and their defaults
- Environment variables and their effects

**Output format**:
```markdown
## Data Model: [EntityName]
- **Purpose**: [What this entity represents]
- **Storage**: [SQLite table / In-memory / Filesystem]
- **Key fields**: [List of important fields with descriptions]
- **Relationships**: [Foreign keys, references to other entities]
- **Lifecycle**: [When created, updated, deleted]
```

### Step 2: Trace Data Flows (Message Flow Example)

**Methodology**: Follow a single message from arrival to agent response

**Files to read in order**:
1. `src/channels/whatsapp.ts` -- Message arrival via Baileys
2. `src/db.ts` -- `storeMessage()` and `storeChatMetadata()`
3. `src/index.ts` -- `startMessageLoop()` and `processGroupMessages()`
4. `src/group-queue.ts` -- Concurrency control and queueing
5. `src/container-runner.ts` -- Container spawning and I/O
6. `container/agent-runner/src/index.ts` -- Agent execution
7. `src/router.ts` -- Message formatting and routing

**What to extract**:
- Entry points (where data enters the system)
- Transformation steps (how data is processed)
- Decision points (conditionals, routing logic)
- Exit points (where data leaves the system)
- Error handling (what happens when things fail)

**Output format**:
```markdown
## Data Flow: [FlowName]
1. **Entry**: [Where data enters] → [Function/file]
2. **Transform**: [How data is processed] → [Function/file]
3. **Decision**: [Conditional logic] → [Function/file]
4. **Action**: [What happens] → [Function/file]
5. **Exit**: [Where data goes] → [Function/file]

**Error paths**: [What happens on failure]
**Retry logic**: [Exponential backoff, max retries]
**Observability**: [Logs, metrics, traces]
```

### Step 3: Map Configuration Surfaces

**Files to read**:
1. `src/config.ts` -- Environment variables and constants
2. `src/env.ts` -- .env file parsing
3. `src/mount-security.ts` -- Mount allowlist structure
4. `src/db.ts` -- Per-group config in `registered_groups` table
5. `groups/*/CLAUDE.md` -- Memory files
6. `data/sessions/*/.claude/settings.json` -- SDK settings

**What to extract**:
- All environment variables (name, default, where read, what it controls, effect of changing)
- All hardcoded constants (value, where used, effect of changing)
- All config files (location, structure, validation rules)
- Per-entity config (groups, tasks, channels)
- Config change propagation (immediate, next spawn, requires restart)

**Output format**:
```markdown
## Config Surface: [ConfigName]
- **Type**: [Environment variable / Constant / File / Database]
- **Location**: [Where defined]
- **Default**: [Default value]
- **Where read**: [File and function]
- **What it controls**: [Detailed explanation]
- **Effect of changing**: [Immediate / Next spawn / Requires restart]
- **Validation**: [Rules, constraints, allowed values]
- **Dashboard integration**: [How dashboard should expose this]
```

### Step 4: Identify Observable States

**Files to read**:
1. `src/index.ts` -- In-memory state (lastTimestamp, sessions, registeredGroups)
2. `src/group-queue.ts` -- Queue state (activeCount, waitingGroups, per-group state)
3. `src/channels/whatsapp.ts` -- Channel state (connected, outgoingQueue)
4. `src/container-runtime.ts` -- Container lifecycle
5. `src/db.ts` -- Persistent state (all tables)

**What to extract**:
- In-memory state (not queryable from outside process)
- Persistent state (SQLite tables)
- Filesystem state (IPC files, logs, group folders)
- External state (Docker containers, channel connections)
- Derived state (computed from other state)

**Output format**:
```markdown
## Observable State: [StateName]
- **Type**: [In-memory / SQLite / Filesystem / Docker API]
- **Location**: [Where stored]
- **How to observe**: [Query, file watch, API call]
- **Update frequency**: [Real-time / Polling interval]
- **Dashboard relevance**: [What to display, how to visualize]
- **Actions available**: [What can be done with this state]
```

### Step 5: Document Action Triggers

**Files to read**:
1. `src/ipc.ts` -- IPC message types and handlers
2. `src/task-scheduler.ts` -- Task execution triggers
3. `src/group-queue.ts` -- Queue operations
4. `src/container-runner.ts` -- Container lifecycle actions

**What to extract**:
- IPC message types (structure, authorization, effects)
- Direct SQLite operations (what can be changed directly)
- Container actions (start, stop, send message, close)
- Service actions (restart, reload config)

**Output format**:
```markdown
## Action Trigger: [ActionName]
- **Mechanism**: [IPC file / SQLite write / Docker API / Service command]
- **Authorization**: [Who can trigger this action]
- **Input format**: [JSON structure, SQL query, command]
- **Side effects**: [What happens when triggered]
- **Error handling**: [What happens on failure]
- **Dashboard integration**: [Button, form, modal]
```

### Step 6: Extract Architectural Patterns

**What to look for**:
- Polling loops (intervals, what they poll, why)
- Event-driven patterns (callbacks, event emitters)
- Concurrency control (queues, locks, semaphores)
- Retry logic (exponential backoff, max retries)
- IPC protocols (file-based, stdin/stdout, markers)
- Security boundaries (container isolation, mount validation)

**Output format**:
```markdown
## Pattern: [PatternName]
- **Purpose**: [Why this pattern is used]
- **Implementation**: [How it's implemented]
- **Files involved**: [List of files]
- **Trade-offs**: [Pros and cons]
- **Dashboard implications**: [How dashboard should handle this]
```

---

## Which Files to Read First (Priority Order)

### Tier 1: Core Data Models (Read First)
1. `src/types.ts` -- All interfaces
2. `src/db.ts` -- Database schema and operations
3. `src/config.ts` -- Configuration constants

### Tier 2: Main Orchestrator (Read Second)
4. `src/index.ts` -- System initialization and message loop
5. `src/group-queue.ts` -- Concurrency control
6. `src/container-runner.ts` -- Container lifecycle

### Tier 3: Subsystems (Read Third)
7. `src/ipc.ts` -- IPC watcher and handlers
8. `src/task-scheduler.ts` -- Task scheduling
9. `src/channels/whatsapp.ts` -- Channel implementation
10. `src/router.ts` -- Message formatting and routing

### Tier 4: Supporting Modules (Read Fourth)
11. `src/mount-security.ts` -- Mount validation
12. `src/group-folder.ts` -- Path validation
13. `src/container-runtime.ts` -- Docker abstraction
14. `src/env.ts` -- Environment parsing
15. `src/logger.ts` -- Logging setup

### Tier 5: Container Side (Read Fifth)
16. `container/agent-runner/src/index.ts` -- Agent runner
17. `container/agent-runner/src/ipc-mcp-stdio.ts` -- MCP tools

### Tier 6: Skills and Setup (Read Last)
18. `.claude/skills/*/SKILL.md` -- Skill documentation
19. `setup/index.ts` -- Setup wizard
20. `skills-engine/` -- Skill application engine

---

## How to Trace a Feature Through the Codebase

### Example: Tracing Task Scheduling

**Step 1: Find the entry point**
- Search for "schedule_task" in codebase
- Found in: `src/ipc.ts` (IPC handler) and `container/agent-runner/src/ipc-mcp-stdio.ts` (MCP tool)

**Step 2: Follow the data flow**
1. Agent calls `schedule_task` MCP tool
2. MCP tool writes IPC file to `data/ipc/{group}/tasks/{ts}.json`
3. `startIpcWatcher()` in `src/ipc.ts` polls directory every 1s
4. `processTaskIpc()` validates authorization and calls `createTask()` in `src/db.ts`
5. `createTask()` inserts row into `scheduled_tasks` table
6. `startSchedulerLoop()` in `src/task-scheduler.ts` polls every 60s via `getDueTasks()`
7. Due tasks are enqueued via `queue.enqueueTask()`
8. `runTask()` spawns container via `runContainerAgent()`
9. After task runs, `updateTaskAfterRun()` calculates next_run for recurring tasks

**Step 3: Identify configuration**
- `SCHEDULER_POLL_INTERVAL` (60000ms) controls polling frequency
- `TIMEZONE` affects cron expression evaluation
- `MAIN_GROUP_FOLDER` determines authorization (only main can schedule for other groups)

**Step 4: Identify observable state**
- SQLite: `scheduled_tasks` table (all tasks)
- SQLite: `task_run_logs` table (execution history)
- Filesystem: `data/ipc/{group}/tasks/` (pending operations)

**Step 5: Identify actions**
- Schedule task (IPC file write)
- Pause task (SQLite update)
- Resume task (SQLite update)
- Cancel task (SQLite delete)
- Run task now (manual trigger via queue)

---

## How to Identify Extension Points for New Dashboard Features

### 1. Read-Only Observation
**What**: Display system state without modifying it
**How**: Query SQLite, watch filesystem, poll Docker API
**Examples**:
- Message activity feed (query `messages` table)
- Container monitor (Docker API)
- Task execution history (query `task_run_logs` table)

### 2. Configuration Changes
**What**: Modify system configuration
**How**: Write to SQLite tables, write config files
**Examples**:
- Edit group config (update `registered_groups` table)
- Edit environment variables (write `.env` file)
- Edit mount allowlist (write `~/.config/nanoclaw/mount-allowlist.json`)

### 3. Action Triggers
**What**: Trigger system actions
**How**: Write IPC files, execute Docker commands
**Examples**:
- Send message (write IPC file to `data/ipc/main/messages/`)
- Schedule task (write IPC file to `data/ipc/main/tasks/`)
- Force close container (Docker API: `docker stop`)

### 4. New Channels
**What**: Add support for new messaging platforms
**How**: Implement the `Channel` interface and register in `main()`
**Examples**:
- Discord channel (see `.claude/skills/add-discord/`)
- Telegram channel (see `.claude/skills/add-telegram/`)
- Slack channel (see `.claude/skills/add-slack/`)

### 5. New MCP Tools
**What**: Add new capabilities for agents
**How**: Add tools to `ipc-mcp-stdio.ts`, add IPC handlers to `ipc.ts`
**Examples**:
- File operations (read/write files in group folder)
- External API calls (fetch data from web services)
- Database queries (query custom tables)

### 6. GroupQueue State Exposure
**What**: Observe in-memory queue state
**How**: Currently in-memory only -- would need new observation mechanism
**Options**:
- Expose via HTTP endpoint (add Express server)
- Write state to SQLite periodically
- Emit events via EventEmitter

---

## Dashboard-Specific Indexing Checklist

When indexing for dashboard integration, ensure you extract:

### Data Sources
- [ ] All SQLite tables (schema, relationships, indexes)
- [ ] All filesystem state (directories, file formats, update patterns)
- [ ] All in-memory state (variables, maps, queues)
- [ ] All external state (Docker containers, channel connections)

### Configuration Surfaces
- [ ] All environment variables (with defaults and effects)
- [ ] All hardcoded constants (with values and effects)
- [ ] All config files (with locations and structures)
- [ ] All per-entity config (groups, tasks, channels)

### Observable States
- [ ] Real-time states (updated continuously)
- [ ] Polled states (updated on interval)
- [ ] Event-driven states (updated on trigger)
- [ ] Derived states (computed from other states)

### Action Triggers
- [ ] IPC message types (with formats and effects)
- [ ] Direct SQLite operations (with queries and effects)
- [ ] Docker API calls (with commands and effects)
- [ ] Service commands (with effects and requirements)

### Architectural Patterns
- [ ] Polling loops (intervals, targets, purposes)
- [ ] Event-driven patterns (events, handlers, side effects)
- [ ] Concurrency control (queues, limits, retry logic)
- [ ] IPC protocols (file-based, stdin/stdout, markers)
- [ ] Security boundaries (isolation, validation, authorization)

---

## Output Format for Indexed Knowledge

### File Structure
```
indexes/
  architecture.md       -- System architecture and data flows
  config-surface.md     -- All configuration surfaces
  dashboard-hooks.md    -- Dashboard integration points
  data-model.md         -- Data structures and relationships
  instruction.md        -- This file (indexing methodology)
  modules.md            -- Module-by-module breakdown
```

### Content Guidelines
- Use markdown for all documentation
- Include code examples (TypeScript, SQL, JSON)
- Provide file paths and line numbers where relevant
- Cross-reference between documents
- Keep language precise and technical
- Focus on actionable information (what, where, how, why)

---

## Common Pitfalls to Avoid

1. **Don't assume config is in config files**: NanoClaw uses .env for some config, process.env for others, SQLite for per-group config, and filesystem for memory files
2. **Don't ignore in-memory state**: Critical state like `registeredGroups` and `lastAgentTimestamp` is in-memory and not directly queryable
3. **Don't overlook IPC authorization**: Not all groups can trigger all IPC actions (e.g., only main can register groups)
4. **Don't forget container isolation**: Containers can only see mounted directories, not the entire host filesystem
5. **Don't miss polling intervals**: Many subsystems poll on intervals (2s, 60s, 1s) which affects dashboard update frequency
6. **Don't ignore restart requirements**: Some config changes take effect immediately, others require restart
7. **Don't forget security boundaries**: Mount allowlist is stored outside project root and never mounted into containers

---

## Validation Checklist

After indexing, verify you can answer these questions:

### Data Model
- [ ] What are all the SQLite tables and their relationships?
- [ ] What data is stored in-memory vs persistent?
- [ ] What data is stored on filesystem vs database?
- [ ] How do entities relate to each other (foreign keys, references)?

### Data Flows
- [ ] How does a message flow from arrival to agent response?
- [ ] How does a task get scheduled and executed?
- [ ] How does IPC communication work (container ↔ host)?
- [ ] How does configuration propagate through the system?

### Configuration
- [ ] What are all the environment variables and their effects?
- [ ] What config changes require restart vs take effect immediately?
- [ ] How is per-group config stored and accessed?
- [ ] Where are secrets stored and how are they passed to containers?

### Observability
- [ ] What system states can be observed in real-time?
- [ ] What states require polling and at what intervals?
- [ ] What logs are available and where are they stored?
- [ ] How can container lifecycle be monitored?

### Actions
- [ ] What actions can be triggered via IPC?
- [ ] What actions require direct SQLite writes?
- [ ] What actions require Docker API calls?
- [ ] What authorization rules apply to each action?

---

## Conclusion

This methodology provides a systematic approach to indexing the NanoClaw codebase. By following these steps, you can extract comprehensive knowledge about the system's architecture, data flows, configuration surfaces, and integration points.

The key is to start with data models, trace data flows, map configuration surfaces, identify observable states, document action triggers, and extract architectural patterns. This knowledge forms the foundation for building a dashboard or any other integration with NanoClaw.
