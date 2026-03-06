# Dashboard REST API Surface

Base URL: `/api/v1`

## Authentication

All `/api/v1/*` routes require the `nanoclaw_dashboard_session` cookie (set by login).
Public paths: `/login`, `/api/auth/login`, `/api/health`, `/_next/*`, `/favicon.ico`.

### POST /api/auth/login
- **Body**: `{ token: string }`
- **Response**: 200 `{ ok: true }` + Set-Cookie (12h, HttpOnly, SameSite=lax)
- **Errors**: 401 (wrong token), 500 (token not configured)

### POST /api/auth/logout
- **Response**: 200 `{ ok: true }` + Clear-Cookie

### GET /api/health
- **Response**: `{ ok: true, now: "ISO" }`

---

## Chats

### GET /api/v1/chats
- **Response**: `ChatSummary[]`

### GET /api/v1/chats/:jid/messages
- **Query**: `cursor?`, `limit?` (default 50)
- **Response**: `PagedResult<ChatMessage>`
- **Note**: JID is URI-encoded in path

### POST /api/v1/chats/:jid/messages
- **Body**: `{ text: string }` (1-10000 chars)
- **Response**: 201 `{ ok: true }`
- **Action**: Writes IPC message file to `data/ipc/main/messages/`
- **Audit**: Logged

### GET /api/v1/chats/:jid/search
- **Query**: `q` (required), `cursor?`, `limit?`
- **Response**: `PagedResult<ChatMessage>`

---

## Tasks

### GET /api/v1/tasks
- **Query**: `status?` (active|paused|completed), `groupFolder?`, `chatJid?`
- **Response**: `TaskSummary[]`

### POST /api/v1/tasks
- **Body** (zod-validated):
  ```json
  { "chatJid": "...", "prompt": "1-8000 chars",
    "scheduleType": "cron|interval|once", "scheduleValue": "...",
    "contextMode?": "isolated|group" }
  ```
- **Response**: 201 `{ ok: true, taskId: "..." }`
- **Action**: Writes IPC task file to `data/ipc/main/tasks/`
- **Audit**: Logged

### PATCH /api/v1/tasks/:id
- **Body**: `{ action: "pause"|"resume" }` or `{ status: "paused"|"active" }`
- **Response**: 200 `{ ok: true }`
- **Audit**: Logged

### DELETE /api/v1/tasks/:id
- **Response**: 200 `{ ok: true }`
- **Audit**: Logged

### GET /api/v1/tasks/:id/runs
- **Query**: `cursor?`, `limit?`
- **Response**: `PagedResult<TaskRun>`

---

## Agents

### GET /api/v1/agents
- **Response**: `AgentConfig[]`

### POST /api/v1/agents
- **Body** (zod-validated):
  ```json
  { "jid": "...", "name": "...", "folder": "1-64 alphanumeric/hyphen/underscore",
    "trigger": "...", "requiresTrigger": boolean,
    "containerConfig?": { "additionalMounts?": [...], "timeout?": number } }
  ```
- **Response**: 201 `{ ok: true }`
- **Action**: Writes IPC register_group + refresh_groups to `data/ipc/main/tasks/`
- **Audit**: Logged

### PATCH /api/v1/agents/:jid
- **Body**: Any subset of agent fields (partial update, preserves existing)
- **Response**: 200 `{ ok: true }`
- **Errors**: 404 if agent not found
- **Audit**: Logged

### DELETE /api/v1/agents/:jid
- **Response**: 200 `{ ok: true }`
- **Audit**: Logged

---

## System

### GET /api/v1/system/health
- **Response**: `SystemHealth`
  ```json
  { "whatsappConnected": true, "activeContainers": 2,
    "registeredGroups": 3, "activeTasks": 5,
    "totalChats": 42, "recentActivity": "ISO or null" }
  ```
- WhatsApp status: checks `store/auth/creds.json` existence
- Container count: `docker ps --filter name=nanoclaw- --format '{{.Names}}'`

### GET /api/v1/system/config
- **Query**: `reveal=true` to show secrets
- **Response**: `{ raw: string, keys: string[] }`
- Secrets (ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, etc.) redacted as `***` unless revealed

### PUT /api/v1/system/config
- **Body**: `{ raw: string }`
- **Response**: 200 `{ ok: true }`
- **Action**: Writes `.env` file in NanoClaw root
- **Audit**: Logged

### GET /api/v1/system/allowlist
- **Response**: `MountAllowlist` with `warnings[]`

### PUT /api/v1/system/allowlist
- **Body** (zod-validated): `MountAllowlist` structure
- **Response**: 200 with validation result and warnings
- **Action**: Writes `~/.config/nanoclaw/mount-allowlist.json`
- **Audit**: Logged

### GET /api/v1/system/logs
- **Query**: `limit?` (default 80, max 500)
- **Response**: `{ service: string[], audit: string[] }`
- Service: tails `logs/nanoclaw.log`
- Audit: tails `logs/dashboard-audit.log`

### POST /api/v1/system/restart
- **Response**: 200 `{ ok: true, command: "..." }`
- **Action**: Platform-aware restart (launchctl on macOS, systemctl on Linux, pkill fallback)
- **Audit**: Logged

---

## Error Format

All error responses follow:
```json
{ "error": { "message": "...", "code": "BAD_REQUEST|NOT_FOUND|..." } }
```

## Audit Logging

All mutating operations append to `{nanoclaw}/logs/dashboard-audit.log`:
```
[ISO_TIMESTAMP] ACTION_TYPE: details
```
