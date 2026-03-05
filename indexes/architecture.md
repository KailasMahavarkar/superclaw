# NanoClaw System Architecture

## Host Process Components and Their Relationships

```
main() [src/index.ts]
  |
  |-- ensureContainerRuntimeRunning() [container-runtime.ts]
  |-- cleanupOrphans() [container-runtime.ts]
  |-- initDatabase() [db.ts]
  |-- loadState() [index.ts] -- reads router_state, sessions, registeredGroups from SQLite
  |
  |-- WhatsAppChannel [channels/whatsapp.ts]
  |     |-- connect() -> Baileys socket
  |     |-- messages.upsert -> onMessage() -> storeMessage() [db.ts]
  |     |                   -> onChatMetadata() -> storeChatMetadata() [db.ts]
  |     |-- sendMessage() -> sock.sendMessage()
  |     |-- syncGroupMetadata() -> updateChatName() [db.ts]
  |     |-- setTyping() -> sock.sendPresenceUpdate()
  |
  |-- startSchedulerLoop() [task-scheduler.ts]
  |     |-- polls every 60s via getDueTasks() [db.ts]
  |     |-- queue.enqueueTask() -> runTask() -> runContainerAgent()
  |     |-- logTaskRun(), updateTaskAfterRun() [db.ts]
  |
  |-- startIpcWatcher() [ipc.ts]
  |     |-- polls data/ipc/{group}/messages/ every 1s
  |     |-- polls data/ipc/{group}/tasks/ every 1s
  |     |-- processTaskIpc() handles: schedule_task, pause_task, resume_task,
  |     |   cancel_task, refresh_groups, register_group
  |     |-- sends messages via channel.sendMessage()
  |
  |-- GroupQueue [group-queue.ts]
  |     |-- setProcessMessagesFn(processGroupMessages)
  |     |-- manages concurrency (MAX_CONCURRENT_CONTAINERS)
  |     |-- enqueueMessageCheck() -> runForGroup() -> processGroupMessages()
  |     |-- enqueueTask() -> runTask()
  |     |-- sendMessage() -> writes IPC input files for active containers
  |     |-- closeStdin() -> writes _close sentinel
  |     |-- drainGroup() / drainWaiting() for queue management
  |     |-- registerProcess() tracks container ChildProcess + name
  |     |-- notifyIdle() marks container as idle
  |
  |-- startMessageLoop() [index.ts]
  |     |-- polls every 2s via getNewMessages() [db.ts]
  |     |-- groups messages by chatJid
  |     |-- checks trigger pattern (non-main groups)
  |     |-- queue.sendMessage() to pipe to active container
  |     |-- queue.enqueueMessageCheck() if no active container
  |
  |-- recoverPendingMessages() [index.ts]
        |-- on startup, checks for unprocessed messages per group
        |-- enqueues them for processing
```

## Container Boundary

```
HOST SIDE                           CONTAINER SIDE
==========                          ==============

groups/{name}/          -- bind -->  /workspace/group (rw)
groups/global/          -- bind -->  /workspace/global (ro, non-main only)
{project-root}/         -- bind -->  /workspace/project (ro, main only)
data/sessions/{name}/.claude/  -->  /home/node/.claude (rw)
data/ipc/{name}/        -- bind -->  /workspace/ipc (rw)
data/sessions/{name}/agent-runner-src/ --> /app/src (rw)
extra mounts            -- bind -->  /workspace/extra/{name} (validated)

ContainerInput JSON     -- stdin --> agent-runner reads from stdin
                                     |
                                     v
                                     Claude Agent SDK query()
                                     |
                                     v
ContainerOutput JSON    <-- stdout-- OUTPUT_START/END markers
stderr (SDK logs)       <-- stderr-- debug output
IPC files               <-- bind --> /workspace/ipc/messages/*.json
                                     /workspace/ipc/tasks/*.json
IPC input files         --> bind --> /workspace/ipc/input/*.json
Close sentinel          --> bind --> /workspace/ipc/input/_close
```

### What Crosses the Container Boundary

| Direction | Mechanism | Data |
|-----------|-----------|------|
| Host -> Container | stdin (once) | ContainerInput JSON (prompt, sessionId, groupFolder, chatJid, isMain, secrets) |
| Host -> Container | IPC file write | Follow-up messages: `{type:"message", text:"..."}` |
| Host -> Container | IPC file write | Close sentinel: empty `_close` file |
| Host -> Container | Bind mount (ro) | Tasks snapshot: `current_tasks.json` |
| Host -> Container | Bind mount (ro) | Groups snapshot: `available_groups.json` |
| Host -> Container | Bind mount (rw) | Group folder (CLAUDE.md, conversations/, logs/) |
| Host -> Container | Env var | TZ (timezone) |
| Container -> Host | stdout | ContainerOutput JSON wrapped in OUTPUT_MARKER sentinels |
| Container -> Host | IPC file write | Outbound messages: `{type:"message", chatJid, text}` |
| Container -> Host | IPC file write | Task operations: `{type:"schedule_task"|"pause_task"|...}` |
| Container -> Host | IPC file write | Group registration: `{type:"register_group", jid, name, folder, trigger}` |
| Container -> Host | IPC file write | Group refresh: `{type:"refresh_groups"}` |
| Container -> Host | Bind mount (rw) | Session data in /home/node/.claude/ |
| Container -> Host | Bind mount (rw) | Files written to /workspace/group/ (conversations/, logs/) |

## Data Flow: Message In -> Agent -> Message Out

```
1. WhatsApp message arrives
   |
   v
2. Baileys messages.upsert event fires
   |
   v
3. WhatsAppChannel.onMessage() -> storeMessage() writes to SQLite messages table
   WhatsAppChannel.onChatMetadata() -> storeChatMetadata() writes to SQLite chats table
   |
   v
4. startMessageLoop() polls getNewMessages(registeredJids, lastTimestamp)
   Returns messages with timestamp > lastTimestamp, not from bot, in registered groups
   |
   v
5. Check trigger: main group = always, requiresTrigger=false = always,
   others = must start with @nanoName
   |
   v
6a. Active container exists for this group?
    YES -> queue.sendMessage() writes IPC file to data/ipc/{group}/input/{ts}.json
    |
6b. NO -> queue.enqueueMessageCheck() -> processGroupMessages()
    |
    v
7. processGroupMessages():
   - getMessagesSince(chatJid, lastAgentTimestamp) to get all pending messages
   - formatMessages() wraps in <messages><message sender="..." time="...">content</message></messages>
   - Advances lastAgentTimestamp cursor
   - Calls runAgent() -> runContainerAgent()
   |
   v
8. runContainerAgent():
   - buildVolumeMounts() computes all bind mounts
   - Spawns: docker run -i --rm --name nanoclaw-{folder}-{ts} [mounts] nanoclaw-agent:latest
   - Writes ContainerInput JSON to stdin (includes secrets)
   - Parses stdout for OUTPUT_START_MARKER...JSON...OUTPUT_END_MARKER pairs
   |
   v
9. Inside container (agent-runner/src/index.ts):
   - Reads ContainerInput from stdin
   - Calls query() with prompt, sessionId, MCP server, hooks
   - For each result message from SDK, calls writeOutput() -> OUTPUT_MARKER + JSON
   - After query completes, enters IPC poll loop: waitForIpcMessage()
   - New IPC messages start new query() calls (multi-turn)
   - _close sentinel or idle timeout ends the loop
   |
   v
10. Host receives streamed output:
    - Parses ContainerOutput from stdout markers
    - Calls channel.sendMessage(chatJid, text) for each result with non-null text
    - Strips <internal>...</internal> tags before sending
    - Updates session ID in SQLite
    |
    v
11. WhatsApp delivers the response to the group
```

## SQLite Schema

Database file: `store/messages.db`

### Table: chats
```sql
CREATE TABLE chats (
  jid TEXT PRIMARY KEY,              -- WhatsApp JID (e.g., "120363...@g.us") or special "__group_sync__"
  name TEXT,                         -- Display name of chat/group
  last_message_time TEXT,            -- ISO timestamp of last message
  channel TEXT,                      -- "whatsapp", "discord", "telegram", or NULL
  is_group INTEGER DEFAULT 0         -- 1 for groups, 0 for DMs
);
```
Purpose: Group discovery and metadata. All chats are tracked here (not just registered ones) so the dashboard can show available groups.

### Table: messages
```sql
CREATE TABLE messages (
  id TEXT,                           -- Message ID from the channel
  chat_jid TEXT,                     -- FK to chats.jid
  sender TEXT,                       -- Sender JID
  sender_name TEXT,                  -- Display name of sender
  content TEXT,                      -- Message text content
  timestamp TEXT,                    -- ISO timestamp
  is_from_me INTEGER,                -- 1 if sent by the bot's phone number
  is_bot_message INTEGER DEFAULT 0,  -- 1 if this is a bot-generated message
  PRIMARY KEY (id, chat_jid),
  FOREIGN KEY (chat_jid) REFERENCES chats(jid)
);
CREATE INDEX idx_timestamp ON messages(timestamp);
```
Purpose: Message history for registered groups. Only stores messages for groups in registered_groups, not all chats.

### Table: scheduled_tasks
```sql
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,               -- "task-{timestamp}-{random}" format
  group_folder TEXT NOT NULL,        -- Group folder name (e.g., "main", "family-chat")
  chat_jid TEXT NOT NULL,            -- Target chat JID for sending results
  prompt TEXT NOT NULL,              -- What the agent should do
  schedule_type TEXT NOT NULL,       -- "cron", "interval", or "once"
  schedule_value TEXT NOT NULL,      -- Cron expr, milliseconds, or ISO timestamp
  context_mode TEXT DEFAULT 'isolated', -- "group" (with chat history) or "isolated" (fresh session)
  next_run TEXT,                     -- ISO timestamp of next scheduled execution
  last_run TEXT,                     -- ISO timestamp of last execution
  last_result TEXT,                  -- Summary of last run result (first 200 chars)
  status TEXT DEFAULT 'active',      -- "active", "paused", or "completed"
  created_at TEXT NOT NULL           -- ISO timestamp of creation
);
CREATE INDEX idx_next_run ON scheduled_tasks(next_run);
CREATE INDEX idx_status ON scheduled_tasks(status);
```
Purpose: Persistent task scheduling. Supports cron, interval, and one-shot tasks.

### Table: task_run_logs
```sql
CREATE TABLE task_run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,             -- FK to scheduled_tasks.id
  run_at TEXT NOT NULL,              -- ISO timestamp of execution
  duration_ms INTEGER NOT NULL,      -- Execution duration in milliseconds
  status TEXT NOT NULL,              -- "success" or "error"
  result TEXT,                       -- Result text (truncated)
  error TEXT,                        -- Error message if failed
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
);
CREATE INDEX idx_task_run_logs ON task_run_logs(task_id, run_at);
```
Purpose: Audit trail for task executions. Dashboard can show task history and success/failure rates.

### Table: router_state
```sql
CREATE TABLE router_state (
  key TEXT PRIMARY KEY,              -- State key name
  value TEXT NOT NULL                -- State value (may be JSON)
);
```
Purpose: Persistent cursor state. Keys used:
- `last_timestamp` -- global message cursor for the polling loop
- `last_agent_timestamp` -- JSON object mapping `{chatJid: lastProcessedTimestamp}` per group

### Table: sessions
```sql
CREATE TABLE sessions (
  group_folder TEXT PRIMARY KEY,     -- Group folder name
  session_id TEXT NOT NULL           -- Claude Agent SDK session ID
);
```
Purpose: Maps groups to their current Claude session for conversation continuity.

### Table: registered_groups
```sql
CREATE TABLE registered_groups (
  jid TEXT PRIMARY KEY,              -- Chat JID
  name TEXT NOT NULL,                -- Display name
  folder TEXT NOT NULL UNIQUE,       -- Group folder name (unique)
  trigger_pattern TEXT NOT NULL,     -- Trigger word (e.g., "@Andy")
  added_at TEXT NOT NULL,            -- ISO timestamp
  container_config TEXT,             -- JSON string of ContainerConfig (additionalMounts, timeout)
  requires_trigger INTEGER DEFAULT 1 -- 1=needs @trigger, 0=process all messages
);
```
Purpose: Which groups the bot is active in and their configuration.

### Table Relationships
```
chats.jid <-- messages.chat_jid
chats.jid <-- registered_groups.jid
chats.jid <-- scheduled_tasks.chat_jid
registered_groups.folder <-- sessions.group_folder
registered_groups.folder <-- scheduled_tasks.group_folder
scheduled_tasks.id <-- task_run_logs.task_id
```

## IPC Protocol

### File-Based Messaging (Container -> Host)

All IPC files are JSON, written atomically (write .tmp then rename), and consumed (unlinked) after processing.

#### Outbound Messages: `data/ipc/{group}/messages/{timestamp}-{random}.json`
```json
{
  "type": "message",
  "chatJid": "120363...@g.us",
  "text": "Hello from the agent!",
  "sender": "Researcher",         // optional: role identity for Telegram bots
  "groupFolder": "main",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

#### Task Operations: `data/ipc/{group}/tasks/{timestamp}-{random}.json`

Schedule task:
```json
{
  "type": "schedule_task",
  "prompt": "Check the weather",
  "schedule_type": "cron",
  "schedule_value": "0 9 * * *",
  "context_mode": "isolated",
  "targetJid": "120363...@g.us",
  "createdBy": "main",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Pause/resume/cancel task:
```json
{ "type": "pause_task", "taskId": "task-1234-abc" }
{ "type": "resume_task", "taskId": "task-1234-abc" }
{ "type": "cancel_task", "taskId": "task-1234-abc" }
```

Register group (main only):
```json
{
  "type": "register_group",
  "jid": "120363...@g.us",
  "name": "Family Chat",
  "folder": "family-chat",
  "trigger": "@Andy"
}
```

Refresh groups (main only):
```json
{ "type": "refresh_groups" }
```

### File-Based Messaging (Host -> Container)

#### Follow-up messages: `data/ipc/{group}/input/{timestamp}-{random}.json`
```json
{
  "type": "message",
  "text": "<messages>\n<message sender=\"Alice\" time=\"...\">follow-up question</message>\n</messages>"
}
```

#### Close sentinel: `data/ipc/{group}/input/_close`
Empty file. Signals the agent runner to exit its IPC poll loop and terminate.

### Stdout Protocol (Container -> Host)

```
---NANOCLAW_OUTPUT_START---
{"status":"success","result":"The answer is 42","newSessionId":"session-abc123"}
---NANOCLAW_OUTPUT_END---
```

Multiple output blocks may be emitted per container run (one per agent result). The host parses them as they arrive via streaming stdout.

## Channel Abstraction Layer

```typescript
interface Channel {
  name: string;                                    // "whatsapp", "discord", etc.
  connect(): Promise<void>;                        // Initialize connection
  sendMessage(jid: string, text: string): Promise<void>;  // Send outbound message
  isConnected(): boolean;                          // Connection status
  ownsJid(jid: string): boolean;                   // Does this channel handle this JID?
  disconnect(): Promise<void>;                     // Clean shutdown
  setTyping?(jid: string, isTyping: boolean): Promise<void>;  // Optional typing indicator
}
```

JID ownership patterns:
- WhatsApp: `jid.endsWith('@g.us')` or `jid.endsWith('@s.whatsapp.net')`
- Discord: `jid.startsWith('dc:')`
- Telegram: `jid.startsWith('tg:')`

Channel callbacks passed to constructors:
```typescript
{
  onMessage: (chatJid, msg) => storeMessage(msg),
  onChatMetadata: (chatJid, timestamp, name?, channel?, isGroup?) => storeChatMetadata(...),
  registeredGroups: () => registeredGroups,  // live reference to current state
}
```

Routing uses `findChannel(channels, jid)` which returns the first channel where `ownsJid(jid)` is true.
