# NanoClaw Data Model

## SQLite Tables (store/messages.db)

### chats
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| jid | TEXT | PRIMARY KEY | Chat identifier. WhatsApp: `120363...@g.us` (groups), `1234567890@s.whatsapp.net` (DMs). Discord: `dc:...`. Telegram: `tg:...`. Special: `__group_sync__` |
| name | TEXT | | Display name of chat or group |
| last_message_time | TEXT | | ISO 8601 timestamp of most recent message |
| channel | TEXT | | "whatsapp", "discord", "telegram", or NULL |
| is_group | INTEGER | 0 | 1 for group chats, 0 for DMs |

### messages
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | TEXT | PK (composite) | Message ID from the messaging platform |
| chat_jid | TEXT | PK (composite) | FK to chats.jid |
| sender | TEXT | | Sender JID or identifier |
| sender_name | TEXT | | Human-readable sender name (pushName) |
| content | TEXT | | Message text content |
| timestamp | TEXT | | ISO 8601 timestamp |
| is_from_me | INTEGER | | 1 if sent from the bot's account |
| is_bot_message | INTEGER | 0 | 1 if message is from the bot (detected by prefix or is_from_me) |

Indexes: `idx_timestamp ON messages(timestamp)`

### scheduled_tasks
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | TEXT | PRIMARY KEY | Format: `task-{Date.now()}-{random6chars}` |
| group_folder | TEXT | NOT NULL | Group folder name this task belongs to |
| chat_jid | TEXT | NOT NULL | Target chat JID for sending results |
| prompt | TEXT | NOT NULL | Agent instructions for the task |
| schedule_type | TEXT | NOT NULL | "cron", "interval", or "once" |
| schedule_value | TEXT | NOT NULL | Cron expression, milliseconds, or ISO timestamp |
| context_mode | TEXT | 'isolated' | "group" (uses group session) or "isolated" (fresh session) |
| next_run | TEXT | | ISO timestamp of next scheduled execution |
| last_run | TEXT | | ISO timestamp of most recent execution |
| last_result | TEXT | | First 200 chars of last run result |
| status | TEXT | 'active' | "active", "paused", or "completed" |
| created_at | TEXT | NOT NULL | ISO timestamp of creation |

Indexes: `idx_next_run ON scheduled_tasks(next_run)`, `idx_status ON scheduled_tasks(status)`

### task_run_logs
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | INTEGER | AUTOINCREMENT PK | Auto-incrementing ID |
| task_id | TEXT | NOT NULL | FK to scheduled_tasks.id |
| run_at | TEXT | NOT NULL | ISO timestamp of execution start |
| duration_ms | INTEGER | NOT NULL | Execution duration in milliseconds |
| status | TEXT | NOT NULL | "success" or "error" |
| result | TEXT | | Result text (may be truncated) |
| error | TEXT | | Error message if status is "error" |

Indexes: `idx_task_run_logs ON task_run_logs(task_id, run_at)`

### router_state
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| key | TEXT | PRIMARY KEY | State key name |
| value | TEXT | NOT NULL | State value |

Known keys:
- `last_timestamp` -- ISO timestamp: the global message cursor. Messages with timestamp <= this have been seen by the polling loop.
- `last_agent_timestamp` -- JSON string: `{"chatJid1": "isoTimestamp", "chatJid2": "isoTimestamp"}`. Per-group cursor tracking which messages have been sent to the agent.

### sessions
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| group_folder | TEXT | PRIMARY KEY | Group folder name |
| session_id | TEXT | NOT NULL | Claude Agent SDK session identifier |

### registered_groups
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| jid | TEXT | PRIMARY KEY | Chat JID |
| name | TEXT | NOT NULL | Display name |
| folder | TEXT | NOT NULL, UNIQUE | Group folder name (alphanumeric, hyphens, underscores, 1-64 chars) |
| trigger_pattern | TEXT | NOT NULL | Trigger word (e.g., "@Andy") |
| added_at | TEXT | NOT NULL | ISO timestamp of registration |
| container_config | TEXT | | JSON string of ContainerConfig: `{"additionalMounts": [...], "timeout": 300000}` |
| requires_trigger | INTEGER | 1 | 1 = needs @trigger prefix; 0 = process all messages |

---

## In-Memory State (src/index.ts)

These are module-level variables in index.ts that are NOT directly queryable from outside the process:

| Variable | Type | Initial Value | Description |
|----------|------|---------------|-------------|
| `lastTimestamp` | string | "" | Global message cursor, loaded from router_state |
| `sessions` | Record<string, string> | {} | Map of groupFolder -> sessionId, loaded from sessions table |
| `registeredGroups` | Record<string, RegisteredGroup> | {} | Map of chatJid -> group config, loaded from registered_groups table |
| `lastAgentTimestamp` | Record<string, string> | {} | Map of chatJid -> last processed timestamp, loaded from router_state |
| `messageLoopRunning` | boolean | false | Guard preventing duplicate message loops |
| `whatsapp` | WhatsAppChannel | | WhatsApp connection instance |
| `channels` | Channel[] | [] | Array of all connected channels |
| `queue` | GroupQueue | new GroupQueue() | Concurrency manager |

### GroupQueue In-Memory State (src/group-queue.ts)

| Field | Type | Description |
|-------|------|-------------|
| `groups` | Map<string, GroupState> | Per-group state map |
| `activeCount` | number | Number of currently running containers |
| `waitingGroups` | string[] | JIDs waiting for a container slot |
| `processMessagesFn` | function | Callback for processing messages (set to processGroupMessages) |
| `shuttingDown` | boolean | Graceful shutdown flag |

### GroupState (per group in GroupQueue)

| Field | Type | Description |
|-------|------|-------------|
| `active` | boolean | Whether a container is currently running for this group |
| `idleWaiting` | boolean | Container finished work, waiting for IPC input |
| `isTaskContainer` | boolean | Whether the active container is running a scheduled task |
| `pendingMessages` | boolean | Whether new messages arrived while container was active |
| `pendingTasks` | QueuedTask[] | Tasks queued while container was active |
| `process` | ChildProcess \| null | Reference to the Docker container process |
| `containerName` | string \| null | Docker container name (e.g., "nanoclaw-main-1706745600000") |
| `groupFolder` | string \| null | Group folder name |
| `retryCount` | number | Exponential backoff retry count (max 5, base 5000ms) |

---

## Filesystem State

### groups/ directory
```
groups/
  global/
    CLAUDE.md          -- Shared instructions for all groups (mounted ro into non-main containers)
  main/
    CLAUDE.md          -- Main group memory/instructions
    logs/
      container-2026-01-31T12-00-00-000Z.log  -- Container execution logs
    conversations/
      2026-01-31-topic-name.md                -- Archived conversation transcripts
  {custom-group}/
    CLAUDE.md          -- Per-group memory
    logs/              -- Container logs for this group
    conversations/     -- Archived conversations
```

### data/ directory
```
data/
  ipc/
    {group-folder}/
      messages/        -- Outbound message IPC files (container -> host)
        {ts}-{rand}.json
      tasks/           -- Task operation IPC files (container -> host)
        {ts}-{rand}.json
      input/           -- Inbound IPC files (host -> container)
        {ts}-{rand}.json    -- Follow-up messages
        _close               -- Close sentinel (empty file)
      current_tasks.json     -- Tasks snapshot (host writes, container reads)
      available_groups.json  -- Groups snapshot (host writes, main container reads)
    errors/            -- Failed IPC files moved here with prefix
  sessions/
    {group-folder}/
      .claude/
        settings.json        -- Claude SDK settings
        skills/              -- Synced from container/skills/
      agent-runner-src/      -- Per-group copy of agent-runner source
```

### store/ directory
```
store/
  messages.db          -- SQLite database (all persistent state)
  auth/                -- WhatsApp Baileys auth state (multi-file)
    creds.json
    app-state-sync-*.json
    ...
  qr-data.txt          -- QR code data during auth (temporary)
  auth-status.txt       -- Auth status during setup (temporary)
```

### logs/ directory (when running as service)
```
logs/
  nanoclaw.log          -- stdout from launchd/systemd
  nanoclaw.error.log    -- stderr from launchd/systemd
```

---

## IPC Message Formats

### Container -> Host: Outbound Message
Written to `data/ipc/{group}/messages/{ts}-{rand}.json`:
```typescript
{
  type: "message",
  chatJid: string,       // Target chat JID
  text: string,          // Message text
  sender?: string,       // Optional role identity (for Telegram bots)
  groupFolder: string,   // Source group folder
  timestamp: string      // ISO timestamp
}
```

### Container -> Host: Task Operation
Written to `data/ipc/{group}/tasks/{ts}-{rand}.json`:
```typescript
// Schedule task
{
  type: "schedule_task",
  prompt: string,
  schedule_type: "cron" | "interval" | "once",
  schedule_value: string,
  context_mode: "group" | "isolated",
  targetJid: string,
  createdBy: string,
  timestamp: string
}

// Pause/resume/cancel task
{ type: "pause_task", taskId: string }
{ type: "resume_task", taskId: string }
{ type: "cancel_task", taskId: string }

// Register group (main only)
{
  type: "register_group",
  jid: string,
  name: string,
  folder: string,
  trigger: string,
  requiresTrigger?: boolean,
  containerConfig?: ContainerConfig
}

// Refresh groups (main only)
{ type: "refresh_groups" }
```

### Host -> Container: Follow-up Message
Written to `data/ipc/{group}/input/{ts}-{rand}.json`:
```typescript
{
  type: "message",
  text: string           // Formatted message XML or raw text
}
```

### Host -> Container: Close Sentinel
Written to `data/ipc/{group}/input/_close`:
Empty file. Signals agent runner to exit.

---

## Container Input/Output Protocol

### ContainerInput (stdin JSON, written once at container start)
```typescript
interface ContainerInput {
  prompt: string;              // Formatted message XML
  sessionId?: string;          // Claude session ID for continuity
  groupFolder: string;         // Group folder name
  chatJid: string;             // Chat JID
  isMain: boolean;             // Whether this is the main group
  isScheduledTask?: boolean;   // Whether this is a scheduled task
  assistantName?: string;      // Assistant name for message prefixing
  secrets?: Record<string, string>;  // API keys (deleted from input after read)
}
```

### ContainerOutput (stdout JSON, wrapped in markers)
```typescript
interface ContainerOutput {
  status: "success" | "error";
  result: string | null;       // Agent's text response (null for session-update markers)
  newSessionId?: string;       // Updated session ID
  error?: string;              // Error message if status is "error"
}
```

### OUTPUT_MARKER Protocol
```
---NANOCLAW_OUTPUT_START---
{"status":"success","result":"The answer is 42","newSessionId":"session-abc"}
---NANOCLAW_OUTPUT_END---
```

Multiple marker pairs may appear in a single container run:
1. One per agent query result (text response to user)
2. Session-update markers (result: null) emitted between query rounds
3. The host stream-parses these as they arrive (not waiting for container exit)

The host resets the container hard timeout on each OUTPUT_MARKER pair, allowing long-running multi-turn sessions.
