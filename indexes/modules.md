# NanoClaw Module Index

## src/index.ts
- **Purpose**: Main orchestrator. Initializes the system, manages global state (lastTimestamp, sessions, registeredGroups, lastAgentTimestamp), runs the message polling loop, and coordinates all subsystems.
- **Key exports**: `getAvailableGroups()`, `escapeXml()` (re-export), `formatMessages()` (re-export), `_setRegisteredGroups()` (test helper)
- **Key internal functions**: `main()`, `startMessageLoop()`, `processGroupMessages()`, `runAgent()`, `loadState()`, `saveState()`, `registerGroup()`, `recoverPendingMessages()`
- **Dependencies**: config.ts, channels/whatsapp.ts, container-runner.ts, container-runtime.ts, db.ts, group-queue.ts, group-folder.ts, ipc.ts, router.ts, task-scheduler.ts, types.ts, logger.ts
- **Dependents**: None (entry point)
- **Config surface**: `ASSISTANT_NAME`, `IDLE_TIMEOUT`, `MAIN_GROUP_FOLDER`, `POLL_INTERVAL`, `TRIGGER_PATTERN` from config.ts
- **Dashboard relevance**: The in-memory state (sessions map, registeredGroups map, lastTimestamp, lastAgentTimestamp, queue state) is not directly observable. Dashboard must query SQLite and filesystem instead. The message loop's polling frequency (POLL_INTERVAL=2000ms) affects response latency.

## src/config.ts
- **Purpose**: Central configuration. Reads .env for non-secret values, defines all constants, paths, intervals, and patterns.
- **Key exports**: `ASSISTANT_NAME`, `ASSISTANT_HAS_OWN_NUMBER`, `POLL_INTERVAL` (2000), `SCHEDULER_POLL_INTERVAL` (60000), `MOUNT_ALLOWLIST_PATH`, `STORE_DIR`, `GROUPS_DIR`, `DATA_DIR`, `MAIN_GROUP_FOLDER` ("main"), `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT` (1800000), `CONTAINER_MAX_OUTPUT_SIZE` (10485760), `IPC_POLL_INTERVAL` (1000), `IDLE_TIMEOUT` (1800000), `MAX_CONCURRENT_CONTAINERS` (5), `TRIGGER_PATTERN`, `TIMEZONE`
- **Dependencies**: env.ts
- **Dependents**: Almost every other module
- **Config surface**: Reads `ASSISTANT_NAME`, `ASSISTANT_HAS_OWN_NUMBER` from .env via readEnvFile(). Reads `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE`, `IDLE_TIMEOUT`, `MAX_CONCURRENT_CONTAINERS`, `TZ` from process.env directly.
- **Dashboard relevance**: All timing constants and limits. Changing these affects system behavior. A dashboard config panel would read/write .env and environment variables.

## src/db.ts
- **Purpose**: SQLite database layer. Creates schema, provides CRUD operations for all tables, handles migrations from JSON files.
- **Key exports**: `initDatabase()`, `_initTestDatabase()`, `storeChatMetadata()`, `updateChatName()`, `getAllChats()`, `getLastGroupSync()`, `setLastGroupSync()`, `storeMessage()`, `storeMessageDirect()`, `getNewMessages()`, `getMessagesSince()`, `createTask()`, `getTaskById()`, `getTasksForGroup()`, `getAllTasks()`, `updateTask()`, `deleteTask()`, `getDueTasks()`, `updateTaskAfterRun()`, `logTaskRun()`, `getRouterState()`, `setRouterState()`, `getSession()`, `setSession()`, `getAllSessions()`, `getRegisteredGroup()`, `setRegisteredGroup()`, `getAllRegisteredGroups()`, `ChatInfo` (interface)
- **Dependencies**: config.ts (`ASSISTANT_NAME`, `DATA_DIR`, `STORE_DIR`), group-folder.ts, logger.ts, types.ts
- **Dependents**: index.ts, ipc.ts, task-scheduler.ts, channels/whatsapp.ts
- **Config surface**: `STORE_DIR` determines database file location (store/messages.db). `ASSISTANT_NAME` used for bot message backfill migration.
- **Dashboard relevance**: Primary data source. Dashboard should query this database for all persistent state: chats, messages, groups, tasks, task logs, sessions, router state.

## src/env.ts
- **Purpose**: Parses .env file for specific keys without polluting process.env. Keeps secrets out of the process environment.
- **Key exports**: `readEnvFile(keys: string[])`
- **Dependencies**: logger.ts
- **Dependents**: config.ts, container-runner.ts
- **Config surface**: Reads from `.env` file in process.cwd()
- **Dashboard relevance**: Understanding how config is loaded. Dashboard could read/write .env directly.

## src/types.ts
- **Purpose**: All shared TypeScript interfaces for the system.
- **Key exports**: `AdditionalMount`, `MountAllowlist`, `AllowedRoot`, `ContainerConfig`, `RegisteredGroup`, `NewMessage`, `ScheduledTask`, `TaskRunLog`, `Channel`, `OnInboundMessage`, `OnChatMetadata`
- **Dependencies**: None
- **Dependents**: All modules
- **Config surface**: Defines shape of all config objects (ContainerConfig, MountAllowlist, RegisteredGroup)
- **Dashboard relevance**: Defines all data structures the dashboard needs to understand and work with.

## src/router.ts
- **Purpose**: Message formatting and channel routing utilities.
- **Key exports**: `escapeXml()`, `formatMessages()`, `stripInternalTags()`, `formatOutbound()`, `routeOutbound()`, `findChannel()`
- **Dependencies**: types.ts
- **Dependents**: index.ts
- **Config surface**: None
- **Dashboard relevance**: `formatMessages()` shows how prompts are constructed (XML format). `stripInternalTags()` shows how `<internal>` tags are filtered from output.

## src/container-runner.ts
- **Purpose**: Spawns Docker containers for agent execution. Builds volume mounts, passes input via stdin, parses streamed output.
- **Key exports**: `ContainerInput` (interface), `ContainerOutput` (interface), `AvailableGroup` (interface), `runContainerAgent()`, `writeTasksSnapshot()`, `writeGroupsSnapshot()`
- **Key internal functions**: `buildVolumeMounts()`, `buildContainerArgs()`, `readSecrets()`
- **Dependencies**: config.ts, env.ts, group-folder.ts, logger.ts, container-runtime.ts, mount-security.ts, types.ts
- **Dependents**: index.ts, task-scheduler.ts
- **Config surface**: `CONTAINER_IMAGE`, `CONTAINER_MAX_OUTPUT_SIZE`, `CONTAINER_TIMEOUT`, `DATA_DIR`, `GROUPS_DIR`, `IDLE_TIMEOUT`, `TIMEZONE`. Reads secrets via `readEnvFile(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'])`.
- **Dashboard relevance**: Container lifecycle. Dashboard can observe spawned containers via `docker ps --filter name=nanoclaw-`. Log files written to `groups/{name}/logs/container-{timestamp}.log`. The `writeTasksSnapshot()` and `writeGroupsSnapshot()` functions show what data is exposed to containers.

## src/container-runtime.ts
- **Purpose**: Container runtime abstraction. All Docker-specific logic in one file for potential runtime swaps.
- **Key exports**: `CONTAINER_RUNTIME_BIN` ("docker"), `readonlyMountArgs()`, `stopContainer()`, `ensureContainerRuntimeRunning()`, `cleanupOrphans()`
- **Dependencies**: logger.ts
- **Dependents**: container-runner.ts, index.ts
- **Config surface**: None (hardcoded to "docker")
- **Dashboard relevance**: `cleanupOrphans()` shows how to find NanoClaw containers: `docker ps --filter name=nanoclaw- --format '{{.Names}}'`. `ensureContainerRuntimeRunning()` checks `docker info`.

## src/ipc.ts
- **Purpose**: IPC watcher. Polls filesystem for messages and task operations written by containers.
- **Key exports**: `IpcDeps` (interface), `startIpcWatcher()`, `processTaskIpc()`
- **Dependencies**: config.ts, container-runner.ts, db.ts, group-folder.ts, logger.ts, types.ts
- **Dependents**: index.ts
- **Config surface**: `DATA_DIR`, `IPC_POLL_INTERVAL` (1000ms), `MAIN_GROUP_FOLDER`, `TIMEZONE`
- **Dashboard relevance**: Shows all IPC message types the system handles. Dashboard could trigger actions by writing IPC files to `data/ipc/{group}/tasks/`. Error files are moved to `data/ipc/errors/`.

## src/task-scheduler.ts
- **Purpose**: Runs scheduled tasks. Polls for due tasks and executes them via containers.
- **Key exports**: `SchedulerDependencies` (interface), `startSchedulerLoop()`, `_resetSchedulerLoopForTests()`
- **Key internal functions**: `runTask()`
- **Dependencies**: config.ts, container-runner.ts, db.ts, group-queue.ts, group-folder.ts, logger.ts, types.ts, cron-parser
- **Dependents**: index.ts
- **Config surface**: `ASSISTANT_NAME`, `MAIN_GROUP_FOLDER`, `SCHEDULER_POLL_INTERVAL` (60000ms), `TIMEZONE`
- **Dashboard relevance**: Task execution state. Dashboard can query `scheduled_tasks` and `task_run_logs` tables. The scheduler's 60s polling interval means tasks may be up to 60s late.

## src/group-queue.ts
- **Purpose**: Concurrency control. Manages which groups have active containers, queues excess work, handles retries with exponential backoff.
- **Key exports**: `GroupQueue` class
- **Key methods**: `enqueueMessageCheck()`, `enqueueTask()`, `registerProcess()`, `notifyIdle()`, `sendMessage()`, `closeStdin()`, `setProcessMessagesFn()`, `shutdown()`
- **Key internal**: `GroupState` (interface with active, idleWaiting, isTaskContainer, pendingMessages, pendingTasks, process, containerName, groupFolder, retryCount), `MAX_RETRIES` (5), `BASE_RETRY_MS` (5000)
- **Dependencies**: config.ts, logger.ts
- **Dependents**: index.ts, task-scheduler.ts
- **Config surface**: `MAX_CONCURRENT_CONTAINERS`, `DATA_DIR` (for IPC file paths)
- **Dashboard relevance**: In-memory only state. Dashboard cannot observe queue state directly without adding an API. Active container count, waiting groups, and per-group state would be valuable dashboard data. Container names are tracked here via `registerProcess()`.

## src/group-folder.ts
- **Purpose**: Path validation and resolution for group folders. Prevents path traversal attacks.
- **Key exports**: `isValidGroupFolder()`, `assertValidGroupFolder()`, `resolveGroupFolderPath()`, `resolveGroupIpcPath()`
- **Key internal**: `GROUP_FOLDER_PATTERN` (/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/), `RESERVED_FOLDERS` (Set: "global")
- **Dependencies**: config.ts
- **Dependents**: db.ts, container-runner.ts, ipc.ts, task-scheduler.ts, index.ts
- **Config surface**: `GROUPS_DIR`, `DATA_DIR`
- **Dashboard relevance**: Validation rules for group folder names. Dashboard must validate folder names with the same rules when creating groups.

## src/mount-security.ts
- **Purpose**: Validates additional mounts against an external allowlist. Prevents containers from accessing sensitive host directories.
- **Key exports**: `loadMountAllowlist()`, `validateMount()`, `validateAdditionalMounts()`, `generateAllowlistTemplate()`, `MountValidationResult` (interface)
- **Key internal**: `DEFAULT_BLOCKED_PATTERNS` (array of 16 patterns like ".ssh", ".gnupg", ".aws", etc.)
- **Dependencies**: config.ts, types.ts
- **Dependents**: container-runner.ts
- **Config surface**: `MOUNT_ALLOWLIST_PATH` (~/.config/nanoclaw/mount-allowlist.json)
- **Dashboard relevance**: Security configuration. Dashboard could display the allowlist, show which mounts are allowed/blocked, and provide a UI for editing the allowlist file.

## src/logger.ts
- **Purpose**: Pino logger setup with pretty printing. Catches uncaught exceptions and unhandled rejections.
- **Key exports**: `logger`
- **Dependencies**: pino
- **Dependents**: All modules
- **Config surface**: `LOG_LEVEL` env var (default "info")
- **Dashboard relevance**: Log level control. Dashboard could show real-time logs by tailing the log output files (logs/nanoclaw.log, logs/nanoclaw.error.log when running as service).

## src/channels/whatsapp.ts
- **Purpose**: WhatsApp channel implementation using Baileys library. Handles connection, authentication, message sending/receiving, group metadata sync.
- **Key exports**: `WhatsAppChannel` class, `WhatsAppChannelOpts` (interface)
- **Key methods**: `connect()`, `sendMessage()`, `isConnected()`, `ownsJid()`, `disconnect()`, `setTyping()`, `syncGroupMetadata()`
- **Key internal**: `GROUP_SYNC_INTERVAL_MS` (24h), `lidToPhoneMap`, `outgoingQueue`, `translateJid()`
- **Dependencies**: config.ts (`ASSISTANT_HAS_OWN_NUMBER`, `ASSISTANT_NAME`, `STORE_DIR`), db.ts, logger.ts, types.ts, @whiskeysockets/baileys
- **Dependents**: index.ts
- **Config surface**: `ASSISTANT_NAME` (message prefix, bot detection), `ASSISTANT_HAS_OWN_NUMBER` (prefix behavior), `STORE_DIR/auth` (auth state directory)
- **Dashboard relevance**: Connection status (isConnected), outgoing queue size (messages queued while disconnected), group sync timing. Auth state at `store/auth/` -- existence indicates authentication.

## src/whatsapp-auth.ts
- **Purpose**: Standalone WhatsApp authentication script. Displays QR code, waits for scan, saves credentials.
- **Key exports**: None (standalone script)
- **Key internal**: `authenticate()`, `connectSocket()`, supports `--pairing-code` and `--phone` flags
- **Dependencies**: @whiskeysockets/baileys, qrcode-terminal, pino
- **Dependents**: None (standalone script, run via `npm run auth`)
- **Config surface**: `AUTH_DIR` ("./store/auth"), `QR_FILE` ("./store/qr-data.txt"), `STATUS_FILE` ("./store/auth-status.txt")
- **Dashboard relevance**: Auth status can be checked via `store/auth-status.txt`. QR code data at `store/qr-data.txt` during auth flow. Dashboard could trigger re-authentication.

## container/agent-runner/src/index.ts
- **Purpose**: Agent runner inside the container. Reads ContainerInput from stdin, runs Claude Agent SDK queries in a loop, handles IPC input/output.
- **Key exports**: None (entry point)
- **Key internal functions**: `main()`, `runQuery()`, `readStdin()`, `writeOutput()`, `drainIpcInput()`, `waitForIpcMessage()`, `shouldClose()`, `createPreCompactHook()`, `createSanitizeBashHook()`, `parseTranscript()`, `formatTranscriptMarkdown()`
- **Key internal classes**: `MessageStream` (push-based async iterable for streaming user messages to SDK)
- **Dependencies**: @anthropic-ai/claude-agent-sdk, fs, path
- **Dependents**: None (runs inside container)
- **Config surface**: `IPC_INPUT_DIR` ("/workspace/ipc/input"), `IPC_POLL_MS` (500), `SECRET_ENV_VARS` (["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"])
- **Dashboard relevance**: Shows how the agent sees the world. The `allowedTools` list defines what tools agents can use. The PreCompactHook archives conversations to `conversations/` directory. The sanitize bash hook strips secrets from subprocess environments.

## container/agent-runner/src/ipc-mcp-stdio.ts
- **Purpose**: MCP server providing tools to the agent inside the container. Tools communicate with the host via IPC files.
- **Key exports**: None (standalone MCP server process)
- **MCP tools**: `send_message`, `schedule_task`, `list_tasks`, `pause_task`, `resume_task`, `cancel_task`, `register_group`
- **Dependencies**: @modelcontextprotocol/sdk, zod, cron-parser
- **Dependents**: agent-runner/src/index.ts (spawned as MCP server)
- **Config surface**: `NANOCLAW_CHAT_JID`, `NANOCLAW_GROUP_FOLDER`, `NANOCLAW_IS_MAIN` (env vars set by agent runner)
- **Dashboard relevance**: Defines all actions an agent can take. Dashboard could provide the same capabilities by writing equivalent IPC files.
