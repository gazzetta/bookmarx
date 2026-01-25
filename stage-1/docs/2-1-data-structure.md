```markdown
# BookMarx Data Structures

## Core Data Types

### Bookmark Structure
```typescript
interface Bookmark {
    id: string;                // UUID
    userId: string;            // Owner's UUID
    url: string;              // Full URL
    title: string;            // Display title
    description?: string;      // Optional description
    icon?: string;            // Favicon URL
    folderId?: string;        // Parent folder UUID
    position: number;         // Order within folder
    tags?: string[];          // Optional tags
    metadata: {
        created: {
            timestamp: number;
            deviceId: string;
        };
        updated: {
            timestamp: number;
            deviceId: string;
        };
        lastVisited?: number;
        visitCount?: number;
        syncVersion: number;
    };
    status: 'active' | 'deleted' | 'archived';
}
```

### Folder Structure
```typescript
interface Folder {
    id: string;               // UUID
    userId: string;           // Owner's UUID
    name: string;             // Display name
    parentId?: string;        // Parent folder UUID
    position: number;         // Order within parent
    metadata: {
        created: {
            timestamp: number;
            deviceId: string;
        };
        updated: {
            timestamp: number;
            deviceId: string;
        };
        childCount: {
            folders: number;
            bookmarks: number;
        };
        syncVersion: number;
    };
    status: 'active' | 'deleted';
    path: string[];          // Materialized path
}
```

### Device Information
```typescript
interface DeviceInfo {
    id: string;              // Device UUID
    userId: string;          // Owner's UUID
    name?: string;           // User-given name
    type: 'browser' | 'mobile' | 'desktop';
    browser: {
        name: string;        // Chrome, Firefox, etc.
        version: string;
        userAgent: string;
    };
    os: {
        name: string;        // Windows, MacOS, etc.
        version: string;
        platform: string;
    };
    metadata: {
        firstSeen: number;
        lastSeen: number;
        syncCount: number;
        status: 'active' | 'inactive' | 'blocked';
    };
}
```

## Sync Related Structures

### Sync Operation
```typescript
interface SyncOperation {
    id: string;              // Operation UUID
    type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';
    entityType: 'BOOKMARK' | 'FOLDER';
    entityId: string;
    userId: string;
    deviceId: string;
    timestamp: number;
    data: any;              // Operation-specific data
    vectorClock: {
        [deviceId: string]: number;
    };
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CONFLICT';
}
```

### Sync State
```typescript
interface SyncState {
    userId: string;
    deviceId: string;
    lastSync: number;
    vectorClock: {
        [deviceId: string]: number;
    };
    pendingOperations: number;
    status: 'IDLE' | 'SYNCING' | 'ERROR';
    metadata: {
        lastSuccess: number;
        failureCount: number;
        lastError?: string;
    };
}
```

### Conflict Record
```typescript
interface ConflictRecord {
    id: string;
    entityId: string;
    entityType: 'BOOKMARK' | 'FOLDER';
    operations: SyncOperation[];
    resolution?: {
        type: 'AUTO' | 'MANUAL';
        winner: string;      // Operation ID
        timestamp: number;
        deviceId: string;
    };
    status: 'PENDING' | 'RESOLVED';
    created: number;
}
```

## Storage Structures

### Local Storage Schema
```typescript
interface LocalStorage {
    bookmarks: Map<string, Bookmark>;
    folders: Map<string, Folder>;
    syncState: SyncState;
    metadata: {
        lastUpdate: number;
        version: number;
        deviceId: string;
    };
    queue: {
        operations: SyncOperation[];
        lastProcessed: number;
    };
}
```

### Cache Structure
```typescript
interface CacheStructure {
    bookmarks: {
        [id: string]: {
            data: Bookmark;
            expires: number;
        };
    };
    folders: {
        [id: string]: {
            data: Folder;
            expires: number;
        };
    };
    searches: {
        [query: string]: {
            results: string[];  // IDs
            expires: number;
        };
    };
}
```

## System Events

### Event Structure
```typescript
interface SystemEvent {
    id: string;
    type: 'SYNC' | 'AUTH' | 'ERROR' | 'USER_ACTION';
    subtype: string;
    userId: string;
    deviceId: string;
    timestamp: number;
    data: any;
    metadata: {
        severity: 'INFO' | 'WARNING' | 'ERROR';
        requires_action: boolean;
    };
}
```

### Notification Structure
```typescript
interface UserNotification {
    id: string;
    userId: string;
    type: 'SYNC' | 'SECURITY' | 'SYSTEM' | 'ACCOUNT';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    title: string;
    message: string;
    action?: {
        type: string;
        url?: string;
        data?: any;
    };
    metadata: {
        created: number;
        expires?: number;
        read?: boolean;
        dismissed?: boolean;
    };
}
```

## Validation Rules
```typescript
const ValidationRules = {
    bookmark: {
        url: {
            required: true,
            maxLength: 2048,
            pattern: /^https?:\/\/.+/
        },
        title: {
            required: true,
            maxLength: 255,
            minLength: 1
        },
        description: {
            maxLength: 1000
        },
        tags: {
            maxItems: 20,
            itemMaxLength: 50
        }
    },
    folder: {
        name: {
            required: true,
            maxLength: 255,
            minLength: 1
        },
        maxDepth: 10,
        maxChildren: 1000
    }
};
```

These data structures are designed to:
1. Maintain data integrity
2. Support offline operations
3. Handle sync conflicts
4. Provide efficient storage
5. Enable fast retrieval
6. Support versioning
7. Enable effective caching
```