```markdown
# BookMarx Extension Core

## Extension Components Overview
```typescript
interface ExtensionArchitecture {
    manifest: {
        version: "3";
        permissions: [
            "bookmarks",
            "storage",
            "identity",
            "alarms"
        ];
        host_permissions: [
            "https://*.bookmarx.com/*"
        ];
    };

    components: {
        background: {
            type: "service_worker";
            persistent: true;
        };
        popup: {
            html: "popup.html";
            js: "popup.js";
        };
        options: {
            html: "options.html";
            js: "options.js";
        };
    };
}
```

## Background Service Core
```typescript
class BackgroundService {
    private state: {
        isRunning: boolean;
        lastSync: number;
        syncInterval: number;
        retryCount: number;
        authToken: string | null;
        deviceId: string;
        syncQueue: Queue<SyncOperation>;
        connectionStatus: 'online' | 'offline';
    };

    private handlers: {
        onBookmarkCreated: chrome.bookmarks.BookmarkCreateCallback;
        onBookmarkUpdated: chrome.bookmarks.BookmarkChangeCallback;
        onBookmarkMoved: chrome.bookmarks.BookmarkMoveCallback;
        onBookmarkRemoved: chrome.bookmarks.BookmarkRemoveCallback;
        onFolderCreated: chrome.bookmarks.BookmarkCreateCallback;
        onFolderMoved: chrome.bookmarks.BookmarkMoveCallback;
        onFolderRemoved: chrome.bookmarks.BookmarkRemoveCallback;
    };

    constructor() {
        this.initializeState();
        this.registerEventHandlers();
        this.startHeartbeat();
    }

    private async initializeState(): Promise<void> {
        const stored = await chrome.storage.local.get([
            'lastSync',
            'syncInterval',
            'deviceId',
            'authToken'
        ]);

        this.state = {
            isRunning: false,
            lastSync: stored.lastSync || 0,
            syncInterval: stored.syncInterval || 3600000, // 1 hour default
            retryCount: 0,
            authToken: stored.authToken || null,
            deviceId: stored.deviceId || this.generateDeviceId(),
            syncQueue: new Queue(),
            connectionStatus: navigator.onLine ? 'online' : 'offline'
        };
    }
}
```

## Event Management
```typescript
interface EventManager {
    listeners: {
        bookmark: {
            onCreate: (bookmark: chrome.bookmarks.BookmarkTreeNode) => void;
            onUpdate: (id: string, changes: chrome.bookmarks.BookmarkChangeInfo) => void;
            onMove: (id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) => void;
            onRemove: (id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => void;
        };
        sync: {
            onStart: () => void;
            onComplete: () => void;
            onError: (error: Error) => void;
        };
        auth: {
            onLogin: () => void;
            onLogout: () => void;
            onTokenRefresh: () => void;
        };
    };

    notification: {
        types: {
            SYNC_COMPLETE: 'Sync completed successfully';
            SYNC_ERROR: 'Sync failed';
            AUTH_REQUIRED: 'Authentication required';
            CONFLICT_DETECTED: 'Bookmark conflict detected';
        };
        actions: {
            RETRY: 'Retry operation';
            LOGIN: 'Log in';
            RESOLVE: 'Resolve conflict';
            DISMISS: 'Dismiss';
        };
    };
}
```

## State Management
```typescript
interface StateManager {
    storage: {
        local: {
            bookmarks: Map<string, Bookmark>;
            folders: Map<string, Folder>;
            syncState: SyncState;
            deviceInfo: DeviceInfo;
        };
        sync: {
            preferences: UserPreferences;
            settings: ExtensionSettings;
        };
        session: {
            authToken: string;
            tempData: Map<string, any>;
        };
    };

    operations: {
        save: <T>(key: string, data: T) => Promise<void>;
        load: <T>(key: string) => Promise<T>;
        remove: (key: string) => Promise<void>;
        clear: () => Promise<void>;
    };
}
```

## Message Passing
```typescript
interface MessageSystem {
    channels: {
        POPUP_TO_BACKGROUND: 'popup-to-background';
        BACKGROUND_TO_POPUP: 'background-to-popup';
        OPTIONS_TO_BACKGROUND: 'options-to-background';
        BACKGROUND_TO_OPTIONS: 'background-to-options';
    };

    messageTypes: {
        SYNC_REQUEST: 'sync-request';
        SYNC_RESPONSE: 'sync-response';
        STATE_UPDATE: 'state-update';
        AUTH_REQUEST: 'auth-request';
        ERROR_NOTIFICATION: 'error-notification';
    };

    handlers: {
        handleSyncRequest: (message: any) => Promise<void>;
        handleAuthRequest: (message: any) => Promise<void>;
        handleStateUpdate: (message: any) => Promise<void>;
    };
}
```

## API Integration
```typescript
interface APIIntegration {
    endpoints: {
        sync: '/api/v1/sync';
        auth: '/api/v1/auth';
        bookmarks: '/api/v1/bookmarks';
    };

    interceptors: {
        request: [
            'addAuthHeader',
            'addDeviceInfo',
            'validateRequest'
        ];
        response: [
            'handleErrors',
            'refreshToken',
            'cacheResponse'
        ];
    };

    retry: {
        maxAttempts: 3;
        backoffMs: 1000;
        timeout: 30000;
    };
}
```

## Browser Integration
```typescript
interface BrowserIntegration {
    bookmarkAPI: {
        create: (bookmark: Bookmark) => Promise<string>;
        update: (id: string, changes: any) => Promise<void>;
        move: (id: string, destination: any) => Promise<void>;
        remove: (id: string) => Promise<void>;
        getTree: () => Promise<chrome.bookmarks.BookmarkTreeNode[]>;
    };

    storageAPI: {
        local: chrome.storage.LocalStorage;
        sync: chrome.storage.SyncStorage;
        session: chrome.storage.SessionStorage;
    };

    identityAPI: {
        getAuthToken: () => Promise<string>;
        launchWebAuthFlow: (options: any) => Promise<string>;
        removeCachedAuthToken: (token: string) => Promise<void>;
    };
}
```

## Extension UI Management
```typescript
interface UIManager {
    badges: {
        setBadgeText: (text: string) => void;
        setBadgeBackgroundColor: (color: string) => void;
        setBadgeTitle: (title: string) => void;
    };

    contextMenus: {
        create: (options: chrome.contextMenus.CreateProperties) => void;
        update: (id: string, options: chrome.contextMenus.UpdateProperties) => void;
        remove: (id: string) => void;
    };

    notifications: {
        create: (options: chrome.notifications.NotificationOptions) => void;
        clear: (id: string) => void;
        getAll: () => Promise<string[]>;
    };
}
```

## Error Handling
```typescript
interface ErrorHandler {
    categories: {
        NETWORK: 'Network related errors';
        AUTH: 'Authentication errors';
        SYNC: 'Synchronization errors';
        STORAGE: 'Storage related errors';
        API: 'API related errors';
    };

    strategies: {
        retry: (error: Error) => Promise<void>;
        fallback: (error: Error) => Promise<void>;
        recover: (error: Error) => Promise<void>;
        notify: (error: Error) => Promise<void>;
    };

    reporting: {
        logError: (error: Error) => void;
        sendToServer: (error: Error) => Promise<void>;
        notifyUser: (error: Error) => void;
    };
}
```

This core provides:
1. Background service management
2. Event handling system
3. State management
4. Browser integration
5. UI management
6. Error handling
7. API integration
```