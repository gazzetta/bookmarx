import { BookmarkManager } from './BookmarkManager';
import { SyncManager } from './SyncManager';
import { StorageManager } from './StorageManager';

class BackgroundService {
    private bookmarkManager: BookmarkManager;
    private syncManager: SyncManager;
    private storageManager: StorageManager;
    private isInitialized: boolean = false;
    private readonly statusCheckAlarmName = 'sync-status-check';
    private readonly statusCheckIntervalMinutes = 5;

    constructor() {
        this.initializeServices();
        this.setupEventListeners();
    }

    private async initializeServices(): Promise<void> {
        if (this.isInitialized) return;

        try {
            this.storageManager = new StorageManager();
            this.bookmarkManager = new BookmarkManager(this.storageManager);
            this.syncManager = new SyncManager(this.storageManager);

            await this.storageManager.initialize();
            await this.bookmarkManager.initialize();
            await this.syncManager.initialize();
            await this.setupNotificationSchedule();

            this.isInitialized = true;
            console.log('BookMarx background service initialized');
        } catch (error) {
            console.error('Failed to initialize background service:', error);
        }
    }

    private setupEventListeners(): void {
        // Existing listeners
        chrome.runtime.onInstalled.addListener(this.handleInstall.bind(this));
        chrome.runtime.onStartup.addListener(this.handleStartup.bind(this));
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === this.statusCheckAlarmName) {
                void this.checkSyncStatusAndNotify();
            }
        });
    
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'getAuthState') {
                // Use callback style for Firefox MV2 compatibility
                chrome.storage.local.get('auth', (storage) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting auth state:', chrome.runtime.lastError);
                        sendResponse({ auth: null });
                        return;
                    }
                    console.log('getAuthState handler - storage result:', storage);
                    sendResponse({ auth: storage.auth || null });
                });
                return true; // Keep the message channel open for async response
            }

            if (message.action === 'debugStorage') {
                (async () => {
                    try {
                        await this.storageManager.debugCurrentState();
                        const storageData = await this.storageManager.getData();
                        sendResponse({
                            success: true,
                            data: {
                                userId: storageData?.userId,
                                deviceId: storageData?.deviceId,
                                browserInstanceId: storageData?.browserInstanceId,
                                lastSync: storageData?.lastSync,
                                settings: storageData?.settings,
                                pendingChanges: storageData?.changes?.length || 0,
                                changes: storageData?.changes || []
                            }
                        });
                    } catch (error) {
                        console.error('Debug Storage Error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                })();
                return true; // Keep the message channel open for async response
            }

            if (message.action === 'testNotification') {
                (async () => {
                    try {
                        const notified = await this.showNotification(
                            'bookmarx-test',
                            'BookMarx: Test notification',
                            'If you can read this, notifications are working.'
                        );
                        sendResponse({ success: notified });
                    } catch (error) {
                        console.error('Test Notification Error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                })();
                return true;
            }

            if (message.action === 'resetNotificationState') {
                (async () => {
                    try {
                        await this.setNotificationState({ localCount: 0, remoteCount: 0 });
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error('Reset Notification State Error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                })();
                return true;
            }

            if (message.action === 'getAuth') {
                (async () => {
                    try {
                        const auth = await this.storageManager.getAuth();
                        sendResponse({ success: true, data: auth });
                    } catch (error) {
                        console.error('Get Auth Error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                })();
                return true;
            }

            if (message.action === 'setAuth') {
                (async () => {
                    try {
                        await this.storageManager.setAuth(message.data);
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error('Set Auth Error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                })();
                return true;
            }

            if (message.action === 'clearAuth') {
                (async () => {
                    try {
                        await this.storageManager.clearAuth();
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error('Clear Auth Error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                })();
                return true;
            }

            if (message.action === 'clearStorage') {
                (async () => {
                    try {
                        await this.storageManager.clearAllStorage();
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error('Clear Storage Error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                })();
                return true; // Keep the message channel open for async response
            }

            // Existing sync handler
            if (message.action === 'syncNow') {
                console.log('Received sync request from popup');
                this.syncManager.sync()
                    .then(result => {
                        console.log('Sync completed with result:', result);
                        sendResponse({ success: result });
                    })
                    .catch(error => {
                        console.error('Sync error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    });
                return true; // Keep the message channel open for async response
            }
            
            // Get master collection summary
            if (message.action === 'getMasterCollectionSummary') {
                console.log('Received request for master collection summary');
                this.syncManager.getMasterCollectionSummary()
                    .then(result => {
                        console.log('Got master collection summary:', result);
                        sendResponse(result);
                    })
                    .catch(error => {
                        console.error('Error getting master collection summary:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    });
                return true; // Keep the message channel open for async response
            }
            
            // Overwrite from master collection
            if (message.action === 'overwriteFromMaster') {
                console.log('Received request to overwrite from master collection');
                this.syncManager.overwriteFromMaster()
                    .then(result => {
                        console.log('Overwrite completed with result:', result);
                        sendResponse(result);
                    })
                    .catch(error => {
                        console.error('Overwrite error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    });
                return true; // Keep the message channel open for async response
            }

            // Merge local bookmarks into master collection
            if (message.action === 'mergeIntoMaster') {
                console.log('Received request to merge local bookmarks into master');
                this.syncManager.mergeIntoMaster()
                    .then(result => {
                        console.log('Merge completed with result:', result);
                        sendResponse(result);
                    })
                    .catch(error => {
                        console.error('Merge error:', error);
                        sendResponse({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    });
                return true; // Keep the message channel open for async response
            }
    
            // Sync status handler
            if (message.action === 'getSyncStatus') {
                (async () => {
                    try {
                        // First check local storage
                        const storageData = await this.storageManager.getData();
                        const hasInitialSync = storageData?.lastSync != null && storageData.lastSync > 0;
                        const authToken = await this.storageManager.getAuthToken();

                        if (!authToken) {
                            sendResponse({
                                success: false,
                                error: {
                                    message: 'Not authenticated'
                                }
                            });
                            return;
                        }

                        const localChanges = await this.storageManager.getQueuedChanges();
                        const local = {
                            adds: localChanges.filter(c => c.type === 'CREATE').length,
                            updates: localChanges.filter(c => c.type === 'UPDATE').length,
                            moves: localChanges.filter(c => c.type === 'MOVE').length,
                            deletes: localChanges.filter(c => c.type === 'DELETE').length
                        };

                        let serverStatus: any | null = null;
                        try {
                            const browserInstanceId = await this.storageManager.getBrowserInstanceId();
                            serverStatus = await this.getServerSyncStatus(authToken, browserInstanceId);
                        } catch (error) {
                            if (!hasInitialSync) {
                                throw error;
                            }
                        }

                        const needsInitialSync = serverStatus?.data?.needsInitialSync ?? false;
                        const remote = serverStatus?.data?.pendingChanges || {
                            adds: 0,
                            updates: 0,
                            moves: 0,
                            deletes: 0
                        };

                        const localCount = local.adds + local.updates + local.moves + local.deletes;
                        const remoteCount = remote.adds + remote.updates + remote.moves + remote.deletes;
                        await this.maybeNotifySyncStatus(localCount, remoteCount);

                        sendResponse({
                            success: true,
                            data: {
                                isInitialSync: needsInitialSync,
                                local,
                                remote
                            }
                        });
                    } catch (error) {
                        console.error('Error getting sync status:', error);
                        sendResponse({
                            success: false,
                            error: {
                                message: 'Failed to get sync status',
                                details: error instanceof Error ? error.message : String(error)
                            }
                        });
                    }
                })();
                return true; // Keep the message channel open for async response
            }
        });
    }

    private async setupNotificationSchedule(): Promise<void> {
        chrome.alarms.create(this.statusCheckAlarmName, {
            periodInMinutes: this.statusCheckIntervalMinutes
        });
        await this.checkSyncStatusAndNotify();
    }

    private async checkSyncStatusAndNotify(): Promise<void> {
        try {
            console.log('[Notifications] Checking sync status...');
            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                return;
            }

            const browserInstanceId = await this.storageManager.getBrowserInstanceId();
            if (!browserInstanceId) {
                return;
            }

            const localCount = await this.storageManager.getQueuedChangesCount();
            const serverStatus = await this.getServerSyncStatus(authToken, browserInstanceId);
            const needsInitialSync = serverStatus?.data?.needsInitialSync ?? false;
            if (needsInitialSync) {
                console.log('[Notifications] Initial sync required; skipping remote check.');
                await this.maybeNotifySyncStatus(localCount, 0);
                return;
            }

            const remote = serverStatus?.data?.pendingChanges || {
                adds: 0,
                updates: 0,
                moves: 0,
                deletes: 0
            };
            const remoteCount = remote.adds + remote.updates + remote.moves + remote.deletes;
            console.log('[Notifications] Counts', { localCount, remoteCount });
            await this.maybeNotifySyncStatus(localCount, remoteCount);
        } catch (error) {
            console.error('Error checking sync status for notifications:', error);
        }
    }

    private async getServerSyncStatus(authToken: string, browserInstanceId: string): Promise<any> {
        const response = await fetch('http://localhost:3005/api/v1/sync/status', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'X-Browser-Instance-ID': browserInstanceId
            }
        });

        // Handle 401 - user not found or invalid token
        if (response.status === 401) {
            const data = await response.json().catch(() => ({}));
            const code = data?.error?.code;
            
            // If user not found in database, clear local auth
            if (code === 'USER_NOT_FOUND') {
                console.warn('[Background] User not found in database, clearing local auth');
                await this.storageManager.clearAuth();
            }
            
            throw new Error(data?.error?.message || 'Authentication failed');
        }

        if (!response.ok) {
            throw new Error('Failed to get sync status');
        }

        const serverStatus = await response.json();
        console.log('Server status:', serverStatus);
        return serverStatus;
    }

    private async maybeNotifySyncStatus(localCount: number, remoteCount: number): Promise<void> {
        const state = await this.getNotificationState();
        const shouldNotifyLocal = localCount > 0 && state.localCount === 0;
        const shouldNotifyRemote = remoteCount > 0 && state.remoteCount === 0;
        console.log('[Notifications] State', { state, localCount, remoteCount, shouldNotifyLocal, shouldNotifyRemote });
        const nextState = {
            localCount: localCount === 0 ? 0 : state.localCount,
            remoteCount: remoteCount === 0 ? 0 : state.remoteCount
        };

        if (shouldNotifyLocal) {
            const message = localCount === 1
                ? 'You have 1 local change ready to sync.'
                : `You have ${localCount} local changes ready to sync.`;
            const notified = await this.showNotification('bookmarx-local-pending', 'BookMarx: Sync needed', message);
            if (notified) {
                nextState.localCount = localCount;
            }
        } else if (localCount > 0) {
            console.log('[Notifications] Local pending already notified; skipping.');
        }

        if (shouldNotifyRemote) {
            const message = remoteCount === 1
                ? '1 change is available from your master collection.'
                : `${remoteCount} changes are available from your master collection.`;
            const notified = await this.showNotification('bookmarx-remote-pending', 'BookMarx: Updates available', message);
            if (notified) {
                nextState.remoteCount = remoteCount;
            }
        } else if (remoteCount > 0) {
            console.log('[Notifications] Remote pending already notified; skipping.');
        }

        if (state.localCount !== nextState.localCount || state.remoteCount !== nextState.remoteCount) {
            await this.setNotificationState(nextState);
        }
    }

    private async getNotificationState(): Promise<{ localCount: number; remoteCount: number }> {
        return new Promise((resolve) => {
            chrome.storage.local.get('notificationState', (data) => {
                const state = data.notificationState || {};
                resolve({
                    localCount: typeof state.localCount === 'number' ? state.localCount : 0,
                    remoteCount: typeof state.remoteCount === 'number' ? state.remoteCount : 0
                });
            });
        });
    }

    private async setNotificationState(state: { localCount: number; remoteCount: number }): Promise<void> {
        await chrome.storage.local.set({ notificationState: state });
    }

    private async getNotificationPermissionLevel(): Promise<'granted' | 'denied' | 'default'> {
        return new Promise((resolve) => {
            // Firefox doesn't support getPermissionLevel - assume granted if notifications API exists
            if (typeof chrome.notifications.getPermissionLevel !== 'function') {
                resolve('granted');
                return;
            }
            chrome.notifications.getPermissionLevel((level) => resolve(level as 'granted' | 'denied' | 'default'));
        });
    }

    private async showNotification(id: string, title: string, message: string): Promise<boolean> {
        const permission = await this.getNotificationPermissionLevel();
        console.log('[Notifications] Permission', { id, permission, title });
        if (permission === 'denied') {
            console.warn('[Notifications] Permission denied; notification not shown.');
            return false;
        }
        const iconUrl = chrome.runtime.getURL('assets/notification.png');

        const options: chrome.notifications.NotificationOptions<true> = {
            type: 'basic',
            iconUrl,
            title,
            message,
            priority: 0
        };

        return new Promise((resolve) => {
            chrome.notifications.create(id, options, () => {
                if (chrome.runtime.lastError) {
                    console.warn('Notification error:', chrome.runtime.lastError.message);
                    resolve(false);
                    return;
                }
                resolve(true);
            });
        });
    }

    private async handleInstall(details: chrome.runtime.InstalledDetails): Promise<void> {
        if (details.reason === 'install') {
            // Handle first installation
            await this.handleFirstInstall();
        } else if (details.reason === 'update') {
            // Handle extension update
            await this.handleUpdate(details.previousVersion);
        }
    }

    private async handleFirstInstall(): Promise<void> {
        // Initialize extension data and settings
        await this.storageManager.setDefaults();
        
        // For now, just log that installation is complete
        console.log('BookMarx installed successfully');
    }

    private async handleUpdate(previousVersion: string | undefined): Promise<void> {
        // Handle any necessary data migrations
        console.log(`Updated from version ${previousVersion}`);
    }

    private async handleStartup(): Promise<void> {
        // Perform startup tasks
        await this.syncManager.initialize(); // Changed from scheduleSync to initialize
    }
}

// Initialize the background service
const backgroundService = new BackgroundService();

// Export for testing purposes
export default backgroundService;
