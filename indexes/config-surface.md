# Configuration Surface

## Dashboard Environment Variables

### DASHBOARD_ADMIN_TOKEN
- **Required**: Yes (dashboard won't authenticate without it)
- **Where read**: `dashboard/middleware.ts`, `dashboard/src/lib/server/auth.ts`
- **What it controls**: Admin login token. Cookie `nanoclaw_dashboard_session` validated against this.
- **Effect of changing**: Immediate (checked per-request). Existing sessions invalidated.

### NANOCLAW_ROOT
- **Default**: `../nanoclaw` (relative to dashboard working directory)
- **Where read**: `dashboard/src/lib/server/paths.ts`
- **What it controls**: Base path to NanoClaw installation. All DB, IPC, group, log paths derived from this.
- **Effect of changing**: Requires dashboard restart.

### NODE_ENV
- **Where read**: `dashboard/src/lib/server/auth.ts`
- **What it controls**: When "production", auth cookies get `secure: true` flag.

---

## NanoClaw Environment Variables (.env file)

### ASSISTANT_NAME
- **Default**: `"Andy"`
- **Where read**: `nanoclaw/src/config.ts` via `readEnvFile()`
- **What it controls**: Trigger pattern (`@{name}`), message prefix (`{name}: `), bot message detection
- **Effect of changing**: Requires restart

### ASSISTANT_HAS_OWN_NUMBER
- **Default**: `false`
- **Where read**: `nanoclaw/src/config.ts` via `readEnvFile()`
- **What it controls**: When true, bot detected by `is_from_me`; no prefix on outbound. When false, detected by `{name}:` prefix.
- **Effect of changing**: Requires restart

### CONTAINER_IMAGE
- **Default**: `"nanoclaw-agent:latest"`
- **Where read**: `nanoclaw/src/config.ts` from `process.env`
- **What it controls**: Docker image for agent containers
- **Effect of changing**: Requires restart (read once at import)

### CONTAINER_TIMEOUT
- **Default**: `1800000` (30 min)
- **Where read**: `nanoclaw/src/config.ts`
- **What it controls**: Max container runtime. Actual = `Math.max(CONTAINER_TIMEOUT, IDLE_TIMEOUT + 30000)`
- **Effect of changing**: Requires restart

### CONTAINER_MAX_OUTPUT_SIZE
- **Default**: `10485760` (10 MB)
- **What it controls**: Max stdout/stderr from container before truncation
- **Effect of changing**: Requires restart

### IDLE_TIMEOUT
- **Default**: `1800000` (30 min)
- **What it controls**: How long container stays alive after last result. After expiry, `_close` sentinel written.
- **Effect of changing**: Requires restart

### MAX_CONCURRENT_CONTAINERS
- **Default**: `5` (min 1)
- **What it controls**: Concurrent Docker containers. Excess queued in `GroupQueue.waitingGroups`.
- **Effect of changing**: Requires restart

### LOG_LEVEL
- **Default**: `"info"`
- **Where read**: `nanoclaw/src/logger.ts`
- **What it controls**: Pino log level. "debug"/"trace" enables full container I/O in logs.
- **Effect of changing**: Requires restart

### TZ
- **Default**: System timezone
- **What it controls**: Cron evaluation timezone. Passed to containers via `-e TZ=`.
- **Effect of changing**: Requires restart

### CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY
- **Where read**: `nanoclaw/src/container-runner.ts` via `readEnvFile()` at each spawn
- **What it controls**: Auth for Claude Agent SDK. Passed via stdin JSON.
- **Effect of changing**: Next container spawn (no restart needed)

---

## Hardcoded Constants

### Polling Intervals
| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| POLL_INTERVAL | 2000ms | nanoclaw/src/config.ts | Message loop polling |
| SCHEDULER_POLL_INTERVAL | 60000ms | nanoclaw/src/config.ts | Task scheduler polling |
| IPC_POLL_INTERVAL | 1000ms | nanoclaw/src/config.ts | Host IPC watcher |
| IPC_POLL_MS | 500ms | container/agent-runner/src/index.ts | Agent IPC input polling |
| GROUP_SYNC_INTERVAL_MS | 86400000ms | nanoclaw/src/channels/whatsapp.ts | WhatsApp metadata sync |

### Queue / Retry
| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| MAX_RETRIES | 5 | nanoclaw/src/group-queue.ts | Max retry for failed processing |
| BASE_RETRY_MS | 5000ms | nanoclaw/src/group-queue.ts | Backoff base: `5000 * 2^(n-1)` |
| TASK_CLOSE_DELAY_MS | 10000ms | nanoclaw/src/task-scheduler.ts | Delay before closing task container |

### Paths
| Constant | Value | Location |
|----------|-------|----------|
| STORE_DIR | `{cwd}/store` | nanoclaw/src/config.ts |
| GROUPS_DIR | `{cwd}/groups` | nanoclaw/src/config.ts |
| DATA_DIR | `{cwd}/data` | nanoclaw/src/config.ts |
| MAIN_GROUP_FOLDER | `"main"` | nanoclaw/src/config.ts |
| MOUNT_ALLOWLIST_PATH | `~/.config/nanoclaw/mount-allowlist.json` | nanoclaw/src/config.ts |

### Validation
| Pattern | Value | Location |
|---------|-------|----------|
| GROUP_FOLDER_PATTERN | `/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/` | nanoclaw/src/group-folder.ts |
| RESERVED_FOLDERS | `Set("global")` | nanoclaw/src/group-folder.ts |

---

## Dashboard Polling Intervals (client-side)

| Data | Interval | Page |
|------|----------|------|
| Chat list | 10s | /chat |
| Messages | 3s | /chat |
| Tasks (sidebar) | 15s | /chat |
| Tasks (main) | 3s | /tasks |
| Agents | 3s | /agents |
| System health (header) | 10s | all pages |
| System health + config | 5s | /system |

All client-side polling pauses when document is hidden (visibility API).

---

## Config Files

### Mount Allowlist (`~/.config/nanoclaw/mount-allowlist.json`)
```json
{
  "allowedRoots": [{ "path": "~/projects", "allowReadWrite": true, "description": "Dev projects" }],
  "blockedPatterns": ["password", "secret"],
  "nonMainReadOnly": true
}
```
- If missing or invalid JSON: ALL additional mounts blocked
- Cached in memory for process lifetime
- Stored outside project root (tamper-proof)
- Default blocked patterns (16): .ssh, .gnupg, .gpg, .aws, .azure, .gcloud, .kube, .docker, credentials, .env, .netrc, .npmrc, .pypirc, id_rsa, id_ed25519, private_key, .secret

### Memory Files
| File | Mounted As | Effect |
|------|-----------|--------|
| `groups/global/CLAUDE.md` | `/workspace/global/CLAUDE.md` (ro) | Shared instructions for non-main groups |
| `groups/{name}/CLAUDE.md` | `/workspace/group/CLAUDE.md` (rw) | Per-group memory, loaded by Claude SDK |
| `data/sessions/{name}/.claude/settings.json` | `/home/node/.claude/settings.json` | SDK settings (auto-generated if missing) |

### Service Configuration
- **macOS**: `~/Library/LaunchAgents/com.nanoclaw.plist` (launchctl)
- **Linux**: systemd user service (referenced but unit file not in repo)
- **Logs**: `{nanoclaw}/logs/nanoclaw.log`, `{nanoclaw}/logs/nanoclaw.error.log`

---

## Config Change Propagation

| What Changed | When It Takes Effect |
|-------------|---------------------|
| CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY | Next container spawn |
| groups/*/CLAUDE.md | Next container spawn |
| groups/global/CLAUDE.md | Next container spawn |
| Mount allowlist | Next container spawn (cached in memory) |
| All other env vars / config.ts constants | Requires NanoClaw process restart |
| DASHBOARD_ADMIN_TOKEN | Immediate (per-request) |
| NANOCLAW_ROOT | Requires dashboard restart |
