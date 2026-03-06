# Module Index

## Dashboard Package (`dashboard/`)

### dashboard/middleware.ts
- **Purpose**: Auth middleware. Checks `nanoclaw_dashboard_session` cookie against `DASHBOARD_ADMIN_TOKEN` env var.
- **Behavior**: Public paths bypass auth (`/login`, `/api/health`, `/_next`). API routes get 401 JSON; pages redirect to `/login?next=...`.

### dashboard/src/app/layout.tsx
- **Purpose**: Root layout. Sets metadata ("NanoClaw Dashboard"), loads Inter font, applies dark mode, wraps children in `AppFrame`.

### dashboard/src/app/page.tsx
- **Purpose**: Landing page. Redirects to `/chat`.

### dashboard/src/app/login/page.tsx
- **Purpose**: Login page. Password input for admin token. Posts to `/api/auth/login`, sets cookie, redirects.

### dashboard/src/app/chat/page.tsx
- **Purpose**: Main chat interface. 3-column layout: chat list | messages | context sidebar.
- **Features**: Cursor-based pagination, search (Ctrl+K), message sending, transcript export, visibility-aware polling (chats 10s, messages 3s, tasks 15s).

### dashboard/src/app/agents/page.tsx
- **Purpose**: Agent (registered group) CRUD. 2-column: agent list | edit form.
- **Features**: Register new group chats, edit name/folder/trigger, delete with confirm. 3s polling.
- **Helper**: `deriveFolder()` converts name to valid folder slug.

### dashboard/src/app/tasks/page.tsx
- **Purpose**: Task scheduler UI. 2-column: create form | task queue with run history.
- **Features**: Create cron/interval/once tasks, filter by status/group, pause/resume/cancel, run history (last 50). 3s polling.

### dashboard/src/app/system/page.tsx
- **Purpose**: System admin. Health dashboard (6 metrics), .env editor with secret redaction, mount allowlist JSON editor, service/audit log tails, restart button. 5s polling.

### dashboard/src/app/settings/page.tsx
- **Purpose**: Legacy redirect to `/system`.

### dashboard/src/app/api/auth/login/route.ts
- **Purpose**: POST login. Validates token, sets HTTP-only cookie (12h, SameSite=lax).

### dashboard/src/app/api/auth/logout/route.ts
- **Purpose**: POST logout. Clears auth cookie.

### dashboard/src/app/api/health/route.ts
- **Purpose**: GET health check. Returns `{ ok: true, now: ISO }`.

### dashboard/src/app/api/v1/chats/route.ts
- **Purpose**: GET `/api/v1/chats`. Lists all chats from SQLite with metadata.

### dashboard/src/app/api/v1/chats/[jid]/messages/route.ts
- **Purpose**: GET messages (cursor pagination), POST send message (writes IPC file). Audit-logged.

### dashboard/src/app/api/v1/chats/[jid]/search/route.ts
- **Purpose**: GET full-text search of messages for a chat. Query param: `q`.

### dashboard/src/app/api/v1/tasks/route.ts
- **Purpose**: GET list tasks (filter by status/group/chat), POST create task (writes IPC file). Zod-validated.

### dashboard/src/app/api/v1/tasks/[id]/route.ts
- **Purpose**: PATCH pause/resume task, DELETE cancel task. Audit-logged.

### dashboard/src/app/api/v1/tasks/[id]/runs/route.ts
- **Purpose**: GET task run history with cursor pagination.

### dashboard/src/app/api/v1/agents/route.ts
- **Purpose**: GET list agents, POST create agent (writes IPC file). Zod-validated.

### dashboard/src/app/api/v1/agents/[jid]/route.ts
- **Purpose**: PATCH update agent, DELETE remove agent. Audit-logged.

### dashboard/src/app/api/v1/system/health/route.ts
- **Purpose**: GET system health (WhatsApp status via auth dir, container count via `docker ps`, group/task/chat counts from SQLite).

### dashboard/src/app/api/v1/system/config/route.ts
- **Purpose**: GET config (secrets redacted unless `?reveal=true`), PUT write .env file.

### dashboard/src/app/api/v1/system/allowlist/route.ts
- **Purpose**: GET allowlist with validation warnings, PUT validate and write allowlist JSON.

### dashboard/src/app/api/v1/system/logs/route.ts
- **Purpose**: GET service log tail + audit log tail.

### dashboard/src/app/api/v1/system/restart/route.ts
- **Purpose**: POST restart NanoClaw service (platform-aware: launchctl/systemctl/pkill).

---

### dashboard/src/lib/contracts.ts
- **Purpose**: TypeScript interfaces for all API request/response shapes.
- **Types**: `ChatSummary`, `ChatMessage`, `PagedResult<T>`, `TaskStatus`, `TaskSummary`, `TaskRun`, `AgentConfig`, `SystemHealth`, `SystemConfigPayload`, `MountAllowlist`, `ApiErrorEnvelope`.

### dashboard/src/lib/api.ts
- **Purpose**: Axios-based API client. Base URL `/api/v1`.
- **Functions**: `loginAdmin`, `logoutAdmin`, `getChats`, `getChatMessages`, `sendChatMessage`, `searchChatMessages`, `getTasks`, `createTask`, `pauseTask`, `resumeTask`, `cancelTask`, `getTaskRuns`, `getAgents`, `createAgent`, `updateAgent`, `deleteAgent`, `getSystemHealth`, `getSystemConfig`, `updateSystemConfig`, `getAllowlist`, `updateAllowlist`, `restartSystem`, `getSystemLogs`.

### dashboard/src/lib/auth-shared.ts
- **Purpose**: Shared auth constants. Cookie name: `nanoclaw_dashboard_session`. Public path list.

### dashboard/src/lib/utils.ts
- **Purpose**: `cn()` utility combining clsx + tailwind-merge.

### dashboard/src/lib/server/nanoclaw.ts
- **Purpose**: Core server-side logic. All SQLite queries, IPC file writing, Docker health checks.
- **Key functions**: `listChats`, `listMessages`, `searchMessages`, `queueOutgoingMessage`, `listTasks`, `listTaskRuns`, `queueTaskCreate/Pause/Resume/Cancel`, `listAgents`, `queueAgentUpsert/Delete`, `queueRefreshGroups`, `getSystemHealth`, `getSystemConfig`, `writeSystemConfig`, `getAllowlistPayload`, `validateAllowlist`, `writeAllowlist`, `appendAuditLog`, `readAuditLog`, `readServiceLogTail`, `runRestartCommand`.
- **Custom error**: `ApiFailure` class with status, code, details.

### dashboard/src/lib/server/paths.ts
- **Purpose**: Resolves NanoClaw filesystem paths. `NANOCLAW_ROOT` env var or `../nanoclaw`.
- **Exports**: `resolveNanoClawPaths()` returns `NanoClawPaths` with root, storeDir, dataDir, groupsDir, logsDir, db, ipc paths, envFile, allowlistPath.

### dashboard/src/lib/server/auth.ts
- **Purpose**: Server auth helpers. `getAdminToken()`, `validateAdminToken()`, `setAuthCookie()`, `clearAuthCookie()`.

### dashboard/src/lib/server/http.ts
- **Purpose**: Response helpers. `jsonOk(data, status?)`, `jsonError(message, status, code?)`.

### dashboard/src/lib/server/route-error.ts
- **Purpose**: `handleRouteError(err)` converts ApiFailure to JSON response.

---

### dashboard/src/components/layout/AppFrame.tsx
- **Purpose**: Main layout wrapper. Sidebar + Header + content. Keyboard shortcuts: Ctrl+T (dark mode), Ctrl+K (search). Hides layout on login page.

### dashboard/src/components/layout/Header.tsx
- **Purpose**: Top bar. Health polling (10s), WhatsApp status icon, page title, logout button.

### dashboard/src/components/layout/Sidebar.tsx
- **Purpose**: Navigation sidebar. Links: Chat, Tasks, Agents, System. Active route highlighting.

### dashboard/src/components/chat/MessageContent.tsx
- **Purpose**: Message renderer with code block detection (backtick/triple-backtick), language labels, whitespace preservation.

### dashboard/src/components/ui/*
- **Purpose**: shadcn/ui component library (Radix-based).
- **Components**: Button (6 variants, 8 sizes), Card, Dialog, DropdownMenu, Form (react-hook-form integration), Input, Label, Popover, Select, Skeleton, Switch, Tabs, Textarea.

---

## NanoClaw Package (`nanoclaw/`)

### nanoclaw/src/index.ts
- **Purpose**: Main orchestrator. Initializes system, manages global state, runs message polling loop.
- **Key functions**: `main()`, `startMessageLoop()`, `processGroupMessages()`, `runAgent()`, `loadState()`, `saveState()`, `registerGroup()`, `recoverPendingMessages()`.
- **In-memory state**: `lastTimestamp`, `sessions`, `registeredGroups`, `lastAgentTimestamp`, `queue`.

### nanoclaw/src/config.ts
- **Purpose**: Central configuration. All constants, paths, intervals, env var reads.
- **Key exports**: `ASSISTANT_NAME`, `POLL_INTERVAL` (2000), `SCHEDULER_POLL_INTERVAL` (60000), `IPC_POLL_INTERVAL` (1000), `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT` (1800000), `IDLE_TIMEOUT` (1800000), `MAX_CONCURRENT_CONTAINERS` (5), `TRIGGER_PATTERN`, `STORE_DIR`, `GROUPS_DIR`, `DATA_DIR`, `MAIN_GROUP_FOLDER` ("main").

### nanoclaw/src/db.ts
- **Purpose**: SQLite database layer. Schema creation, CRUD, migrations.
- **Tables**: chats, messages, scheduled_tasks, task_run_logs, router_state, sessions, registered_groups.
- **Key exports**: `initDatabase()`, `storeMessage()`, `getNewMessages()`, `getMessagesSince()`, `createTask()`, `getDueTasks()`, `getAllRegisteredGroups()`, etc.

### nanoclaw/src/types.ts
- **Purpose**: Shared TypeScript interfaces.
- **Types**: `RegisteredGroup`, `NewMessage`, `ScheduledTask`, `TaskRunLog`, `Channel`, `ContainerConfig`, `AdditionalMount`, `MountAllowlist`.

### nanoclaw/src/router.ts
- **Purpose**: Message formatting and routing.
- **Exports**: `escapeXml()`, `formatMessages()`, `stripInternalTags()`, `formatOutbound()`, `routeOutbound()`, `findChannel()`.

### nanoclaw/src/container-runner.ts
- **Purpose**: Spawns Docker containers. Builds volume mounts, passes stdin, parses stdout.
- **Exports**: `runContainerAgent()`, `writeTasksSnapshot()`, `writeGroupsSnapshot()`, `ContainerInput`, `ContainerOutput`.

### nanoclaw/src/container-runtime.ts
- **Purpose**: Docker abstraction. `ensureContainerRuntimeRunning()`, `cleanupOrphans()`, `stopContainer()`, `readonlyMountArgs()`.

### nanoclaw/src/group-queue.ts
- **Purpose**: Concurrency control. `GroupQueue` class manages active containers, waiting queue, per-group state, retry with exponential backoff (max 5 retries, base 5s).

### nanoclaw/src/ipc.ts
- **Purpose**: IPC watcher. Polls `data/ipc/` directories every 1s. Processes message and task IPC files.
- **Authorization**: Non-main groups can only send to their own JID. Only main can register groups.

### nanoclaw/src/task-scheduler.ts
- **Purpose**: Task scheduler. Polls every 60s, runs due tasks via containers.
- **Supports**: cron, interval, once. Context modes: "group" (with history) or "isolated" (fresh).

### nanoclaw/src/channels/whatsapp.ts
- **Purpose**: WhatsApp channel via Baileys. Connection, auth, message send/receive, group metadata sync (24h), typing indicators.

### nanoclaw/src/env.ts
- **Purpose**: `.env` parser. `readEnvFile(keys)` reads specific keys without polluting process.env.

### nanoclaw/src/group-folder.ts
- **Purpose**: Path validation. `GROUP_FOLDER_PATTERN`: `/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/`. Reserved: "global".

### nanoclaw/src/mount-security.ts
- **Purpose**: Mount allowlist validation. Checks against `~/.config/nanoclaw/mount-allowlist.json`. 16 default blocked patterns (.ssh, .aws, .env, etc.).

### nanoclaw/src/logger.ts
- **Purpose**: Pino logger with pretty printing. `LOG_LEVEL` env var (default "info").

### nanoclaw/src/whatsapp-auth.ts
- **Purpose**: Standalone auth script. QR code display, pairing code support. Run via `npm run auth`.

---

## Agent Runner (`nanoclaw/container/agent-runner/`)

### agent-runner/src/index.ts
- **Purpose**: Runs inside container. Reads `ContainerInput` from stdin, calls Claude Agent SDK `query()`, writes `ContainerOutput` to stdout via markers. Enters IPC poll loop for multi-turn. Archives conversations on pre-compact hook.

### agent-runner/src/ipc-mcp-stdio.ts
- **Purpose**: MCP server providing tools to agents.
- **Tools**: `send_message`, `schedule_task`, `list_tasks`, `pause_task`, `resume_task`, `cancel_task`, `register_group` (main-only).
- **Writes IPC files** to `/workspace/ipc/messages/` and `/workspace/ipc/tasks/`.
