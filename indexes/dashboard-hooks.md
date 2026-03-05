# NanoClaw Dashboard Integration Points

## SQLite Queries the Dashboard Should Run

Database path: `{PROJECT_ROOT}/store/messages.db`

### List all registered groups with their config
```sql
SELECT jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger
FROM registered_groups
ORDER BY name;
```

### List all known chats (for group discovery/registration UI)
```sql
SELECT jid, name, last_message_time, channel, is_group
FROM chats
WHERE jid != '__group_sync__'
ORDER BY last_message_time DESC;
```

### Get unregistered groups (available for activation)
```sql
SELECT c.jid, c.name, c.last_message_time, c.channel
FROM chats c
LEFT JOIN registered_groups rg ON c.jid = rg.jid
WHERE rg.jid IS NULL
  AND c.is_group = 1
  AND c.jid != '__group_sync__'
ORDER BY c.last_message_time DESC;
```

### Get recent messages for a group
```sql
SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message
FROM messages
WHERE chat_jid = ?
ORDER BY timestamp DESC
LIMIT 50;
```

### Get all scheduled tasks
```sql
SELECT id, group_folder, chat_jid, prompt, schedule_type, schedule_value,
       context_mode, next_run, last_run, last_result, status, created_at
FROM scheduled_tasks
ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
         next_run ASC;
```

### Get task run history
```sql
SELECT trl.*, st.prompt, st.group_folder
FROM task_run_logs trl
JOIN scheduled_tasks st ON trl.task_id = st.id
ORDER BY trl.run_at DESC
LIMIT 100;
```

### Get task run history for a specific task
```sql
SELECT run_at, duration_ms, status, result, error
FROM task_run_logs
WHERE task_id = ?
ORDER BY run_at DESC;
```

### Get session IDs for all groups
```sql
SELECT group_folder, session_id FROM sessions;
```

### Get router state (message cursors)
```sql
SELECT key, value FROM router_state;
```

### Get message activity by group (last 24h)
```sql
SELECT chat_jid, COUNT(*) as message_count,
       MIN(timestamp) as first_message,
       MAX(timestamp) as last_message
FROM messages
WHERE timestamp > datetime('now', '-1 day')
GROUP BY chat_jid
ORDER BY message_count DESC;
```

### Check if any messages are pending processing
```sql
-- For each registered group, check if messages exist after the last agent timestamp
-- The last_agent_timestamp is stored as JSON in router_state
SELECT rs.value FROM router_state WHERE rs.key = 'last_agent_timestamp';

-- Then for each group, check pending messages:
SELECT COUNT(*) as pending_count
FROM messages
WHERE chat_jid = ?
  AND timestamp > ?
  AND is_bot_message = 0
  AND content != ''
  AND content IS NOT NULL;
```

### Get task success rate
```sql
SELECT task_id,
       COUNT(*) as total_runs,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
       SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
       AVG(duration_ms) as avg_duration_ms
FROM task_run_logs
GROUP BY task_id;
```

---

## File Paths to Watch for Changes

### Critical files (watch with fs.watch or polling)

| Path | What Changes | Why Watch |
|------|-------------|-----------|
| `store/messages.db` | Message inserts, task updates, group registrations | Primary data source -- poll SQLite instead of watching the file |
| `data/ipc/*/messages/*.json` | Agent sends outbound messages | Real-time message activity indicator |
| `data/ipc/*/tasks/*.json` | Agent requests task operations | Task management activity |
| `data/ipc/*/input/*.json` | Host writes follow-up messages to containers | Message piping activity |
| `data/ipc/*/input/_close` | Host signals container shutdown | Container lifecycle |
| `data/ipc/*/current_tasks.json` | Host writes task snapshot | Updated before each container spawn |
| `data/ipc/*/available_groups.json` | Host writes groups snapshot | Updated before main container spawn |
| `groups/*/logs/container-*.log` | Container execution logs | Log viewing, error detection |
| `groups/*/CLAUDE.md` | Agent memory/instructions | Memory editing UI |
| `groups/global/CLAUDE.md` | Global instructions | Global config editing |
| `store/auth/` | WhatsApp auth state changes | Auth status monitoring |
| `.env` | Configuration changes | Config editing UI |
| `~/.config/nanoclaw/mount-allowlist.json` | Mount security config | Security config editing |

### Directory structure to discover groups
```
groups/         -- ls to find all group folders
data/ipc/       -- ls to find all IPC namespaces (may include groups not yet registered)
data/sessions/  -- ls to find all session data directories
```

---

## How to Observe Container Lifecycle

### List running containers
```bash
docker ps --filter name=nanoclaw- --format '{{.Names}}\t{{.Status}}\t{{.RunningFor}}'
```

### Container naming convention
Format: `nanoclaw-{group-folder}-{timestamp}`
- `nanoclaw-main-1706745600000` -- main group container
- `nanoclaw-family-chat-1706745600000` -- custom group container

### Count active containers
```bash
docker ps --filter name=nanoclaw- --format '{{.Names}}' | wc -l
```

### Monitor container starts/stops (real-time)
```bash
docker events --filter type=container --filter event=start --filter event=die --filter name=nanoclaw-
```

### Get container resource usage
```bash
docker stats --no-stream --filter name=nanoclaw- --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'
```

---

## How to Read/Write Config Without Restarting

### Values that take effect immediately (no restart)
- None. All config.ts values are read once at module import time.

### Values that take effect on next container spawn (no restart)
- `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` -- read from .env each time via `readSecrets()`
- `groups/*/CLAUDE.md` -- read by Claude SDK inside new containers
- `groups/global/CLAUDE.md` -- loaded by agent-runner at query start

### Values that require process restart
- All environment variables (ASSISTANT_NAME, CONTAINER_TIMEOUT, IDLE_TIMEOUT, MAX_CONCURRENT_CONTAINERS, etc.)
- All config.ts constants

### How to restart
```bash
# macOS
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Linux
systemctl --user restart nanoclaw

# Development
# Kill process and re-run npm run dev
```

### Modifying registered groups without restart
Dashboard can directly write to SQLite, but the in-memory `registeredGroups` map won't update until:
1. The process restarts (calls `loadState()`)
2. OR a container sends a `register_group` IPC message (which calls `registerGroup()` updating the in-memory map)

Best approach for dashboard: write IPC files that trigger the same code paths:
```bash
# Register a group via IPC (write to main group's tasks directory)
echo '{"type":"register_group","jid":"120363...@g.us","name":"New Group","folder":"new-group","trigger":"@Andy"}' > data/ipc/main/tasks/$(date +%s)-dashboard.json
```

### Modifying tasks without restart
Dashboard can write directly to SQLite for task CRUD, since the scheduler reads from SQLite each poll cycle (60s):
```sql
-- Create a task
INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
VALUES ('task-dashboard-123', 'main', '120363...@g.us', 'Check weather', 'cron', '0 9 * * *', 'isolated', '2026-01-01T09:00:00Z', 'active', datetime('now'));

-- Pause a task
UPDATE scheduled_tasks SET status = 'paused' WHERE id = 'task-dashboard-123';

-- Resume a task
UPDATE scheduled_tasks SET status = 'active' WHERE id = 'task-dashboard-123';

-- Delete a task
DELETE FROM task_run_logs WHERE task_id = 'task-dashboard-123';
DELETE FROM scheduled_tasks WHERE id = 'task-dashboard-123';
```

---

## How to Trigger Actions via IPC File Writes

All IPC files must be written atomically: write to `.tmp` then rename to `.json`.

### Send a message as the bot
```javascript
const data = { type: "message", chatJid: "120363...@g.us", text: "Hello from dashboard!", groupFolder: "main", timestamp: new Date().toISOString() };
const filename = `${Date.now()}-dashboard.json`;
fs.writeFileSync(`data/ipc/main/messages/${filename}.tmp`, JSON.stringify(data));
fs.renameSync(`data/ipc/main/messages/${filename}.tmp`, `data/ipc/main/messages/${filename}`);
```

### Schedule a task
```javascript
const data = { type: "schedule_task", prompt: "Check news", schedule_type: "cron", schedule_value: "0 9 * * *", context_mode: "isolated", targetJid: "120363...@g.us", timestamp: new Date().toISOString() };
const filename = `${Date.now()}-dashboard.json`;
fs.writeFileSync(`data/ipc/main/tasks/${filename}.tmp`, JSON.stringify(data));
fs.renameSync(`data/ipc/main/tasks/${filename}.tmp`, `data/ipc/main/tasks/${filename}`);
```

### Force close a container (for a specific group)
```javascript
fs.mkdirSync('data/ipc/{group}/input', { recursive: true });
fs.writeFileSync('data/ipc/{group}/input/_close', '');
```

### Force refresh WhatsApp group metadata
```javascript
const data = { type: "refresh_groups" };
const filename = `${Date.now()}-dashboard.json`;
fs.writeFileSync(`data/ipc/main/tasks/${filename}.tmp`, JSON.stringify(data));
fs.renameSync(`data/ipc/main/tasks/${filename}.tmp`, `data/ipc/main/tasks/${filename}`);
```

### Register a new group
```javascript
const data = { type: "register_group", jid: "120363...@g.us", name: "Family Chat", folder: "family-chat", trigger: "@Andy", requiresTrigger: true };
const filename = `${Date.now()}-dashboard.json`;
fs.writeFileSync(`data/ipc/main/tasks/${filename}.tmp`, JSON.stringify(data));
fs.renameSync(`data/ipc/main/tasks/${filename}.tmp`, `data/ipc/main/tasks/${filename}`);
```

---

## Real-Time Data Sources

### SQLite Polling (recommended approach)
Poll the database at regular intervals (e.g., 2-5 seconds):
- `messages` table: new messages for activity feed
- `scheduled_tasks` table: task status changes
- `task_run_logs` table: new task executions
- `registered_groups` table: group config changes
- `chats` table: new chat discovery

### Log Tailing
- Service logs: `logs/nanoclaw.log` (pino JSON format with timestamps)
- Service errors: `logs/nanoclaw.error.log`
- Container logs: `groups/{name}/logs/container-*.log` (plain text with sections)

pino log format example:
```json
{"level":30,"time":1706745600000,"msg":"Processing messages","group":"Family Chat","messageCount":3}
```

### Docker Events (real-time container monitoring)
```bash
docker events --filter type=container --filter name=nanoclaw- --format '{{json .}}'
```

### Filesystem Watching
- Watch `data/ipc/` for IPC activity
- Watch `groups/` for new group folders
- Watch `store/messages.db` for database size growth

---

## Dashboard Config File Specification

A config-driven dashboard config file should contain:

```json
{
  "nanoclaw": {
    "projectRoot": "/path/to/nanoclaw",
    "dbPath": "/path/to/nanoclaw/store/messages.db",
    "ipcBasePath": "/path/to/nanoclaw/data/ipc",
    "groupsPath": "/path/to/nanoclaw/groups",
    "logsPath": "/path/to/nanoclaw/logs",
    "envFilePath": "/path/to/nanoclaw/.env",
    "mountAllowlistPath": "~/.config/nanoclaw/mount-allowlist.json"
  },
  "polling": {
    "sqliteIntervalMs": 3000,
    "containerStatusIntervalMs": 5000,
    "ipcActivityIntervalMs": 2000,
    "logTailLines": 100
  },
  "display": {
    "maxMessagesPerGroup": 50,
    "maxTaskRunLogs": 100,
    "refreshOnFocus": true
  },
  "capabilities": {
    "canEditConfig": true,
    "canManageGroups": true,
    "canManageTasks": true,
    "canSendMessages": true,
    "canForceCloseContainers": true,
    "canRestartService": true
  }
}
```

### Required paths to resolve from projectRoot
```
store/messages.db       -- SQLite database
data/ipc/               -- IPC directory tree
groups/                 -- Group folders
logs/                   -- Service logs (when running as service)
.env                    -- Environment config
container/              -- Container build context
```

### Dashboard should validate on startup
1. SQLite database exists and is readable: `store/messages.db`
2. Docker daemon is running: `docker info`
3. Container image exists: `docker image inspect nanoclaw-agent:latest`
4. IPC directories are writable: `data/ipc/main/`
5. Auth state exists: `store/auth/creds.json`
