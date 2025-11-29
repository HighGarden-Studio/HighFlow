# Real-time Collaboration Features

This document describes the real-time collaboration system implemented in the AI Workflow Manager.

## Overview

The collaboration system enables multiple users to work simultaneously on the same project with:
- **Real-time synchronization** of task updates
- **Conflict-free collaborative editing** using CRDT (Yjs)
- **User presence** tracking (who's online, what they're editing)
- **Automatic conflict resolution** for concurrent changes
- **Offline mode** with automatic sync when reconnected

## Architecture

### Components

1. **WebSocket Server** (`src/server/websocket/WebSocketServer.ts`)
   - Socket.IO-based real-time communication
   - JWT authentication
   - Room management (per-project)
   - Event broadcasting

2. **CRDT Synchronization** (`src/services/collaboration/CRDTSync.ts`)
   - Yjs document for conflict-free editing
   - WebSocket provider for real-time sync
   - Supports: Task prompts, Comments, Project descriptions
   - Undo/Redo functionality

3. **Presence Manager** (`src/services/collaboration/PresenceManager.ts`)
   - Tracks user activity and location
   - Cursor positions
   - Editing status
   - Auto-away detection

4. **Conflict Resolver** (`src/services/collaboration/ConflictResolver.ts`)
   - Last-write-wins for task status changes
   - Timestamp-based merging for comments
   - CRDT auto-merge for text edits

5. **Sync Engine** (`src/services/sync/SyncEngine.ts`)
   - Bi-directional synchronization
   - Offline queue management
   - Optimistic updates
   - Auto-sync (30s interval)

6. **Collaboration Client** (`src/services/collaboration/CollaborationClient.ts`)
   - Unified interface for all collaboration services
   - Connection management
   - Status monitoring

## Usage

### Setup in Vue Components

```typescript
import { useCollaboration } from '../composables/useCollaboration';

const {
  status,              // Connection and sync status
  activeUsers,         // Map of online users
  connect,             // Connect to collaboration server
  disconnect,          // Disconnect
  editTaskPrompt,      // Get CRDT text editor for task
  manageComments,      // CRDT comment manager
  updatePresence,      // Update your presence
  queueTaskUpdate,     // Queue task changes for sync
  manualSync,          // Trigger manual sync
  undo,                // Undo last change
  redo,                // Redo last undone change
} = useCollaboration({
  userId: 1,
  userEmail: 'user@example.com',
  projectId: 1,
  autoConnect: true,
  autoSync: true,
  syncInterval: 30000, // 30 seconds
});
```

### WebSocket Server Setup

The WebSocket server needs to be started separately (currently not integrated with Electron main process):

```typescript
import { createServer } from 'http';
import { WebSocketServer } from './src/server/websocket/WebSocketServer';

const httpServer = createServer();
const wsServer = new WebSocketServer(httpServer, 'your-jwt-secret');

httpServer.listen(3000, () => {
  console.log('WebSocket server running on port 3000');
});
```

### Event Flow

1. **Task Update Flow**
   ```
   User A updates task
   → Local state updated (optimistic)
   → Change queued in SyncEngine
   → Sent to WebSocket server
   → Server broadcasts to all users in project
   → User B receives update
   → Conflict resolution (if needed)
   → User B's UI updated
   ```

2. **Collaborative Editing Flow**
   ```
   User A types in prompt
   → CRDT (Yjs) captures change
   → Sent via WebSocket Provider
   → Server relays to all connected users
   → User B's CRDT receives change
   → CRDT auto-merges changes
   → User B sees update in real-time
   ```

3. **Offline Mode Flow**
   ```
   User goes offline
   → Changes queued locally
   → Optimistic UI updates continue
   → User reconnects
   → SyncEngine.sync() triggered
   → Local changes pushed to server
   → Remote changes pulled
   → Conflicts resolved
   → UI updated with resolved state
   ```

## UI Components

### ActiveCollaborators

Displays avatars of online users with status indicators:

```vue
<ActiveCollaborators
  :users="activeUsers"
  :max-display="5"
/>
```

### CollaborationStatus

Shows connection, sync status, and pending changes:

```vue
<CollaborationStatus
  :status="collaborationStatus"
  :show-details="true"
  @sync="manualSync"
/>
```

## Conflict Resolution Strategies

### 1. Task Status Changes
**Strategy**: Last Write Wins
- Concurrent status changes resolved by timestamp
- Most recent change wins

### 2. Comments
**Strategy**: Merge by Timestamp
- All comments preserved
- Sorted by creation time
- Duplicates eliminated by ID

### 3. Prompt/Description Edits
**Strategy**: CRDT Auto-Merge
- Yjs handles all conflict resolution
- Character-level merging
- Preserves all users' changes

### 4. Field Updates (Title, Priority, etc.)
**Strategy**: Last Write Wins
- Timestamp-based resolution
- Most recent change wins

## Configuration

### Enable Collaboration in App

In `src/renderer/App.vue`:

```typescript
// Toggle this to enable/disable collaboration
const enableCollaboration = ref(true);
```

### WebSocket URL

Configure in composable:

```typescript
useCollaboration({
  websocketUrl: 'http://localhost:3000', // or your server URL
  // ... other options
});
```

### Sync Interval

Adjust auto-sync frequency:

```typescript
useCollaboration({
  syncInterval: 30000, // milliseconds (30s default)
  // ... other options
});
```

## Events

### Server Events

- `join:project` - User joins project room
- `leave:project` - User leaves project room
- `task:update` - Task fields updated
- `task:move` - Task status changed
- `comment:add` - New comment added
- `cursor:move` - User cursor moved
- `typing:start` - User started typing
- `typing:stop` - User stopped typing

### Client Events

- `user:joined` - Another user joined
- `user:left` - Another user left
- `user:disconnected` - User disconnected
- `task:updated` - Receive task update
- `task:moved` - Receive task move
- `comment:added` - Receive new comment
- `cursor:moved` - Receive cursor update
- `typing:started` - User started typing
- `typing:stopped` - User stopped typing

### Custom Events (Window)

- `collaboration:conflicts` - Conflicts detected during sync
- `sync:remote-change` - Remote change received
- `sync:optimistic-update` - Optimistic update applied

## Security

### JWT Authentication

All WebSocket connections require JWT token:

```typescript
import { generateToken } from './src/server/websocket/WebSocketServer';

const token = generateToken(userId, userEmail, 'your-secret');
```

**Important**: Change the default JWT secret in production!

### Room Isolation

Users can only see/edit tasks in projects they've joined:
- Each project has a separate room
- Broadcasts only within room
- Server validates project membership (TODO)

## Performance

### Optimizations

1. **Throttled Presence Updates**
   - Max 1 update per second
   - Reduces network traffic

2. **Batched Sync**
   - Changes collected and sent in batches
   - Reduces number of requests

3. **Optimistic Updates**
   - UI updates immediately
   - Server sync happens in background

4. **Connection Pooling**
   - Single WebSocket per user
   - Shared across all components

### Scalability

Current implementation suitable for:
- Small teams (5-10 concurrent users)
- Single project at a time
- Low to medium task update frequency

For larger deployments, consider:
- Redis adapter for Socket.IO (multi-server)
- Y-Redis for CRDT persistence
- Database-backed sync instead of in-memory
- Rate limiting and quota management

## Debugging

### Enable Verbose Logging

In browser console:

```javascript
localStorage.setItem('debug', 'socket.io-client:*,yjs:*');
```

### Check Connection Status

```javascript
import { getGlobalCollaborationClient } from '../composables/useCollaboration';

const client = getGlobalCollaborationClient();
console.log(client?.getStatus());
```

### Monitor Sync State

```javascript
const sync = client?.getSync();
console.log(sync?.getState());
```

### Check Pending Conflicts

```javascript
const resolver = sync?.getConflictResolver();
console.log(resolver?.getPendingConflicts());
```

## Limitations

1. **No Server Implementation**
   - WebSocket server code provided but not integrated
   - Needs separate Node.js process or Electron main process integration

2. **No Persistence**
   - CRDT documents stored in memory only
   - Lost on server restart
   - Need Y-Redis or similar for persistence

3. **No Authentication Backend**
   - JWT tokens generated client-side (demo only)
   - Need proper auth server in production

4. **No User Management**
   - No user registration/login
   - No project membership validation
   - No permission system

5. **Limited Testing**
   - Code provided but not extensively tested
   - Needs integration tests
   - Needs load testing

## Next Steps

To fully enable collaboration:

1. **Start WebSocket Server**
   ```bash
   # Create server entry point
   node src/server/websocket/index.js
   ```

2. **Integrate with Electron**
   - Run WebSocket server in main process
   - Use IPC for communication

3. **Add Persistence**
   - Set up Y-Redis or Y-LevelDB
   - Store CRDT documents permanently

4. **Implement Authentication**
   - Add user registration/login
   - Integrate with database
   - Validate JWT tokens server-side

5. **Add Project Permissions**
   - Check user membership
   - Enforce read/write permissions
   - Add role-based access control

## Examples

### Example: Real-time Task Prompt Editing

```typescript
const { editTaskPrompt } = useCollaboration({...});

const taskEditor = editTaskPrompt(taskId);
if (taskEditor) {
  const ytext = taskEditor.getText();

  // Observe changes
  taskEditor.observe((event) => {
    console.log('Prompt changed:', ytext.toString());
  });

  // Update text
  taskEditor.update(0, 5, 'Hello'); // Replace first 5 chars with 'Hello'
}
```

### Example: Showing Who's Editing a Task

```vue
<template>
  <div v-if="editingUsers.length > 0">
    <p>Currently editing:</p>
    <ul>
      <li v-for="user in editingUsers" :key="user.userId">
        {{ user.email }}
      </li>
    </ul>
  </div>
</template>

<script setup>
const { getUsersEditingTask } = useCollaboration({...});

const editingUsers = computed(() => getUsersEditingTask(taskId));
</script>
```

### Example: Manual Conflict Resolution

```typescript
import { getGlobalCollaborationClient } from '../composables/useCollaboration';

// Listen for conflicts
window.addEventListener('collaboration:conflicts', (event) => {
  const conflicts = event.detail;

  conflicts.forEach(conflict => {
    if (conflict.resolution === 'manual') {
      // Show UI for user to resolve
      showConflictDialog(conflict);
    }
  });
});
```

## Resources

- [Socket.IO Documentation](https://socket.io/docs/)
- [Yjs Documentation](https://docs.yjs.dev/)
- [CRDT Wikipedia](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)
- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
