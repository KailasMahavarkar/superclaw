# Data Model

## SQLite Tables (nanoclaw/store/messages.db)

### chats
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| jid | TEXT | PK | Chat identifier. WhatsApp: `@g.us` (groups), `@s.whatsapp.net` (DMs). Discord: `dc:`. Telegram: `tg:`. Special: `__group_sync__` |
| name | TEXT | | Display name |
| last_message_time | TEXT | | ISO 8601 timestamp |
| channel | TEXT | | "whatsapp", "discord", "telegram", or NULL |
| is_group | INTEGER | 0 | 1 for groups, 0 for DMs |

### messages
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | TEXT | PK (composite) | Message ID from platform |
| chat_jid | TEXT | PK (composite) | FK to chats.jid |
| sender | TEXT | | Sender JID |
| sender_name | TEXT | | Display name (pushName) |
| content | TEXT | | Message text |
| timestamp | TEXT | | ISO 8601 timestamp |
| is_from_me | INTEGER | | 1 if sent from bot account |
| is_bot_message | INTEGER | 0 | 1 if bot-generated |

Index: `idx_timestamp ON messages(timestamp)`

### scheduled_tasks
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | TEXT | PK | Format: `task-{ts}-{rand}` |
| group_folder | TEXT | NOT NULL | Group folder name |
| chat_jid | TEXT | NOT NULL | Target chat JID |
| prompt | TEXT | NOT NULL | Agent instructions |
| schedule_type | TEXT | NOT NULL | "cron", "interval", "once" |
| schedule_value | TEXT | NOT NULL | Cron expr, ms, or ISO timestamp |
| context_mode | TEXT | 'isolated' | "group" or "isolated" |
| next_run | TEXT | | Next scheduled execution |
| last_run | TEXT | | Last execution |
| last_result | TEXT | | First 200 chars of last result |
| status | TEXT | 'active' | "active", "paused", "completed" |
| created_at | TEXT | NOT NULL | ISO timestamp |

Indexes: `idx_next_run`, `idx_status`

### task_run_logs
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | INTEGER | AUTOINCREMENT | |
| task_id | TEXT | NOT NULL | FK to scheduled_tasks.id |
| run_at | TEXT | NOT NULL | Execution start |
| duration_ms | INTEGER | NOT NULL | Duration |
| status | TEXT | NOT NULL | "success" or "error" |
| result | TEXT | | Result text |
| error | TEXT | | Error message |

Index: `idx_task_run_logs ON (task_id, run_at)`

### router_state
| Column | Type | Description |
|--------|------|-------------|
| key | TEXT (PK) | State key |
| value | TEXT | State value |

Keys: `last_timestamp` (global cursor), `last_agent_timestamp` (JSON `{chatJid: isoTimestamp}`)

### sessions
| Column | Type | Description |
|--------|------|-------------|
| group_folder | TEXT (PK) | Group folder name |
| session_id | TEXT | Claude Agent SDK session ID |

### registered_groups
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| jid | TEXT | PK | Chat JID |
| name | TEXT | NOT NULL | Display name |
| folder | TEXT | UNIQUE | Group folder (1-64 chars, alphanumeric/hyphen/underscore) |
| trigger_pattern | TEXT | NOT NULL | Trigger word (e.g., "@Andy") |
| added_at | TEXT | NOT NULL | ISO timestamp |
| container_config | TEXT | | JSON: `{"additionalMounts": [...], "timeout": ms}` |
| requires_trigger | INTEGER | 1 | 1=needs @trigger, 0=process all |

### Table Relationships
```
chats.jid <-- messages.chat_jid
chats.jid <-- registered_groups.jid
chats.jid <-- scheduled_tasks.chat_jid
registered_groups.folder <-- sessions.group_folder
registered_groups.folder <-- scheduled_tasks.group_folder
scheduled_tasks.id <-- task_run_logs.task_id
```

---

## Dashboard API Contracts (dashboard/src/lib/contracts.ts)

### ChatSummary
```typescript
{ jid: string; name: string | null; channel: string | null; isGroup: boolean;
  lastMessageTime: string | null; isRegistered: boolean; agentName?: string; folder?: string }
```

### ChatMessage
```typescript
{ id: string; chatJid: string; sender: string; senderName: string | null;
  content: string; timestamp: string; isFromMe: boolean; isBotMessage: boolean }
```

### PagedResult<T>
```typescript
{ items: T[]; nextCursor: string | null }
```

### TaskSummary
```typescript
{ id: string; groupFolder: string; chatJid: string; prompt: string;
  scheduleType: 'cron' | 'interval' | 'once'; scheduleValue: string;
  contextMode: string; nextRun: string | null; lastRun: string | null;
  lastResult: string | null; status: TaskStatus; createdAt: string }
```

### TaskRun
```typescript
{ id: number; taskId: string; runAt: string; durationMs: number;
  status: 'success' | 'error'; result: string | null; error: string | null }
```

### AgentConfig
```typescript
{ jid: string; name: string; folder: string; trigger: string;
  requiresTrigger: boolean; containerConfig: { additionalMounts?: ...; timeout?: number } | null;
  addedAt: string }
```

### SystemHealth
```typescript
{ whatsappConnected: boolean; activeContainers: number;
  registeredGroups: number; activeTasks: number;
  totalChats: number; recentActivity: string | null }
```

### MountAllowlist
```typescript
{ allowedRoots: { path: string; allowReadWrite: boolean; description: string }[];
  blockedPatterns: string[]; nonMainReadOnly: boolean; warnings?: string[] }
```

---

## IPC Message Formats

### Container -> Host: Outbound Message
`data/ipc/{group}/messages/{ts}-{rand}.json`
```json
{ "type": "message", "chatJid": "...", "text": "...", "groupFolder": "...", "timestamp": "..." }
```

### Container -> Host: Task Operations
`data/ipc/{group}/tasks/{ts}-{rand}.json`
```json
{ "type": "schedule_task", "prompt": "...", "schedule_type": "cron|interval|once",
  "schedule_value": "...", "context_mode": "group|isolated", "targetJid": "...", "timestamp": "..." }
{ "type": "pause_task|resume_task|cancel_task", "taskId": "..." }
{ "type": "register_group", "jid": "...", "name": "...", "folder": "...", "trigger": "..." }
{ "type": "refresh_groups" }
```

### Host -> Container: Follow-up Message
`data/ipc/{group}/input/{ts}-{rand}.json`
```json
{ "type": "message", "text": "..." }
```

### Host -> Container: Close Sentinel
`data/ipc/{group}/input/_close` (empty file)

### Container Input (stdin JSON)
```typescript
interface ContainerInput {
  prompt: string; sessionId?: string; groupFolder: string; chatJid: string;
  isMain: boolean; isScheduledTask?: boolean; assistantName?: string;
  secrets?: Record<string, string>;
}
```

### Container Output (stdout, wrapped in markers)
```typescript
interface ContainerOutput {
  status: "success" | "error"; result: string | null;
  newSessionId?: string; error?: string;
}
```

---

## Filesystem State

```
nanoclaw/
  store/
    messages.db              SQLite database
    auth/                    WhatsApp Baileys auth state
    qr-data.txt             QR code during auth (temp)
    auth-status.txt          Auth status during setup (temp)
  groups/
    global/CLAUDE.md         Shared instructions (mounted ro)
    {name}/CLAUDE.md         Per-group memory
    {name}/logs/             Container execution logs
    {name}/conversations/    Archived conversation transcripts
  data/
    ipc/{group}/messages/    Outbound IPC (container -> host)
    ipc/{group}/tasks/       Task IPC (container -> host)
    ipc/{group}/input/       Inbound IPC (host -> container)
    ipc/{group}/current_tasks.json    Tasks snapshot
    ipc/{group}/available_groups.json Groups snapshot (main only)
    ipc/errors/              Failed IPC files
    sessions/{group}/.claude/ Claude SDK settings per group
  logs/
    nanoclaw.log             Service stdout (pino JSON)
    nanoclaw.error.log       Service stderr
```
