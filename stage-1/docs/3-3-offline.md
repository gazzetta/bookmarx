```markdown
# BookMarx Offline Support

## Offline Queue System

### Queue Configuration
```typescript
interface OfflineQueueConfig {
    queueSettings: {
        maxQueueSize: 10000;
        maxBatchSize: 50;
        maxRetries: 3;
        retryDelays: [1000, 5000, 15000];  // Increasing delays in ms
        priorityLevels: {
            HIGH: 3,    // User-initiated actions
            MEDIUM: 2,  // Auto-sync operations
            LOW: 1      // Background tasks
        };
    };

    storage: {
        queueKey: 'offline_queue';
        metadataKey: 'queue_metadata';
        persistenceStrategy: 'IndexedDB';
    };

    processing: {
        batchTimeout: 1000;      // Time to wait for more operations
        processingTimeout: 30000; // Max time for processing batch
        minBatchSize: 5;         // Minimum operations to process
    };
}
```

### Queue Management
```typescript
class OfflineQueue {
    private readonly DB_NAME = 'bookmarx_offline';
    private readonly STORE_NAME = 'operations';
    private db: IDBDatabase | null = null;
    private isProcessing: boolean = false;

    private async initializeDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const store = db.createObjectStore(this.STORE_NAME, { 
                    keyPath: 'id' 
                });
                
                // Indexes for efficient querying
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('priority', 'priority', { unique: false });
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
        });
    }

    public async enqueue(operation: QueuedOperation): Promise<string> {
        if (!this.db) await this.initializeDB();

        const queuedOp: QueuedOperation = {
            ...operation,
            id: generateUUID(),
            timestamp: Date.now(),
            retries: 0,
            status: 'PENDING'
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(
                [this.STORE_NAME], 
                'readwrite'
            );
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.add(queuedOp);

            request.onsuccess = () => resolve(queuedOp.id);
            request.onerror = () => reject(request.error);
        });
    }
}
```

### Operation Processing
```typescript
interface OfflineProcessor {
    processQueue: async () => {
        if (this.isProcessing || !navigator.onLine) return;

        try {
            this.isProcessing = true;
            await this.processBatch();
        } finally {
            this.isProcessing = false;
        }
    };

    processBatch: async () => {
        const batch = await this.getNextBatch();
        
        for (const operation of batch) {
            try {
                await this.processOperation(operation);
                await this.markAsComplete(operation.id);
            } catch (error) {
                await this.handleProcessingError(operation, error);
            }
        }

        const pending = await this.getPendingCount();
        if (pending > 0) {
            await this.processQueue();
        }
    };

    handleProcessingError: async (
        operation: QueuedOperation, 
        error: Error
    ) => {
        if (operation.retries < this.config.maxRetries) {
            const backoffDelay = this.calculateBackoff(operation.retries);
            
            await this.updateOperation(operation.id, {
                status: 'RETRY',
                retries: operation.retries + 1,
                error: error.message,
                nextAttempt: Date.now() + backoffDelay
            });
        } else {
            await this.markAsFailed(operation.id, error);
        }
    };
}
```

## Network Status Management
```typescript
class NetworkManager {
    private status: 'online' | 'offline' = 'online';
    private listeners: Set<(status: 'online' | 'offline') => void>;

    constructor() {
        this.listeners = new Set();
        this.initializeNetworkListeners();
    }

    private initializeNetworkListeners(): void {
        window.addEventListener('online', () => this.updateStatus('online'));
        window.addEventListener('offline', () => this.updateStatus('offline'));
        
        // Additional connectivity check
        setInterval(() => this.checkConnectivity(), 30000);
    }

    private async checkConnectivity(): Promise<void> {
        try {
            const response = await fetch('/api/health', {
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            this.updateStatus(response.ok ? 'online' : 'offline');
        } catch {
            this.updateStatus('offline');
        }
    }

    private updateStatus(newStatus: 'online' | 'offline'): void {
        if (this.status !== newStatus) {
            this.status = newStatus;
            this.notifyListeners();

            if (newStatus === 'online') {
                this.handleReconnection();
            }
        }
    }

    private async handleReconnection(): Promise<void> {
        try {
            await this.processOfflineQueue();
            await this.syncState();
        } catch (error) {
            console.error('Reconnection handling failed:', error);
        }
    }
}
```

## Offline State Management
```typescript
interface OfflineState {
    pendingChanges: {
        bookmarks: Map<string, BookmarkChange>;
        folders: Map<string, FolderChange>;
    };

    lastKnownState: {
        timestamp: number;
        vectorClock: VectorClock;
        syncStatus: 'SYNCED' | 'PENDING' | 'CONFLICT';
    };

    operations: {
        tracking: Map<string, OperationStatus>;
        queue: PriorityQueue<Operation>;
        failed: Set<string>;
    };
}

class OfflineStateManager {
    private state: OfflineState;

    public async trackChange(change: Change): Promise<void> {
        const entityType = change.type === 'BOOKMARK' ? 'bookmarks' : 'folders';
        this.state.pendingChanges[entityType].set(change.id, change);
        await this.persistState();
    }

    public async resolveChange(changeId: string): Promise<void> {
        for (const changeMap of Object.values(this.state.pendingChanges)) {
            if (changeMap.delete(changeId)) {
                await this.persistState();
                break;
            }
        }
    }

    private async persistState(): Promise<void> {
        await chrome.storage.local.set({
            'offline_state': this.serializeState()
        });
    }

    private async loadState(): Promise<void> {
        const stored = await chrome.storage.local.get('offline_state');
        if (stored.offline_state) {
            this.state = this.deserializeState(stored.offline_state);
        }
    }
}
```

## Recovery Mechanisms
```typescript
interface RecoverySystem {
    validateOfflineChanges: async () => {
        const changes = await this.getAllPendingChanges();
        const validChanges = await this.validateChanges(changes);
        
        if (validChanges.length !== changes.length) {
            await this.handleInvalidChanges(
                changes.filter(c => !validChanges.includes(c))
            );
        }

        return validChanges;
    };

    reconcileState: async () => {
        const localState = await this.getLocalState();
        const serverState = await this.fetchServerState();
        
        const diff = this.compareStates(localState, serverState);
        if (diff.hasDifferences) {
            await this.resolveStateDifferences(diff);
        }
    };

    handleReconnection: async () => {
        try {
            const validChanges = await this.validateOfflineChanges();
            await this.reconcileState();
            await this.processValidChanges(validChanges);
        } catch (error) {
            await this.handleRecoveryError(error);
        }
    };
}
```

## Conflict Detection
```typescript
interface OfflineConflictDetector {
    detectConflicts: (
        localChanges: Change[], 
        serverChanges: Change[]
    ) => {
        const conflicts: Conflict[] = [];
        const changeMap = new Map(
            serverChanges.map(c => [c.entityId, c])
        );

        for (const localChange of localChanges) {
            const serverChange = changeMap.get(localChange.entityId);
            if (serverChange && this.isConflicting(localChange, serverChange)) {
                conflicts.push({
                    entityId: localChange.entityId,
                    local: localChange,
                    server: serverChange
                });
            }
        }

        return conflicts;
    };

    resolveConflicts: async (conflicts: Conflict[]) => {
        for (const conflict of conflicts) {
            const resolution = await this.determineResolution(conflict);
            await this.applyResolution(resolution);
        }
    };
}
```

This offline support system provides:
1. Reliable operation queuing
2. Network status monitoring
3. State persistence
4. Conflict handling
5. Recovery mechanisms
6. Change validation
7. Error management
```