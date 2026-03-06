# System Architecture

## High-Level Overview

```
                    Browser
                      |
                      v
             ┌─────────────────┐
             │   Dashboard      │  Next.js 16 (port 3000)
             │   (Next.js)      │  Pages: /chat, /agents, /tasks, /system
             │                  │  API: /api/v1/chats, agents, tasks, system
             └───────┬──────────┘
                     |
          ┌──────────┼──────────┐
          v          v          v
     SQLite (ro)  IPC files  Docker API
          |          |          |
          v          v          v
             ┌─────────────────┐
             │   NanoClaw       │  Node.js host process
             │   Host Process   │  Channels, DB, containers, scheduler
             └───────┬──────────┘
                     |
            Docker containers
                     |
             ┌─────────────────┐
             │   Agent Runner   │  Claude Agent SDK + MCP tools
             │   (per-group)    │  Inside Docker container
             └─────────────────┘
```

## Dashboard <-> NanoClaw Communication

The dashboard does NOT call NanoClaw APIs. Instead it:
1. **Reads** SQLite directly via better-sqlite3 (server-side API routes)
2. **Writes** IPC JSON files to `nanoclaw/data/ipc/main/tasks/` and `nanoclaw/data/ipc/main/messages/`
3. **Queries** Docker via `docker ps` for container status

Path resolution: `NANOCLAW_ROOT` env var or defaults to `../nanoclaw` relative to dashboard.

## NanoClaw Host Process Components

```
main() [nanoclaw/src/index.ts]
  |
  |-- ensureContainerRuntimeRunning() [container-runtime.ts]
  |-- cleanupOrphans() [container-runtime.ts]
  |-- initDatabase() [db.ts]
  |-- loadState() -- reads router_state, sessions, registeredGroups from SQLite
  |
  |-- WhatsAppChannel [channels/whatsapp.ts]
  |     |-- connect() -> Baileys socket
  |     |-- messages.upsert -> onMessage() -> storeMessage()
  |     |-- sendMessage() -> sock.sendMessage()
  |
  |-- startSchedulerLoop() [task-scheduler.ts]
  |     |-- polls every 60s via getDueTasks()
  |     |-- queue.enqueueTask() -> runTask() -> runContainerAgent()
  |
  |-- startIpcWatcher() [ipc.ts]
  |     |-- polls data/ipc/{group}/messages/ every 1s
  |     |-- polls data/ipc/{group}/tasks/ every 1s
  |     |-- processTaskIpc() handles: schedule_task, pause_task, etc.
  |
  |-- GroupQueue [group-queue.ts]
  |     |-- manages concurrency (MAX_CONCURRENT_CONTAINERS)
  |     |-- enqueueMessageCheck() / enqueueTask()
  |     |-- sendMessage() writes IPC input files for active containers
  |
  |-- startMessageLoop() [index.ts]
        |-- polls every 2s via getNewMessages()
        |-- groups messages by chatJid, checks trigger pattern
        |-- queue.enqueueMessageCheck() if no active container
```

## Container Boundary

```
HOST SIDE                           CONTAINER SIDE
==========                          ==============

groups/{name}/          -- bind -->  /workspace/group (rw)
groups/global/          -- bind -->  /workspace/global (ro, non-main)
{project-root}/         -- bind -->  /workspace/project (ro, main only)
data/sessions/{name}/.claude/  -->  /home/node/.claude (rw)
data/ipc/{name}/        -- bind -->  /workspace/ipc (rw)
extra mounts            -- bind -->  /workspace/extra/{name} (validated)

ContainerInput JSON     -- stdin --> agent-runner reads from stdin
ContainerOutput JSON    <-- stdout-- OUTPUT_START/END markers
IPC files               <-- bind --> /workspace/ipc/messages/*.json
                                     /workspace/ipc/tasks/*.json
IPC input files         --> bind --> /workspace/ipc/input/*.json
Close sentinel          --> bind --> /workspace/ipc/input/_close
```

Container image: `nanoclaw-agent:latest` (node:22-slim + Chromium + claude-code)

## Data Flow: Message In -> Agent -> Message Out

```
1. WhatsApp message arrives -> Baileys messages.upsert event
2. WhatsAppChannel.onMessage() -> storeMessage() writes to SQLite
3. startMessageLoop() polls getNewMessages() every 2s
4. Check trigger: main=always, requiresTrigger=false=always, others=must match @name
5. Active container? YES -> queue.sendMessage() writes IPC input file
                    NO  -> queue.enqueueMessageCheck() -> processGroupMessages()
6. processGroupMessages() -> formatMessages() (XML) -> runContainerAgent()
7. Container spawns -> agent-runner reads stdin -> Claude Agent SDK query()
8. Agent produces result -> OUTPUT_MARKER stdout -> host parses
9. host calls channel.sendMessage() (strips <internal> tags)
10. After query, agent-runner enters IPC poll loop for follow-up messages
11. _close sentinel or idle timeout ends the loop
```

## IPC Protocol

### Container -> Host

**Outbound messages**: `data/ipc/{group}/messages/{ts}-{rand}.json`
```json
{ "type": "message", "chatJid": "...", "text": "...", "groupFolder": "...", "timestamp": "..." }
```

**Task operations**: `data/ipc/{group}/tasks/{ts}-{rand}.json`
```json
{ "type": "schedule_task", "prompt": "...", "schedule_type": "cron", "schedule_value": "0 9 * * *", ... }
{ "type": "pause_task", "taskId": "..." }
{ "type": "resume_task", "taskId": "..." }
{ "type": "cancel_task", "taskId": "..." }
{ "type": "register_group", "jid": "...", "name": "...", "folder": "...", "trigger": "..." }
{ "type": "refresh_groups" }
```

### Host -> Container

**Follow-up messages**: `data/ipc/{group}/input/{ts}-{rand}.json`
```json
{ "type": "message", "text": "<messages>...</messages>" }
```

**Close sentinel**: `data/ipc/{group}/input/_close` (empty file)

### Stdout Protocol
```
---NANOCLAW_OUTPUT_START---
{"status":"success","result":"...","newSessionId":"..."}
---NANOCLAW_OUTPUT_END---
```

## Channel Abstraction

```typescript
interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
}
```

JID patterns: WhatsApp `@g.us`/`@s.whatsapp.net`, Discord `dc:`, Telegram `tg:`
