# Dashboard Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DASHBOARD (React App)                            │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    dashboard-config.json                        │    │
│  │  - Features (enabled/disabled, positions)                       │    │
│  │  - Polling intervals (SQLite, Docker, IPC)                      │    │
│  │  - Capabilities (read-only vs admin)                            │    │
│  │  - Display settings (theme, limits)                             │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │   System     │  │    Group     │  │   Message    │  │   Task   │  │
│  │   Status     │  │  Management  │  │   Activity   │  │ Scheduler│  │
│  │     Bar      │  │    Panel     │  │     Feed     │  │  Panel   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘  │
│                                                                          │
│  ┌──────────────────────────────────┐  ┌──────────────────────────┐   │
│  │     Container Monitor Panel      │  │   Config Editor Modal    │   │
│  └──────────────────────────────────┘  └──────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Observes & Controls
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         NANOCLAW SERVER                                  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    SQLite Database                              │    │
│  │  store/messages.db                                              │    │
│  │  - chats, messages, registered_groups                           │    │
│  │  - scheduled_tasks, task_run_logs                               │    │
│  │  - sessions, router_state                                       │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                          ▲                                               │
│                          │ Polls every 3s                                │
│                          │                                               │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    Filesystem State                             │    │
│  │  data/ipc/{group}/messages/*.json  (IPC files)                 │    │
│  │  data/ipc/{group}/tasks/*.json     (Task operations)           │    │
│  │  groups/{name}/logs/*.log          (Container logs)            │    │
│  │  .env                               (Environment config)        │    │
│  │  ~/.config/nanoclaw/mount-allowlist.json (Security config)     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                          ▲                                               │
│                          │ Watches with chokidar                         │
│                          │                                               │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    Docker Containers                            │    │
│  │  nanoclaw-main-1706745600000       (Main group)                │    │
│  │  nanoclaw-family-chat-1706745600001 (Custom group)             │    │
│  │  - CPU/Memory stats                                             │    │
│  │  - Lifecycle (running/idle/exiting)                             │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                          ▲                                               │
│                          │ Polls every 5s via dockerode                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Dashboard → NanoClaw

### 1. Read Operations (Observability)

```
Dashboard                    NanoClaw
─────────                    ────────

┌─────────────┐
│ SQLite Poll │ ──────────► SELECT * FROM messages
│ (every 3s)  │             WHERE timestamp > ?
└─────────────┘
                            ┌──────────────┐
                            │ messages.db  │
                            └──────────────┘

┌─────────────┐
│ Docker Poll │ ──────────► docker ps --filter name=nanoclaw-
│ (every 5s)  │             docker stats --no-stream
└─────────────┘
                            ┌──────────────┐
                            │ Docker API   │
                            └──────────────┘

┌─────────────┐
│ File Watch  │ ──────────► chokidar.watch('data/ipc/**/messages/*.json')
│ (real-time) │
└─────────────┘
                            ┌──────────────┐
                            │ Filesystem   │
                            └──────────────┘
```

### 2. Write Operations (Actions)

```
Dashboard                    NanoClaw
─────────                    ────────

┌─────────────┐
│ Send Message│ ──────────► Write IPC file:
│   Button    │             data/ipc/main/messages/{ts}.json
└─────────────┘             { type: "message", chatJid, text }
                            
                            ┌──────────────┐
                            │ IPC Watcher  │ ──► Processes file
                            │ (polls 1s)   │     Sends message
                            └──────────────┘

┌─────────────┐
│ Pause Task  │ ──────────► UPDATE scheduled_tasks
│   Button    │             SET status = 'paused'
└─────────────┘             WHERE id = ?
                            
                            ┌──────────────┐
                            │ messages.db  │
                            └──────────────┘

┌─────────────┐
│ Stop        │ ──────────► docker stop nanoclaw-main-1706745600000
│ Container   │
└─────────────┘
                            ┌──────────────┐
                            │ Docker API   │
                            └──────────────┘
```

---

## Component Architecture

### Dashboard State Management (Zustand)

```typescript
interface DashboardStore {
  // System Status
  systemStatus: {
    whatsappConnected: boolean;
    activeContainers: number;
    maxContainers: number;
    registeredGroupsCount: number;
    activeTasksCount: number;
    lastActivity: string;
  };
  
  // Groups
  groups: {
    registered: RegisteredGroup[];
    available: ChatInfo[];
    selected: string | null;
  };
  
  // Messages
  messages: {
    byGroup: Record<string, NewMessage[]>;
    pending: Record<string, number>;
  };
  
  // Tasks
  tasks: {
    active: ScheduledTask[];
    history: TaskRunLog[];
  };
  
  // Containers
  containers: {
    running: ContainerInfo[];
    stats: Record<string, ContainerStats>;
  };
  
  // Config
  config: DashboardConfig;
  
  // Actions
  actions: {
    // Groups
    registerGroup: (group: RegisteredGroup) => Promise<void>;
    unregisterGroup: (jid: string) => Promise<void>;
    
    // Messages
    sendMessage: (chatJid: string, text: string) => Promise<void>;
    
    // Tasks
    scheduleTask: (task: ScheduledTask) => Promise<void>;
    pauseTask: (taskId: string) => Promise<void>;
    resumeTask: (taskId: string) => Promise<void>;
    deleteTask: (taskId: string) => Promise<void>;
    
    // Containers
    stopContainer: (containerName: string) => Promise<void>;
    
    // Config
    updateConfig: (config: Partial<DashboardConfig>) => Promise<void>;
  };
}
```

### Polling Hooks (React Query)

```typescript
// SQLite polling
const { data: messages } = useQuery({
  queryKey: ['messages', selectedGroup],
  queryFn: () => db.prepare(`
    SELECT * FROM messages 
    WHERE chat_jid = ? 
    ORDER BY timestamp DESC 
    LIMIT 50
  `).all(selectedGroup),
  refetchInterval: config.polling.sqliteIntervalMs, // 3000ms
});

// Docker polling
const { data: containers } = useQuery({
  queryKey: ['containers'],
  queryFn: async () => {
    const list = await docker.listContainers({
      filters: { name: ['nanoclaw-'] }
    });
    const stats = await Promise.all(
      list.map(c => docker.getContainer(c.Id).stats({ stream: false }))
    );
    return { list, stats };
  },
  refetchInterval: config.polling.containerStatusIntervalMs, // 5000ms
});

// Filesystem watching
useEffect(() => {
  const watcher = chokidar.watch('data/ipc/**/messages/*.json', {
    ignoreInitial: true,
    awaitWriteFinish: true
  });
  
  watcher.on('add', (path) => {
    const ipcMessage = JSON.parse(fs.readFileSync(path, 'utf-8'));
    queryClient.invalidateQueries(['messages']);
  });
  
  return () => watcher.close();
}, []);
```

---

## Config-Driven Rendering

### Feature Toggle Example

```typescript
function Dashboard() {
  const config = useDashboardConfig();
  
  return (
    <div className="dashboard">
      {config.features.systemStatus.enabled && (
        <SystemStatusBar position={config.features.systemStatus.position} />
      )}
      
      <div className="main-content">
        {config.features.groupManagement.enabled && (
          <GroupManagementPanel position={config.features.groupManagement.position} />
        )}
        
        {config.features.messageActivity.enabled && (
          <MessageActivityFeed position={config.features.messageActivity.position} />
        )}
        
        {config.features.taskScheduler.enabled && (
          <TaskSchedulerPanel position={config.features.taskScheduler.position} />
        )}
      </div>
      
      {config.features.containerMonitor.enabled && (
        <ContainerMonitorPanel position={config.features.containerMonitor.position} />
      )}
    </div>
  );
}
```

### Capability Control Example

```typescript
function TaskSchedulerPanel() {
  const config = useDashboardConfig();
  const canManageTasks = config.capabilities.canManageTasks;
  
  return (
    <div className="task-scheduler">
      <TaskList />
      
      {canManageTasks && (
        <>
          <Button onClick={handleCreateTask}>Create Task</Button>
          <Button onClick={handlePauseTask}>Pause Task</Button>
          <Button onClick={handleDeleteTask}>Delete Task</Button>
        </>
      )}
    </div>
  );
}
```

---

## Security Model

### Dashboard → NanoClaw Communication

```
┌─────────────────────────────────────────────────────────────┐
│                      Dashboard Process                       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  IPC File Writer (Atomic)                          │    │
│  │  1. Write to .tmp file                             │    │
│  │  2. fs.renameSync() to .json                       │    │
│  │  3. NanoClaw IPC watcher picks up                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  SQLite Writer (Direct)                            │    │
│  │  - Pause/resume tasks                              │    │
│  │  - Delete tasks                                    │    │
│  │  - Update group config                             │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Docker API Client (dockerode)                     │    │
│  │  - List containers                                 │    │
│  │  - Get stats                                       │    │
│  │  - Stop containers                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ All IPC files written to
                            │ data/ipc/main/ (elevated privileges)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    NanoClaw IPC Watcher                      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Authorization Check                               │    │
│  │  - Verify source group (main only for dashboard)   │    │
│  │  - Validate target JID                             │    │
│  │  - Check permissions                               │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Action Execution                                  │    │
│  │  - Send message                                    │    │
│  │  - Schedule task                                   │    │
│  │  - Register group                                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Guarantees

1. **No Direct Code Execution**: Dashboard never executes NanoClaw code
2. **IPC Authorization**: All IPC files written to `main` group (elevated privileges)
3. **Config Validation**: All config changes validated before writing
4. **Secret Sanitization**: API keys never displayed in UI
5. **Mount Validation**: Additional mounts validated against allowlist
6. **Audit Trail**: All dashboard actions logged

---

## Performance Considerations

### Polling Optimization

```typescript
// Adaptive polling: slow down when idle, speed up when active
const useAdaptivePolling = (baseInterval: number) => {
  const [interval, setInterval] = useState(baseInterval);
  const lastActivity = useLastActivity();
  
  useEffect(() => {
    const timeSinceActivity = Date.now() - lastActivity;
    
    if (timeSinceActivity < 60000) {
      // Active: poll faster
      setInterval(baseInterval);
    } else if (timeSinceActivity < 300000) {
      // Idle: poll slower
      setInterval(baseInterval * 2);
    } else {
      // Very idle: poll much slower
      setInterval(baseInterval * 5);
    }
  }, [lastActivity, baseInterval]);
  
  return interval;
};
```

### Virtualized Lists

```typescript
// Use react-virtual for large message lists
import { useVirtualizer } from '@tanstack/react-virtual';

function MessageList({ messages }: { messages: NewMessage[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated message height
    overscan: 5, // Render 5 extra items above/below viewport
  });
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <MessageItem
            key={messages[virtualItem.index].id}
            message={messages[virtualItem.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## Deployment Options

### Option 1: Electron Desktop App
```
Dashboard (Electron)
  ├── Main Process (Node.js)
  │   ├── SQLite access (better-sqlite3)
  │   ├── Docker API (dockerode)
  │   └── Filesystem access (fs, chokidar)
  └── Renderer Process (React)
      └── UI components
```

### Option 2: Web App + Backend
```
Dashboard (React SPA)
  └── HTTP API (Express)
      ├── SQLite access
      ├── Docker API
      ├── Filesystem access
      └── WebSocket (real-time updates)
```

### Option 3: Standalone Web App
```
Dashboard (React)
  ├── Direct SQLite access (sql.js in browser)
  ├── Docker API via proxy
  └── Filesystem access via File System Access API
```

**Recommendation**: Option 1 (Electron) for best performance and security.

---

## Conclusion

This architecture provides:
1. **Config-Driven**: All features controlled by `dashboard-config.json`
2. **Real-Time**: Polling + filesystem watching for live updates
3. **Secure**: IPC authorization, config validation, secret sanitization
4. **Performant**: Adaptive polling, virtualized lists, optimized queries
5. **Flexible**: Multiple deployment options (Electron, web, standalone)

The dashboard integrates seamlessly with NanoClaw without requiring code changes to the core system.
