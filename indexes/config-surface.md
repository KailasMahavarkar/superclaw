# NanoClaw Configuration Surface

## Environment Variables (.env file)

### ASSISTANT_NAME
- **Default**: `"Andy"`
- **Where read**: `config.ts` via `readEnvFile(['ASSISTANT_NAME', ...])`. Also falls back to `process.env.ASSISTANT_NAME`.
- **What it controls**:
  - Trigger pattern: messages must start with `@{ASSISTANT_NAME}` to activate the bot in non-main groups
  - Message prefixing: outbound messages are prefixed with `{ASSISTANT_NAME}: ` (unless ASSISTANT_HAS_OWN_NUMBER)
  - Bot message detection: messages starting with `{ASSISTANT_NAME}:` are classified as bot messages
  - Bot message backfill: migration marks existing messages matching `{ASSISTANT_NAME}:%` as bot messages
- **Effect of changing**: Changes trigger word. Requires restart. Old messages with old prefix will still be filtered correctly due to is_bot_message column.

### ASSISTANT_HAS_OWN_NUMBER
- **Default**: `false`
- **Where read**: `config.ts` via `readEnvFile(...)`. Compared as string `=== 'true'`.
- **What it controls**:
  - When `true`: bot messages detected by `is_from_me` flag; no prefix added to outbound messages
  - When `false`: bot messages detected by `{ASSISTANT_NAME}:` prefix; prefix added to all outbound messages
- **Effect of changing**: Affects how outgoing messages appear. Requires restart.

### CONTAINER_IMAGE
- **Default**: `"nanoclaw-agent:latest"`
- **Where read**: `config.ts` from `process.env.CONTAINER_IMAGE`
- **What it controls**: Docker image name used when spawning containers
- **Effect of changing**: Next container spawn uses new image. No restart needed (read per-spawn from process.env? No -- config.ts is read once at import time, so restart required).

### CONTAINER_TIMEOUT
- **Default**: `1800000` (30 minutes)
- **Where read**: `config.ts` from `process.env.CONTAINER_TIMEOUT`
- **What it controls**: Maximum time a container can run before being killed. Actual timeout is `Math.max(CONTAINER_TIMEOUT, IDLE_TIMEOUT + 30000)`.
- **Effect of changing**: Requires restart. Affects how long agents can work on complex tasks.

### CONTAINER_MAX_OUTPUT_SIZE
- **Default**: `10485760` (10 MB)
- **Where read**: `config.ts` from `process.env.CONTAINER_MAX_OUTPUT_SIZE`
- **What it controls**: Maximum stdout/stderr accumulation from a container. Truncated after this limit.
- **Effect of changing**: Requires restart.

### IDLE_TIMEOUT
- **Default**: `1800000` (30 minutes)
- **Where read**: `config.ts` from `process.env.IDLE_TIMEOUT`
- **What it controls**: How long a container stays alive after its last result output. After expiry, `queue.closeStdin()` writes the `_close` sentinel to trigger graceful shutdown.
- **Effect of changing**: Requires restart. Lower values free resources faster; higher values allow more follow-up messages without cold starts.

### MAX_CONCURRENT_CONTAINERS
- **Default**: `5`
- **Where read**: `config.ts` from `process.env.MAX_CONCURRENT_CONTAINERS`. Clamped to minimum 1.
- **What it controls**: Maximum number of Docker containers running simultaneously. Additional requests are queued in `GroupQueue.waitingGroups`.
- **Effect of changing**: Requires restart.

### LOG_LEVEL
- **Default**: `"info"`
- **Where read**: `logger.ts` from `process.env.LOG_LEVEL`. Also checked in `container-runner.ts` for verbose container logging.
- **What it controls**: pino log level. Options: "trace", "debug", "info", "warn", "error", "fatal".
- **Effect of changing**: Requires restart. "debug" or "trace" enables full container input/output in log files.

### TZ
- **Default**: System timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- **Where read**: `config.ts` from `process.env.TZ`
- **What it controls**: Timezone for cron expression evaluation and scheduled tasks. Passed to containers via `-e TZ={TIMEZONE}`.
- **Effect of changing**: Requires restart. Affects when cron tasks fire.

### CLAUDE_CODE_OAUTH_TOKEN
- **Default**: None
- **Where read**: `container-runner.ts` via `readEnvFile(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'])` at container spawn time
- **What it controls**: Authentication for Claude Agent SDK. Passed to container via stdin JSON (never as env var or mount).
- **Effect of changing**: Takes effect on next container spawn without restart (read from .env each time).

### ANTHROPIC_API_KEY
- **Default**: None
- **Where read**: `container-runner.ts` via `readEnvFile(...)` at container spawn time
- **What it controls**: Alternative authentication for Claude Agent SDK.
- **Effect of changing**: Takes effect on next container spawn without restart.

---

## Config Constants in config.ts

### POLL_INTERVAL
- **Value**: `2000` (2 seconds)
- **Hardcoded**: Yes
- **What it controls**: How often `startMessageLoop()` polls SQLite for new messages
- **Effect of changing**: Trade-off between response latency and CPU usage

### SCHEDULER_POLL_INTERVAL
- **Value**: `60000` (60 seconds)
- **Hardcoded**: Yes
- **What it controls**: How often `startSchedulerLoop()` checks for due tasks
- **Effect of changing**: Tasks may fire up to this many ms late

### IPC_POLL_INTERVAL
- **Value**: `1000` (1 second)
- **Hardcoded**: Yes
- **What it controls**: How often `startIpcWatcher()` scans IPC directories for new files
- **Effect of changing**: Latency for IPC file processing (messages, task operations)

### IPC_POLL_MS (agent-runner)
- **Value**: `500` (0.5 seconds)
- **Hardcoded**: Yes (in container/agent-runner/src/index.ts)
- **What it controls**: How often the agent runner polls `/workspace/ipc/input/` for follow-up messages and `_close` sentinel

### MAIN_GROUP_FOLDER
- **Value**: `"main"`
- **Hardcoded**: Yes
- **What it controls**: Which group folder gets elevated privileges (read-only project access, can register groups, can schedule for other groups, no trigger required)

### STORE_DIR
- **Value**: `path.resolve(process.cwd(), 'store')`
- **What it controls**: Location of SQLite database and WhatsApp auth state

### GROUPS_DIR
- **Value**: `path.resolve(process.cwd(), 'groups')`
- **What it controls**: Base directory for group folders

### DATA_DIR
- **Value**: `path.resolve(process.cwd(), 'data')`
- **What it controls**: Location of IPC directories and sessions data

### GROUP_SYNC_INTERVAL_MS (whatsapp.ts)
- **Value**: `86400000` (24 hours)
- **Hardcoded**: Yes
- **What it controls**: Minimum interval between WhatsApp group metadata syncs. Cached in chats table via `__group_sync__` entry.

### MAX_RETRIES (group-queue.ts)
- **Value**: `5`
- **Hardcoded**: Yes
- **What it controls**: Maximum retry attempts for failed message processing per group

### BASE_RETRY_MS (group-queue.ts)
- **Value**: `5000` (5 seconds)
- **Hardcoded**: Yes
- **What it controls**: Base delay for exponential backoff. Actual delay: `5000 * 2^(retryCount-1)`

### TASK_CLOSE_DELAY_MS (task-scheduler.ts)
- **Value**: `10000` (10 seconds)
- **Hardcoded**: Yes
- **What it controls**: Delay after task produces a result before closing the container. Allows final MCP calls.

---

## Per-Group Configuration (registered_groups table)

### containerConfig
- **Stored as**: JSON string in `container_config` column
- **Structure**:
```typescript
{
  additionalMounts?: [{
    hostPath: string,         // Absolute path or ~ prefix
    containerPath?: string,   // Defaults to basename(hostPath)
    readonly?: boolean        // Default: true
  }],
  timeout?: number            // Container timeout override in ms
}
```
- **Where read**: `container-runner.ts` in `buildVolumeMounts()` and container timeout calculation
- **Effect of changing**: Takes effect on next container spawn. Modified via `setRegisteredGroup()` or IPC `register_group`.

### requiresTrigger
- **Stored as**: INTEGER (1 or 0) in `requires_trigger` column
- **Default**: `1` (true)
- **What it controls**: Whether messages need `@nanoName` prefix to be processed
- **Special case**: Main group always processes all messages regardless of this setting
- **Effect of changing**: Immediate on next message poll cycle

---

## Mount Allowlist (~/.config/nanoclaw/mount-allowlist.json)

Location: `{HOME}/.config/nanoclaw/mount-allowlist.json`

### Structure
```json
{
  "allowedRoots": [
    {
      "path": "~/projects",
      "allowReadWrite": true,
      "description": "Development projects"
    }
  ],
  "blockedPatterns": ["password", "secret", "token"],
  "nonMainReadOnly": true
}
```

### Fields

#### allowedRoots[].path
- **What it controls**: Directories under which additional mounts are permitted. Supports `~` expansion.

#### allowedRoots[].allowReadWrite
- **What it controls**: Whether read-write mounts are allowed under this root. If false, all mounts under this root are forced read-only.

#### blockedPatterns
- **What it controls**: Additional path components that block mounting. Merged with DEFAULT_BLOCKED_PATTERNS: `.ssh`, `.gnupg`, `.gpg`, `.aws`, `.azure`, `.gcloud`, `.kube`, `.docker`, `credentials`, `.env`, `.netrc`, `.npmrc`, `.pypirc`, `id_rsa`, `id_ed25519`, `private_key`, `.secret`

#### nonMainReadOnly
- **What it controls**: If true, non-main groups can only have read-only additional mounts regardless of per-root settings.

### Behavior
- File is cached in memory after first load (process lifetime)
- If file doesn't exist: ALL additional mounts are blocked
- If file is invalid JSON: ALL additional mounts are blocked
- Stored outside project root (not mounted into containers) for tamper-proof security

---

## Memory Files (CLAUDE.md hierarchy)

### groups/global/CLAUDE.md
- **Where read**: Agent runner loads this as `systemPrompt.append` for non-main groups
- **What it controls**: Shared instructions/personality/rules for all groups
- **Effect of changing**: Takes effect on next container spawn

### groups/{name}/CLAUDE.md
- **Where read**: Claude Agent SDK automatically loads from working directory (`/workspace/group/`)
- **What it controls**: Per-group memory, personality, context
- **Effect of changing**: Takes effect on next container spawn

### data/sessions/{name}/.claude/settings.json
- **Where read**: Claude Agent SDK loads from `~/.claude/settings.json` inside container
- **What it controls**: SDK settings per group. Default content:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD": "1",
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"
  }
}
```
- **Effect of changing**: Takes effect on next container spawn. Only written if file doesn't exist.

---

## Service Configuration

### macOS: launchd/com.nanoclaw.plist
- **Install location**: `~/Library/LaunchAgents/com.nanoclaw.plist`
- **Template variables**: `{{NODE_PATH}}`, `{{PROJECT_ROOT}}`, `{{HOME}}`
- **Key settings**: `RunAtLoad=true`, `KeepAlive=true`
- **Logs**: `{{PROJECT_ROOT}}/logs/nanoclaw.log`, `{{PROJECT_ROOT}}/logs/nanoclaw.error.log`
- **Commands**:
  - Load: `launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist`
  - Unload: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist`
  - Restart: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`

### Linux: systemd (referenced in docs but unit file not in repo)
- **Commands**:
  - Start: `systemctl --user start nanoclaw`
  - Stop: `systemctl --user stop nanoclaw`
  - Restart: `systemctl --user restart nanoclaw`
