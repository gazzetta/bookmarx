import { StorageManager, MasterIdMap } from './StorageManager';
import { detectBrowser } from './utils/browserDetect';
import { API_BASE_URL, WEBSITE_BASE_URL } from '../config';
import { BookmarkRoots, RootKind, ROOT_LABELS } from './utils/bookmarkRoots';

// Failed pull windows remain unacknowledged until every item has been applied.

interface SyncResponse {
    success: boolean;
    data?: {
        action?: string;
        message?: string;
        processed?: any[];
    };
    changes?: any[];
    error?: string;
    // Set when the server refused with a structured error (e.g. BROWSER_LIMIT_REACHED).
    limitError?: { code: string; message: string; upgradeUrl: string };
    timestamp?: number;
}

interface SyncSummary {
    isInitialSync: boolean;
    local: {
        adds: number;
        updates: number;
        moves: number;
        deletes: number;
    };
    remote?: {
        adds: number;
        updates: number;
        moves: number;
        deletes: number;
    };
}

// Custom error for auth failures that should trigger logout
export class AuthError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
        this.name = 'AuthError';
    }
}

// Custom error for subscription limit exceeded (bookmarks, browsers, etc.)
export class LimitError extends Error {
    constructor(
        message: string,
        public code: string,
        public upgradeUrl: string
    ) {
        super(message);
        this.name = 'LimitError';
    }
}

export class SyncManager {
    private operationChain: Promise<unknown> = Promise.resolve();
    private readonly SYNC_RETRY_DELAY = 5000; // 5 seconds
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private retryCount = 0;
    private readonly API_BASE = `${API_BASE_URL}/api/v1`;
    private readonly API_ENDPOINT = `${this.API_BASE}/sync`;
    private appConfig: any = null;
    private roots?: BookmarkRoots;

    constructor(private storageManager: StorageManager) {
        chrome.alarms?.onAlarm?.addListener((alarm) => {
            if (alarm.name === 'sync') void this.checkForPendingChanges();
        });
    }

    private async getCollectionHeaders(): Promise<Record<string, string>> {
        const collectionId = await this.storageManager.getCollectionId();
        return { 'X-Sync-Version': '2', ...(collectionId ? { 'X-Collection-ID': collectionId } : {}) };
    }

    // Firefox's chrome.bookmarks.* APIs use callbacks, NOT Promises.
    // Calling `await chrome.bookmarks.create(...)` in Firefox returns undefined
    // even though the bookmark IS created (via callback). These wrappers ensure
    // every API call works correctly in both Chrome (Promise-based) and Firefox (callback-based).

    private async getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
        return new Promise((resolve, reject) => {
            try {
                chrome.bookmarks.getTree((tree) => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        console.error('[SyncManager] getTree error:', error.message);
                        reject(new Error(error.message));
                        return;
                    }
                    if (!tree || tree.length === 0) {
                        console.error('[SyncManager] getTree returned empty/undefined');
                        reject(new Error('Bookmark tree is empty or undefined'));
                        return;
                    }
                    console.log('[SyncManager] getTree successful, root has', tree[0]?.children?.length || 0, 'children');
                    resolve(tree);
                });
            } catch (err) {
                console.error('[SyncManager] getTree exception:', err);
                reject(err);
            }
        });
    }

    private async createBookmarkNode(details: { parentId: string; title: string; url?: string; index?: number }): Promise<chrome.bookmarks.BookmarkTreeNode> {
        const eventId = await this.storageManager.expectBookmarkEvent({ type: 'CREATE', parentId: details.parentId, title: details.title, url: details.url });
        try {
        return await new Promise((resolve, reject) => {
            try {
                chrome.bookmarks.create(details, (result) => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message));
                        return;
                    }
                    resolve(result);
                });
            } catch (err) {
                reject(err);
            }
        });
        } catch (error) {
            await this.storageManager.cancelBookmarkEvent(eventId);
            throw error;
        }
    }

    private async createMasterNode(masterId: string, kind: 'folder' | 'bookmark', details: { parentId: string; title: string; url?: string; index?: number }): Promise<chrome.bookmarks.BookmarkTreeNode> {
        const pending = await this.storageManager.getCreateIntent(masterId);
        if (pending) {
            const candidates = (await this.getBookmarkChildren(pending.details.parentId)).filter(node =>
                !pending.beforeIds.includes(node.id) && node.title === pending.details.title && node.url === pending.details.url);
            if (candidates.length > 1) throw new Error('An interrupted create is ambiguous; sync stopped to preserve both bookmarks');
            if (candidates.length === 1) {
                await this.storageManager.finishMasterCreate(masterId, kind, candidates[0].id);
                return candidates[0];
            }
        }
        await this.storageManager.saveCreateIntent(masterId, { details, beforeIds: (await this.getBookmarkChildren(details.parentId)).map(node => node.id) });
        let node: chrome.bookmarks.BookmarkTreeNode;
        try { node = await this.createBookmarkNode(details); }
        catch (error) { await this.storageManager.cancelMasterCreate(masterId); throw error; }
        await this.storageManager.finishMasterCreate(masterId, kind, node.id);
        return node;
    }

    private async getBookmarkChildren(parentId: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
        return new Promise((resolve, reject) => {
            try {
                chrome.bookmarks.getChildren(parentId, (children) => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message));
                        return;
                    }
                    resolve(children || []);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    // Exact-URL match over the local tree. Folders have no URL, so they never match.
    private async findLocalBookmarksByUrl(url: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
        return new Promise((resolve, reject) => {
            chrome.bookmarks.search({ url }, (results) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(new Error(error.message));
                } else {
                    resolve(results.filter(r => r.url === url));
                }
            });
        });
    }

    private async removeBookmarkNode(id: string): Promise<void> {
        const eventId = await this.storageManager.expectBookmarkEvent({ type: 'DELETE', id });
        try {
        return await new Promise((resolve, reject) => {
            try {
                chrome.bookmarks.remove(id, () => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message));
                        return;
                    }
                    resolve();
                });
            } catch (err) {
                reject(err);
            }
        });
        } catch (error) {
            await this.storageManager.cancelBookmarkEvent(eventId);
            throw error;
        }
    }

    private async removeBookmarkTree(id: string): Promise<void> {
        const eventId = await this.storageManager.expectBookmarkEvent({ type: 'DELETE', id });
        try {
        return await new Promise((resolve, reject) => {
            try {
                chrome.bookmarks.removeTree(id, () => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message));
                        return;
                    }
                    resolve();
                });
            } catch (err) {
                reject(err);
            }
        });
        } catch (error) {
            await this.storageManager.cancelBookmarkEvent(eventId);
            throw error;
        }
    }

    private async updateBookmarkNode(id: string, changes: chrome.bookmarks.BookmarkChangesArg): Promise<chrome.bookmarks.BookmarkTreeNode> {
        const eventId = await this.storageManager.expectBookmarkEvent({ type: 'UPDATE', id });
        try {
        return await new Promise((resolve, reject) => {
            try {
                chrome.bookmarks.update(id, changes, (result) => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message));
                        return;
                    }
                    resolve(result);
                });
            } catch (err) {
                reject(err);
            }
        });
        } catch (error) {
            await this.storageManager.cancelBookmarkEvent(eventId);
            throw error;
        }
    }

    private async moveBookmarkNode(id: string, destination: { parentId?: string; index?: number }): Promise<chrome.bookmarks.BookmarkTreeNode> {
        const eventId = await this.storageManager.expectBookmarkEvent({ type: 'MOVE', id });
        try {
        return await new Promise((resolve, reject) => {
            try {
                chrome.bookmarks.move(id, destination, (result) => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message));
                        return;
                    }
                    resolve(result);
                });
            } catch (err) {
                reject(err);
            }
        });
        } catch (error) {
            await this.storageManager.cancelBookmarkEvent(eventId);
            throw error;
        }
    }

    // Check response for auth errors and handle accordingly
    private async handleAuthError(response: Response): Promise<void> {
        if (response.status === 401) {
            const data = await response.json().catch(() => ({}));
            const code = data?.error?.code;

            // If user not found, clear local auth
            if (code === 'USER_NOT_FOUND') {
                console.warn('[SyncManager] User not found in database, clearing local auth');
                await this.storageManager.clearAuth();
                throw new AuthError('Your session has expired. Please log in again.', code);
            }

            throw new AuthError(data?.error?.message || 'Authentication failed');
        }
    }

    public async initialize(): Promise<void> {
        await this.recoverReplacement();
        // Fetch config on init
        await this.fetchAppConfig();

        // We'll only set up the schedule if autoSync gets enabled later
        if (await this.isAutoSyncEnabled()) {
            await this.setupSyncSchedule();
        }
    }

    private async fetchAppConfig(): Promise<void> {
        try {
            const response = await fetch(`${this.API_BASE}/config`);
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.appConfig = result.data;
                }
            }
        } catch {
            console.warn('[SyncManager] Could not reach server for config, using defaults');
            this.appConfig = {
                branding: { premiumTitle: 'Premium' },
                limits: { premium: { bookmarks: 10000, browsers: 100 } }
            };
        }
    }

    private async isAutoSyncEnabled(): Promise<boolean> {
        const data = await this.storageManager.getData();
        return data?.settings?.autoSync || false;
    }

    public sync(): Promise<boolean> {
        return this.withOperationLock(() => this.syncUnlocked());
    }

    private async syncUnlocked(): Promise<boolean> {
        try {
            console.log('Starting sync process in background...');

            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated. Please log in first.');
            }

            // Check sync status first
            const status = await this.getSyncStatus();
            if (!status.success) {
                throw new Error('Failed to get sync status');
            }

            if (status.data.needsInitialSync) {
                console.log('Initial sync needed, performing initial sync...');
                return await this.sendInitialSync();
            }

            // Get all pending changes
            const changes = await this.storageManager.getQueuedChanges();
            console.log('Changes to be synced:', changes);

            // Send changes to server
            const response = await this.sendChangesToServer(changes);
            console.log('Server response:', response);

            if (response.success) {
                await this.rememberServerIdentities(response.data?.processed || []);
                // Clear the synced changes only if we had any
                if (changes.length > 0) {
                    await this.storageManager.removeQueuedChanges(changes);
                    await this.storageManager.updateLastSync();
                }

                // If server sent back changes, apply them
                if (response.changes && response.changes.length > 0) {
                    await this.applyServerChanges(response.changes);
                }

                // The server now knows masterIds for what we pushed. Record them for later pulls.
                await this.refreshMasterIdMap();

                return true;
            } else {
                if (response.limitError) {
                    const { code, message, upgradeUrl } = response.limitError;
                    throw new LimitError(message || response.error || 'Sync blocked by limit', code, upgradeUrl);
                }
                throw new Error(response.error || 'Sync failed');
            }

        } catch (error: any) {
            if (error.name === 'LimitError') {
                console.warn('Sync blocked by limit:', error.message);
            } else {
                console.error('Sync error:', error);
            }
            throw error;
        }
    }

    private async sendChangesToServer(changes: any[]): Promise<SyncResponse> {
        try {
            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }
            const deviceId = await this.storageManager.getDeviceId();
            const browserInstanceId = await this.storageManager.getBrowserInstanceId();
            const userId = await this.storageManager.getUserId();

            // Get device info for metadata
            const browserInfo = await detectBrowser();
            const deviceInfo = {
                browser: browserInfo.browser,
                browserVersion: browserInfo.browserVersion,
                browserInstanceId,
                deviceId,
                os: browserInfo.os,
                osVersion: browserInfo.osVersion
            };

            // Format changes with proper metadata
            const identities = await this.storageManager.getMasterIdMap();
            const masterByLocal = new Map(Object.entries(identities).filter(([, value]) => value.localId).map(([key, value]) => [value.localId!, key]));
            const outgoingChanges = changes.map(change => ({
                operationId: change.operationId,
                type: change.type,
                data: {
                    masterId: change.type === 'CREATE' ? undefined : change.data.masterId || masterByLocal.get(change.data.browserId || change.data.id),
                    masterParentId: change.data.masterParentId ?? masterByLocal.get(change.data.parentId),
                    rootKind: change.data.rootKind,
                    type: change.data.type,
                    id: change.data.id || change.data.browserId,
                    browserId: change.data.browserId || change.data.id,
                    title: change.data.title,
                    url: change.data.url,
                    parentId: change.data.parentId,
                    index: change.data.index,
                    position: change.data.position,
                    dateAdded: change.data.dateAdded
                },
                metadata: {
                    deviceInfo,
                    userAgent: navigator.userAgent,
                    timestamp: Date.now()
                },
                timestamp: Date.now()
            }));

            const formattedChanges = await this.storageManager.freezeOutgoingChanges(outgoingChanges);
            const collectionHeaders = await this.getCollectionHeaders();
            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-Browser-Instance-ID': browserInstanceId,
                    'X-User-ID': userId,
                    ...collectionHeaders
                },
                body: JSON.stringify({
                    changes: formattedChanges,
                    deviceId,
                    metadata: {
                        deviceInfo,
                        userAgent: navigator.userAgent,
                        timestamp: Date.now()
                    }
                })
            });

            if (!response.ok) {
                // Keep the server's error code. Without it the popup can't show the
                // upgrade prompt for BROWSER_LIMIT_REACHED and gets a bare status code.
                const body = await response.json().catch(() => null);
                if (body?.error?.code) {
                    return {
                        success: false,
                        error: body.error.message || `Server returned ${response.status}`,
                        limitError: {
                            code: body.error.code,
                            message: body.error.message || '',
                            upgradeUrl: `${WEBSITE_BASE_URL}/settings/subscription`
                        }
                    };
                }
                throw new Error(`Server returned ${response.status}`);
            }

            const body = await response.json();
            // The server sends structured failures as error objects. sync() needs a message string.
            if (body?.success === false && body?.error && typeof body.error === 'object') {
                return { success: false, error: body.error.message || 'Sync failed' };
            }
            return body;
        } catch (error) {
            console.error('Error sending changes:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    private async sendInitialSync(): Promise<boolean> {
        try {
            console.log('\n=== Starting Initial Sync ===');

            // Ensure we have config
            if (!this.appConfig) {
                await this.fetchAppConfig();
            }

            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }

            // ... (bookmark tree processing and device info logic remains the same) ...

            // Get all bookmarks using safe wrapper
            const queuedAtStart = await this.storageManager.getQueuedChanges();
            const tree = await this.getBookmarkTree();
            const { bookmarks, folders } = this.processBookmarkTree(tree[0]);

            console.log(`Preparing to sync ${bookmarks.length} bookmarks and ${folders.length} folders`);

            // Get device info
            const browserInfo = await detectBrowser();
            const deviceInfo = {
                browser: browserInfo.browser,
                browserVersion: browserInfo.browserVersion,
                browserInstanceId: await this.storageManager.getBrowserInstanceId() || crypto.randomUUID(),
                deviceId: await this.storageManager.getDeviceId(),
                os: browserInfo.os,
                osVersion: browserInfo.osVersion
            };

            // Save the browserInstanceId if it was just generated
            if (!await this.storageManager.getBrowserInstanceId()) {
                await this.storageManager.setBrowserInstanceId(deviceInfo.browserInstanceId);
            }

            console.log('Device Info:', deviceInfo);

            // Prepare sync metadata
            const metadata = {
                deviceInfo,
                userAgent: navigator.userAgent,
                timestamp: Date.now()
            };

            // Send to server
            console.log('\nSending initial sync request to server...');
            const userId = await this.storageManager.getUserId();
            const deviceId = await this.storageManager.getDeviceId();
            const operationId = await this.storageManager.beginSnapshot({ bookmarks, folders, mode: 'initial' });
            const collectionHeaders = await this.getCollectionHeaders();
            const response = await fetch(`${this.API_ENDPOINT}/initial`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId,
                    ...collectionHeaders
                },
                body: JSON.stringify({
                    operationId,
                    bookmarks,
                    folders,
                    userId,
                    deviceId,
                    metadata
                })
            });

            // Parse response - even error responses have JSON body
            const result = await response.json();

            if (!response.ok) {
                // Check if it's a limit error (business logic) vs actual error
                const isLimitError = ['BOOKMARK_LIMIT_REACHED', 'BROWSER_LIMIT_REACHED', 'BROWSER_REGISTRATION_RATE_LIMITED'].includes(result?.error?.code);

                if (isLimitError) {
                    console.warn('Sync blocked by limit:', response.status, result?.error?.message);
                } else {
                    console.error('Server response not OK:', response.status, result);
                }

                // Check for specific error codes and provide user-friendly messages
                const errorCode = result?.error?.code;
                const errorMessage = result?.error?.message;
                const premiumTitle = this.appConfig?.branding?.premiumTitle || 'Premium';
                const premiumBookmarks = this.appConfig?.limits?.premium?.bookmarks || 10000;
                const premiumBrowsers = this.appConfig?.limits?.premium?.browsers || 100;

                if (errorCode === 'BOOKMARK_LIMIT_REACHED') {
                    const limit = result.error.limit || 250;
                    const attemptedToAdd = result.error.attemptedToAdd || bookmarks.length;
                    throw new LimitError(
                        `You have ${attemptedToAdd} bookmarks but the free plan only allows ${limit}. ` +
                        `Please upgrade to ${premiumTitle} for ${premiumBookmarks.toLocaleString()} bookmarks.`,
                        'BOOKMARK_LIMIT_REACHED',
                        result.error.upgradeUrl || `${WEBSITE_BASE_URL}/settings/subscription`
                    );
                }

                if (errorCode === 'BROWSER_LIMIT_REACHED') {
                    const limit = result.error.limit || 2;
                    throw new LimitError(
                        `You've reached your limit of ${limit} browsers. ` +
                        `Please remove a browser or upgrade to ${premiumTitle} for up to ${premiumBrowsers} browsers.`,
                        'BROWSER_LIMIT_REACHED',
                        result.error.upgradeUrl || `${WEBSITE_BASE_URL}/settings/subscription`
                    );
                }

                if (errorCode === 'BROWSER_REGISTRATION_RATE_LIMITED') {
                    throw new LimitError(
                        `You've registered too many browsers recently. Please wait or upgrade to ${premiumTitle}.`,
                        'BROWSER_REGISTRATION_RATE_LIMITED',
                        result.error.upgradeUrl || `${WEBSITE_BASE_URL}/settings/subscription`
                    );
                }

                // Generic error
                throw new Error(errorMessage || 'Failed to send initial sync');
            }

            // ... (rest of success handling) ...

            console.log('\nInitial sync response:', result);

            if (result.success) {
                console.log('Initial sync completed successfully');
                await this.rememberServerIdentities(result.data?.processed || []);
                await this.storageManager.removeQueuedChanges(queuedAtStart);
                await this.storageManager.completeSnapshot();
                await this.storageManager.updateLastSync();
                await this.refreshMasterIdMap();
                return true;
            } else {
                console.error('Initial sync failed:', result.error);
                throw new Error(result.error?.message || 'Initial sync failed');
            }

        } catch (error) {
            console.error('Error during initial sync:', error);
            if (error instanceof Error) {
                console.error('Stack trace:', error.stack);
            }
            throw error;
        }
    }

    public async overwriteRemote(): Promise<{ success: boolean; data?: any; error?: string }> {
        return this.withOperationLock(() => this.overwriteRemoteUnlocked());
    }

    private async overwriteRemoteUnlocked(): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            console.log('\n=== Starting Overwrite Remote ===');

            if (!this.appConfig) {
                await this.fetchAppConfig();
            }

            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }

            const queuedAtStart = await this.storageManager.getQueuedChanges();
            const tree = await this.getBookmarkTree();
            const { bookmarks, folders } = this.processBookmarkTree(tree[0]);

            console.log(`Preparing to overwrite remote with ${bookmarks.length} bookmarks and ${folders.length} folders`);

            const browserInfo = await detectBrowser();
            const deviceInfo = {
                browser: browserInfo.browser,
                browserVersion: browserInfo.browserVersion,
                browserInstanceId: await this.storageManager.getBrowserInstanceId() || crypto.randomUUID(),
                deviceId: await this.storageManager.getDeviceId(),
                os: browserInfo.os,
                osVersion: browserInfo.osVersion
            };

            if (!await this.storageManager.getBrowserInstanceId()) {
                await this.storageManager.setBrowserInstanceId(deviceInfo.browserInstanceId);
            }

            const metadata = {
                deviceInfo,
                userAgent: navigator.userAgent,
                timestamp: Date.now()
            };

            const userId = await this.storageManager.getUserId();
            const deviceId = await this.storageManager.getDeviceId();
            const operationId = await this.storageManager.beginSnapshot({ bookmarks, folders, mode: 'replace' });
            const collectionHeaders = await this.getCollectionHeaders();
            const response = await fetch(`${this.API_ENDPOINT}/initial`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId,
                    ...collectionHeaders
                },
                body: JSON.stringify({
                    operationId,
                    mode: 'replace',
                    bookmarks,
                    folders,
                    userId,
                    deviceId,
                    metadata
                })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('Server response not OK:', response.status, result);
                throw new Error(result?.error?.message || 'Failed to overwrite remote collection');
            }

            if (result.success) {
                console.log('Overwrite remote completed successfully');
                await this.rememberServerIdentities(result.data?.processed || []);
                await this.storageManager.removeQueuedChanges(queuedAtStart);
                await this.storageManager.completeSnapshot();
                await this.storageManager.updateLastSync();
                return { success: true, data: result.data };
            } else {
                throw new Error(result.error?.message || 'Overwrite remote failed');
            }
        } catch (error) {
            console.error('Error during overwrite remote:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    public async mergeIntoMaster(): Promise<{ success: boolean; data?: any; error?: string }> {
        return this.withOperationLock(() => this.mergeIntoMasterUnlocked());
    }

    private async mergeIntoMasterUnlocked(): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            console.log('\n=== Starting Merge Into Master ===');

            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }

            // Get all bookmarks using safe wrapper
            const queuedAtStart = await this.storageManager.getQueuedChanges();
            const tree = await this.getBookmarkTree();
            const { bookmarks, folders } = this.processBookmarkTree(tree[0]);

            console.log(`Preparing to merge ${bookmarks.length} bookmarks and ${folders.length} folders`);

            // Get device info
            const browserInfo = await detectBrowser();
            const deviceInfo = {
                browser: browserInfo.browser,
                browserVersion: browserInfo.browserVersion,
                browserInstanceId: await this.storageManager.getBrowserInstanceId() || crypto.randomUUID(),
                deviceId: await this.storageManager.getDeviceId(),
                os: browserInfo.os,
                osVersion: browserInfo.osVersion
            };

            // Save the browserInstanceId if it was just generated
            if (!await this.storageManager.getBrowserInstanceId()) {
                await this.storageManager.setBrowserInstanceId(deviceInfo.browserInstanceId);
            }

            console.log('Device Info:', deviceInfo);

            // Prepare sync metadata
            const metadata = {
                deviceInfo,
                userAgent: navigator.userAgent,
                timestamp: Date.now()
            };

            console.log('\nSending merge request to server...');
            const userId = await this.storageManager.getUserId();
            const deviceId = await this.storageManager.getDeviceId();
            const operationId = await this.storageManager.beginSnapshot({ bookmarks, folders, mode: 'merge' });
            const collectionHeaders = await this.getCollectionHeaders();
            const response = await fetch(`${this.API_ENDPOINT}/merge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId,
                    ...collectionHeaders
                },
                body: JSON.stringify({
                    operationId,
                    bookmarks,
                    folders,
                    userId,
                    deviceId,
                    metadata
                })
            });

            // Check for auth errors first
            if (response.status === 401) {
                await this.handleAuthError(response);
            }

            if (!response.ok) {
                console.error('Server response not OK:', response.status);
                throw new Error('Failed to merge bookmarks');
            }

            const result = await response.json();
            console.log('\nMerge response:', result);

            if (result.success) {
                console.log('Merge completed successfully');
                await this.rememberServerIdentities(result.data?.processed || []);
                await this.storageManager.removeQueuedChanges(queuedAtStart);
                await this.storageManager.completeSnapshot();
                await this.storageManager.updateLastSync();
                await this.storageManager.removeQueuedChanges(queuedAtStart);
                return {
                    success: true,
                    data: result.data
                };
            } else {
                console.error('Merge failed:', result.error);
                throw new Error(result.error?.message || 'Merge failed');
            }

        } catch (error) {
            console.error('Error during merge:', error);
            if (error instanceof Error) {
                console.error('Stack trace:', error.stack);
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private static readonly ROOT_NODE_IDS = new Set([
        '0',             // Chrome / Chromium / Edge / Brave / Opera
        'root________',  // Firefox
    ]);

    // System root kind by folder title. 1 = bookmarks bar, 2 = other, 3 = mobile.
    private static readonly ROOT_KIND_BY_NAME: Record<string, '1' | '2' | '3'> = {
        'bookmarks bar': '1', 'bookmarks toolbar': '1', 'toolbar': '1',
        'favourites bar': '1', 'favorites bar': '1', 'bookmarks': '1', 'my bookmarks': '1',
        'other bookmarks': '2', 'unfiled bookmarks': '2', 'unsorted bookmarks': '2',
        'other favourites': '2', 'other favorites': '2', 'other': '2', 'bookmarks menu': '2',
        'mobile bookmarks': '3', 'mobile': '3',
    };

    // System root kind by browser folder id. Chrome, Edge and Opera use 1/2/3. Firefox uses named ids.
    private static readonly ROOT_KIND_BY_ID: Record<string, '1' | '2' | '3'> = {
        '1': '1', '2': '2', '3': '3',
        'toolbar_____': '1', 'unfiled_____': '2', 'menu________': '2', 'mobile______': '3',
    };

    private processBookmarkTree(node: chrome.bookmarks.BookmarkTreeNode): { bookmarks: any[], folders: any[] } {
        const bookmarks: any[] = [];
        const folders: any[] = [];
        const nativeRoots = new BookmarkRoots(node);

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
            if (nativeRoots.excludedIds.has(node.id)) return;
            const isRoot = SyncManager.ROOT_NODE_IDS.has(node.id);

            if (!isRoot) {
                if (node.url) {
                    bookmarks.push({
                        id: node.id,
                        browserId: node.id,
                        userId: 'default',
                        title: node.title,
                        url: node.url,
                        parentId: node.parentId,
                        position: node.index || 0,
                        dateAdded: node.dateAdded
                    });
                } else if (node.title !== undefined) {
                    folders.push({
                        id: node.id,
                        browserId: node.id,
                        rootKind: nativeRoots.roles.get(node.id),
                        userId: 'default',
                        title: node.title,
                        parentId: node.parentId,
                        position: node.index || 0,
                        dateAdded: node.dateAdded
                    });
                }
            }

            if (node.children) {
                for (const child of node.children) {
                    processNode(child);
                }
            }
        };

        processNode(node);

        console.log(`[processBookmarkTree] Captured ${bookmarks.length} bookmarks and ${folders.length} folders`);
        const parentCounts = new Map<string, number>();
        for (const b of bookmarks) {
            parentCounts.set(b.parentId, (parentCounts.get(b.parentId) || 0) + 1);
        }
        for (const [parentId, count] of parentCounts) {
            console.log(`  parentId="${parentId}": ${count} bookmarks`);
        }

        return { bookmarks, folders };
    }

    private async applyServerChanges(changes: any[]): Promise<void> {
        const wasSuppressed = await this.storageManager.isQueueingSuppressed();
        await this.storageManager.setQueueingSuppressed(true);

        try {
            for (const change of changes) {
                try {
                    switch (change.type) {
                        case 'CREATE':
                            await this.applyCreateChange(change);
                            break;
                        case 'UPDATE':
                            await this.applyUpdateChange(change);
                            break;
                        case 'DELETE':
                            await this.applyDeleteChange(change);
                            break;
                        case 'MOVE':
                            await this.applyMoveChange(change);
                            break;
                    }
                } catch (error) {
                    console.error('Error applying change:', change, error);
                    // Continue with next change even if one fails
                }
            }
        } finally {
            try {
                await this.storageManager.setQueueingSuppressed(wasSuppressed);
            } catch (error) {
                console.error('Failed to restore queueing state after applyServerChanges:', error);
            }
        }
    }

    private async applyCreateChange(change: any): Promise<void> {
        await this.createBookmarkNode({
            parentId: change.data.parentId,
            title: change.data.title,
            url: change.data.url,
            index: change.data.index
        });
    }

    private async applyUpdateChange(change: any): Promise<void> {
        const changes: chrome.bookmarks.BookmarkChangesArg = {};
        if (change.data.changes.title) changes.title = change.data.changes.title;
        if (change.data.changes.url) changes.url = change.data.changes.url;

        await this.updateBookmarkNode(change.data.id, changes);
    }

    private async applyDeleteChange(change: any): Promise<void> {
        await this.removeBookmarkNode(change.data.id);
    }

    private async applyMoveChange(change: any): Promise<void> {
        await this.moveBookmarkNode(change.data.id, {
            parentId: change.data.moveInfo.parentId,
            index: change.data.moveInfo.index
        });
    }

    private async checkForPendingChanges(): Promise<void> {
        const changes = await this.storageManager.getQueuedChanges();
        if (changes.length > 0) {
            await this.sync();
        }
    }

    private async setupSyncSchedule(): Promise<void> {
        // Get sync interval from storage
        const data = await this.storageManager.getData();
        const interval = data?.settings?.syncInterval || 300000; // 5 minutes default

        // Set up alarm for periodic sync
        chrome.alarms.create('sync', {
            periodInMinutes: interval / (60 * 1000)
        });

    }

    public async getSyncSummary(): Promise<SyncSummary> {
        const authToken = await this.storageManager.getAuthToken();
        if (!authToken) {
            throw new Error('Not authenticated');
        }
        const changes = await this.storageManager.getQueuedChanges();

        // Check if this is initial sync
        try {
            const status = await this.getSyncStatus();
            const isInitialSync = status.data.needsInitialSync;

            // Count local changes by type
            const local = {
                adds: changes.filter(c => c.type === 'CREATE').length,
                updates: changes.filter(c => c.type === 'UPDATE').length,
                moves: changes.filter(c => c.type === 'MOVE').length,
                deletes: changes.filter(c => c.type === 'DELETE').length
            };

            if (isInitialSync) {
                const tree = await this.getBookmarkTree();
                const { bookmarks, folders } = this.processBookmarkTree(tree[0]);
                return {
                    isInitialSync: true,
                    local: {
                        adds: bookmarks.length + folders.length,
                        updates: 0,
                        moves: 0,
                        deletes: 0
                    }
                };
            }

            // For standard sync, include both local and remote changes
            return {
                isInitialSync: false,
                local,
                remote: status.data.pendingChanges || {
                    adds: 0,
                    updates: 0,
                    moves: 0,
                    deletes: 0
                }
            };
        } catch (error) {
            console.error('Error getting sync summary:', error);
            throw error;
        }
    }

    private async getSyncStatus(): Promise<any> {
        const deviceId = await this.storageManager.getDeviceId();
        const browserInstanceId = await this.storageManager.getBrowserInstanceId();
        const authToken = await this.storageManager.getAuthToken();
        if (!authToken) {
            throw new Error('Not authenticated');
        }

        const collectionHeaders = await this.getCollectionHeaders();
        const response = await fetch(`${this.API_ENDPOINT}/status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'X-Device-ID': deviceId,
                'X-Browser-Instance-ID': browserInstanceId,
                ...collectionHeaders
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get sync status');
        }

        return await response.json();
    }

    public async getMasterCollectionSummary(): Promise<any> {
        try {
            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }
            const deviceId = await this.storageManager.getDeviceId();
            const userId = await this.storageManager.getUserId();

            const collectionHeaders = await this.getCollectionHeaders();
            const response = await fetch(`${this.API_ENDPOINT}/master-summary`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId,
                    ...collectionHeaders
                }
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting collection summary:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    /**
     * Sync down changes from the server to local browser.
     * This fetches pending changes from other browsers and applies them locally.
     * Unlike overwriteFromMaster, this preserves local bookmarks and only applies
     * the delta (new/updated/deleted items from other browsers).
     */
    public async syncDown(): Promise<{ success: boolean; data?: any; error?: string }> {
        return this.withOperationLock(() => this.syncDownUnlocked());
    }

    private async syncDownUnlocked(): Promise<{ success: boolean; data?: any; error?: string }> {
        const wasSuppressed = await this.storageManager.isQueueingSuppressed();
        await this.storageManager.setQueueingSuppressed(true);

        try {
            console.log('\n=== Starting Sync Down (Pull Changes) ===');

            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }

            const browserInstanceId = await this.storageManager.getBrowserInstanceId();
            const deviceId = await this.storageManager.getDeviceId();

            const collectionHeaders = await this.getCollectionHeaders();
            const response = await fetch(`${this.API_ENDPOINT}/pending`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-Browser-Instance-ID': browserInstanceId,
                    // Acknowledged pull: the server moves our watermark only after we POST /pending/ack
                    'X-Sync-Ack': '1',
                    'X-Sync-Version': '2',
                    ...collectionHeaders
                }
            });

            // Check for auth errors
            if (response.status === 401) {
                await this.handleAuthError(response);
            }

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const result = await response.json();
            console.log('Pending changes response:', result);

            if (!result.success) {
                throw new Error(result.error?.message || 'Failed to fetch pending changes');
            }

            if (result.data.needsInitialSync) {
                return {
                    success: false,
                    error: 'Master collection is empty. Please sync up first to populate it.'
                };
            }

            const { changes, summary } = result.data;
            // Ack-mode pulls return the cursor to acknowledge and the window start (for retry counting)
            const cursor: number | undefined = result.data.cursor;
            const since: number | undefined = result.data.since;

            if (summary.total === 0) {
                console.log('No pending changes to apply');
                if (cursor !== undefined) await this.ackPull(cursor, 0);
                return {
                    success: true,
                    data: {
                        message: 'Already up to date',
                        applied: { creates: 0, updates: 0, deletes: 0 }
                    }
                };
            }

            console.log(`Applying ${summary.total} changes:`, summary);

            // Apply changes in order: folders first (creates), then bookmarks (creates),
            // then updates, then deletes (bookmarks first, then folders)
            const applied = {
                creates: { folders: 0, bookmarks: 0 },
                updates: { folders: 0, bookmarks: 0 },
                deletes: { folders: 0, bookmarks: 0 }
            };

            // Build a map of masterId -> local browserId for existing items. Matches come from the
            // master (URL and path). The persisted map is merged in so items the master has already
            // dropped (deleted) can still be found.
            const tree = await this.getBookmarkTree();
            this.roots = new BookmarkRoots(tree[0]);
            const { localFolderMap, localBookmarkMap, masterUrls } = await this.buildLocalIdMaps(tree[0]);
            const nextMap: MasterIdMap = await this.storageManager.getMasterIdMap();
            for (const [masterId, entry] of Object.entries(nextMap)) {
                if (!entry.localId) continue; // tombstone: already deleted here
                if (entry.kind === 'folder' && !localFolderMap.has(masterId)) localFolderMap.set(masterId, entry.localId);
                if (entry.kind === 'bookmark' && !localBookmarkMap.has(masterId)) localBookmarkMap.set(masterId, entry.localId);
            }
            // Count of changes that threw. A nonzero count means the window is not acknowledged and will be retried.
            let failures = 0;

            // 1. Create new folders (parent folders first)
            if (changes.creates.folders.length > 0) {
                const folderIdMap: Record<string, string> = {}; // masterId -> new local id

                // Sort folders by creation time to handle parent-child ordering
                const pending = new Map<string, any>(changes.creates.folders.map((folder: any) => [folder.masterId, folder]));
                const sortedFolders: any[] = [];
                const visiting = new Set<string>();
                const visit = (folder: any) => {
                    if (!pending.has(folder.masterId)) return;
                    if (visiting.has(folder.masterId)) throw new Error('Remote collection contains a folder cycle');
                    visiting.add(folder.masterId);
                    const parent = pending.get(folder.masterParentId);
                    if (parent) visit(parent);
                    visiting.delete(folder.masterId); pending.delete(folder.masterId); sortedFolders.push(folder);
                };
                for (const folder of [...pending.values()].sort((a, b) => (a.position || 0) - (b.position || 0))) visit(folder);

                for (const folder of sortedFolders) {
                    try {
                        // Top-level bookmarks bar / other / mobile: map onto this browser's own root.
                        // Creating a copy here is what produced a second "Bookmarks Bar" folder.
                        const rootKind = this.systemRootKindOfMasterFolder(folder);
                        if (rootKind) {
                            const rootId = await this.existingLocalId(localFolderMap, folder.masterId) || await this.ensureLocalRoot(rootKind, folder.masterId);
                            folderIdMap[folder.masterId] = rootId;
                            localFolderMap.set(folder.masterId, rootId);
                            nextMap[folder.masterId] = { kind: 'folder', localId: rootId };
                            await this.storageManager.setMasterIdMap(nextMap);
                            continue;
                        }

                        // Already here (matched earlier, or re-sent after a failed pull): reuse, don't duplicate
                        const existing = await this.existingLocalId(localFolderMap, folder.masterId);
                        if (existing) {
                            folderIdMap[folder.masterId] = existing;
                            nextMap[folder.masterId] = { kind: 'folder', localId: existing };
                            await this.storageManager.setMasterIdMap(nextMap);
                            await this.applyRemotePlacement(existing, folder, localFolderMap, folderIdMap);
                            await this.updateBookmarkNode(existing, { title: folder.title });
                            continue;
                        }

                        const parentId = await this.resolveParentIdForSync(
                            folder.masterParentId,
                            folder.parentId,
                            localFolderMap,
                            folderIdMap
                        );

                        const newFolder = await this.createMasterNode(folder.masterId, 'folder', {
                            parentId,
                            title: folder.title,
                            index: await this.safeIndex(parentId, folder.position)
                        });

                        folderIdMap[folder.masterId] = newFolder.id;
                        localFolderMap.set(folder.masterId, newFolder.id);
                        nextMap[folder.masterId] = { kind: 'folder', localId: newFolder.id };
                            await this.storageManager.setMasterIdMap(nextMap);
                        applied.creates.folders++;
                        console.log(`Created folder: ${folder.title} (${newFolder.id})`);
                    } catch (error) {
                        failures++;
                        console.error(`Failed to create folder ${folder.title}:`, error);
                    }
                }
            }

            // 2. Create new bookmarks
            if (changes.creates.bookmarks.length > 0) {
                for (const bookmark of [...changes.creates.bookmarks].sort((a, b) => (a.position || 0) - (b.position || 0))) {
                    try {
                        // Already here (re-sent after a failed pull): reuse, don't duplicate
                        const existing = await this.existingLocalId(localBookmarkMap, bookmark.masterId);
                        if (existing) {
                            nextMap[bookmark.masterId] = { kind: 'bookmark', localId: existing };
                            await this.storageManager.setMasterIdMap(nextMap);
                            await this.applyRemotePlacement(existing, bookmark, localFolderMap, {});
                            await this.updateBookmarkNode(existing, { title: bookmark.title, url: bookmark.url });
                            continue;
                        }

                        const parentId = await this.resolveParentIdForSync(
                            bookmark.masterParentId,
                            bookmark.parentId,
                            localFolderMap,
                            {}
                        );

                        const created = await this.createMasterNode(bookmark.masterId, 'bookmark', {
                            parentId,
                            title: bookmark.title,
                            url: bookmark.url,
                            index: await this.safeIndex(parentId, bookmark.position)
                        });

                        localBookmarkMap.set(bookmark.masterId, created.id);
                        nextMap[bookmark.masterId] = { kind: 'bookmark', localId: created.id };
                            await this.storageManager.setMasterIdMap(nextMap);
                        applied.creates.bookmarks++;
                        console.log(`Created bookmark: ${bookmark.title}`);
                    } catch (error) {
                        failures++;
                        console.error(`Failed to create bookmark ${bookmark.title}:`, error);
                    }
                }
            }

            // 3. Apply updates to folders
            if (changes.updates.folders.length > 0) {
                for (const folder of changes.updates.folders) {
                    try {
                        const localId = await this.existingLocalId(localFolderMap, folder.masterId);
                        if (localId && !this.roots?.nativeIds.has(localId)) {
                            await this.updateBookmarkNode(localId, {
                                title: folder.title
                            });
                            await this.applyRemotePlacement(localId, folder, localFolderMap, {});
                            applied.updates.folders++;
                            console.log(`Updated folder: ${folder.title}`);
                        } else if (!localId) {
                            throw new Error(`Folder not found locally for update: ${folder.masterId}`);
                        }
                    } catch (error) {
                        failures++;
                        console.error(`Failed to update folder ${folder.title}:`, error);
                    }
                }
            }

            // 4. Apply updates to bookmarks
            if (changes.updates.bookmarks.length > 0) {
                for (const bookmark of changes.updates.bookmarks) {
                    try {
                        const localId = await this.existingLocalId(localBookmarkMap, bookmark.masterId);
                        if (localId) {
                            await this.updateBookmarkNode(localId, {
                                title: bookmark.title,
                                url: bookmark.url
                            });
                            await this.applyRemotePlacement(localId, bookmark, localFolderMap, {});
                            applied.updates.bookmarks++;
                            console.log(`Updated bookmark: ${bookmark.title}`);
                        } else {
                            throw new Error(`Bookmark not found locally for update: ${bookmark.masterId}`);
                        }
                    } catch (error) {
                        failures++;
                        console.error(`Failed to update bookmark ${bookmark.title}:`, error);
                    }
                }
            }

            // 5. Delete bookmarks (before folders to avoid errors)
            if (changes.deletes.bookmarks.length > 0) {
                for (const bookmark of changes.deletes.bookmarks) {
                    try {
                        if (nextMap[bookmark.masterId]?.localId === null) continue; // already applied
                        const localId = await this.existingLocalId(localBookmarkMap, bookmark.masterId);
                        if (localId) {
                            await this.removeBookmarkNode(localId);
                            applied.deletes.bookmarks++;
                            nextMap[bookmark.masterId] = { kind: 'bookmark', localId: null };
                            await this.storageManager.setMasterIdMap(nextMap);
                            console.log(`Deleted bookmark: ${bookmark.title}`);
                        } else if (!masterUrls) {
                            // Can't tell whether it exists here without the master. Retry, don't drop it.
                            throw new Error(`Cannot resolve delete for ${bookmark.title}: master collection unavailable`);
                        } else {
                            nextMap[bookmark.masterId] = { kind: 'bookmark', localId: null };
                            await this.storageManager.setMasterIdMap(nextMap);
                            console.log(`No local copy to delete for ${bookmark.title}`);
                        }
                    } catch (error) {
                        failures++;
                        console.error(`Failed to delete bookmark ${bookmark.title}:`, error);
                    }
                }
            }

            // 6. Delete folders
            if (changes.deletes.folders.length > 0) {
                for (const folder of changes.deletes.folders) {
                    try {
                        if (nextMap[folder.masterId]?.localId === null) continue; // already applied
                        const localId = await this.existingLocalId(localFolderMap, folder.masterId);
                        if (localId && this.roots?.nativeIds.has(localId)) {
                            // Never remove a browser's own bookmarks bar, other or mobile root
                            console.warn(`Refusing to delete system root for ${folder.title}`);
                        } else if (localId) {
                            await this.removeBookmarkTree(localId);
                            applied.deletes.folders++;
                            nextMap[folder.masterId] = { kind: 'folder', localId: null };
                            await this.storageManager.setMasterIdMap(nextMap);
                            console.log(`Deleted folder: ${folder.title}`);
                        } else if (!masterUrls) {
                            throw new Error(`Cannot resolve delete for folder ${folder.title}: master collection unavailable`);
                        } else {
                            nextMap[folder.masterId] = { kind: 'folder', localId: null };
                            await this.storageManager.setMasterIdMap(nextMap);
                            console.log(`No local folder to delete for ${folder.title}`);
                        }
                    } catch (error) {
                        failures++;
                        console.error(`Failed to delete folder ${folder.title}:`, error);
                    }
                }
            }

            // Keep what was applied even if the ack below fails. Re-sent changes then find their items.
            await this.storageManager.setMasterIdMap(nextMap);

            if (failures > 0) {
                // Don't acknowledge. The server keeps this window, so the next pull sends it again.
                const retry = await this.storageManager.getPullFailure();
                const attempts = retry && since !== undefined && retry.since === since ? retry.attempts + 1 : 1;
                await this.storageManager.setPullFailure({ since: since ?? 0, attempts });
                return { success: false, error: `${failures} change(s) could not be applied. They remain pending; sync will retry them.` };
            }
            await this.storageManager.setPullFailure(null);

            const totalApplied =
                applied.creates.folders + applied.creates.bookmarks +
                applied.updates.folders + applied.updates.bookmarks +
                applied.deletes.folders + applied.deletes.bookmarks;

            if (cursor !== undefined) {
                await this.ackPull(cursor, totalApplied);
            }
            await this.storageManager.updateLastSync();

            console.log(`Sync down complete. Applied ${totalApplied} changes.`);

            return {
                success: true,
                data: {
                    message: `Applied ${totalApplied} changes`,
                    applied,
                    failed: failures,
                    summary
                }
            };

        } catch (error) {
            console.error('Sync down error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        } finally {
            try {
                await this.storageManager.setQueueingSuppressed(wasSuppressed);
            } catch (error) {
                console.error('Failed to restore queueing state after syncDown:', error);
            }
        }
    }

    /**
     * Build maps of masterId -> local browserId for existing bookmarks and folders.
     * This requires that we've previously synced and stored the masterId mapping.
     * For now, we match by URL (bookmarks) and path (folders).
     */
    private async buildLocalIdMaps(rootNode: chrome.bookmarks.BookmarkTreeNode): Promise<{
        localFolderMap: Map<string, string>; localBookmarkMap: Map<string, string>; masterUrls: Set<string> | null;
    }> {
        this.roots = new BookmarkRoots(rootNode);
        const localFolderMap = new Map<string, string>();
        const localBookmarkMap = new Map<string, string>();
        const localNodes = new Map<string, chrome.bookmarks.BookmarkTreeNode>();
        const visit = (node: chrome.bookmarks.BookmarkTreeNode) => {
            localNodes.set(node.id, node);
            for (const child of node.children || []) visit(child);
        };
        visit(rootNode);
        const persisted = await this.storageManager.getMasterIdMap();
        for (const [masterId, entry] of Object.entries(persisted)) {
            if (entry.localId && localNodes.has(entry.localId)) (entry.kind === 'folder' ? localFolderMap : localBookmarkMap).set(masterId, entry.localId);
        }
        const master = await this.fetchMasterCollection();
        if (!master.success) return { localFolderMap, localBookmarkMap, masterUrls: null };
        const instance = await this.storageManager.getBrowserInstanceId();
        for (const item of [...(master.data.folders || []), ...(master.data.bookmarks || [])]) {
            const map = item.url === undefined ? localFolderMap : localBookmarkMap;
            if (map.has(item.masterId)) continue;
            const role = !item.url && BookmarkRoots.masterKind(item);
            const rootId = role && this.roots.byKind.get(role);
            if (rootId) map.set(item.masterId, rootId);
            else if (item.browserInstanceId === instance && localNodes.has(item.browserId)) map.set(item.masterId, item.browserId);
        }
        return { localFolderMap, localBookmarkMap,
            masterUrls: new Set((master.data.bookmarks || []).map((b: any) => this.normalizeUrl(b.url))) };
    }

    private normalizeUrl(url: string): string {
        try {
            const parsed = new URL(url);
            let normalized = parsed.protocol + '//' + parsed.host.toLowerCase();
            let pathname = parsed.pathname;
            if (pathname.length > 1 && pathname.endsWith('/')) {
                pathname = pathname.slice(0, -1);
            }
            normalized += pathname;
            if (parsed.search) {
                const params = new URLSearchParams(parsed.search);
                const entries: [string, string][] = [];
                params.forEach((value, key) => entries.push([key, value]));
                entries.sort((a, b) => a[0].localeCompare(b[0]));
                const sortedParams = new URLSearchParams(entries);
                const searchStr = sortedParams.toString();
                if (searchStr) {
                    normalized += '?' + searchStr;
                }
            }
            if (parsed.hash) {
                normalized += parsed.hash;
            }
            return normalized;
        } catch {
            return url.trim();
        }
    }

    private buildFolderPath(masterId: string, folderMap: Map<string, any>): string {
        const parts: string[] = [];
        let currentId: string | null = masterId;
        const visited = new Set<string>();

        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const folder = folderMap.get(currentId);
            if (!folder) break;

            if (folder.title) {
                parts.unshift(folder.title.toLowerCase());
            }
            currentId = folder.masterParentId;
        }

        return parts.join('/');
    }

    /**
     * Resolve a parent ID for creating a new item during sync down.
     * Tries masterParentId first, falls back to browser parentId mapping.
     */
    private async resolveParentIdForSync(masterParentId: string | null, browserParentId: string | null,
        localFolderMap: Map<string, string>, newFolderIdMap: Record<string, string>): Promise<string> {
        if (masterParentId) {
            const local = newFolderIdMap[masterParentId] || localFolderMap.get(masterParentId);
            if (!local) throw new Error(`Parent folder is not available yet: ${masterParentId}`);
            return local;
        }
        if (!this.roots) this.roots = new BookmarkRoots((await this.getBookmarkTree())[0]);
        const role = browserParentId && BookmarkRoots.sourceKind(browserParentId);
        if (role) return this.ensureLocalRoot(role);
        if (!browserParentId || browserParentId === '0' || browserParentId === 'root________') return this.roots.fallback;
        throw new Error(`Cannot resolve bookmark parent: ${browserParentId}`);
    }

    /**
     * Acknowledge an applied pull. The server moves this browser's watermark to `cursor`.
     * If the ack is lost, the next pull repeats the window. Apply is idempotent, so that's safe.
     */
    private async ackPull(cursor: number, changesApplied: number): Promise<void> {
            const authToken = await this.storageManager.getAuthToken();
            const browserInstanceId = await this.storageManager.getBrowserInstanceId();
            const deviceId = await this.storageManager.getDeviceId();

            const collectionHeaders = await this.getCollectionHeaders();
            const response = await fetch(`${this.API_ENDPOINT}/pending/ack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-Browser-Instance-ID': browserInstanceId,
                    'X-Sync-Version': '2',
                    ...collectionHeaders
                },
                body: JSON.stringify({ cursor, changesApplied })
            });
            if (!response.ok) {
                throw new Error(`Pull acknowledgement failed (${response.status}). Applied changes are saved and will be retried safely.`);
            }
    }

    // Top-level folder that stands for one of the browser's system roots, or null.
    // Matched by title, so it works across browsers: Chrome "Bookmarks bar", Edge "Favourites bar".
    private systemRootKindOfMasterFolder(folder: any): RootKind | null {
        return BookmarkRoots.masterKind(folder) || null;
    }

    private async ensureLocalRoot(kind: RootKind, masterId?: string): Promise<string> {
        if (!this.roots) this.roots = new BookmarkRoots((await this.getBookmarkTree())[0]);
        const existing = this.roots.byKind.get(kind);
        if (existing) return existing;
        const details = { parentId: this.roots.fallback, title: ROOT_LABELS[kind] };
        const created = masterId ? await this.createMasterNode(masterId, 'folder', details) : await this.createBookmarkNode(details);
        this.roots.byKind.set(kind, created.id);
        return created.id;
    }

    private async applyRemotePlacement(id: string, item: any, folders: Map<string, string>, created: Record<string, string>): Promise<void> {
        const parentId = await this.resolveParentIdForSync(item.masterParentId, item.parentId, folders, created);
        await this.moveBookmarkNode(id, { parentId, ...(Number.isInteger(item.position) ? { index: item.position } : {}) });
    }

    private static isSystemRootId(id: string): boolean {
        return id === '1' || id === '2' || id === '3';
    }

    // Local id for a masterId, if that node still exists. Drops stale map entries.
    private async existingLocalId(map: Map<string, string>, masterId: string): Promise<string | undefined> {
        const localId = map.get(masterId);
        if (!localId) return undefined;
        if (await this.localNodeExists(localId)) return localId;
        map.delete(masterId);
        return undefined;
    }

    private async localNodeExists(id: string): Promise<boolean> {
        return new Promise((resolve) => {
            chrome.bookmarks.get(id, (nodes) => {
                const missing = Boolean(chrome.runtime.lastError) || !nodes || nodes.length === 0;
                resolve(!missing);
            });
        });
    }

    private collectNodeIds(node: chrome.bookmarks.BookmarkTreeNode, ids: Set<string>): Set<string> {
        ids.add(node.id);
        for (const child of node.children || []) this.collectNodeIds(child, ids);
        return ids;
    }

    // After a push the server has new masterIds for our items. Re-match from the master and persist,
    // so the next pull recognises them. Entries whose local node is gone are pruned. Tombstones are kept.
    private async refreshMasterIdMap(): Promise<void> {
        try {
            const tree = await this.getBookmarkTree();
            const { localFolderMap, localBookmarkMap } = await this.buildLocalIdMaps(tree[0]);
            const present = this.collectNodeIds(tree[0], new Set<string>());
            const existing = await this.storageManager.getMasterIdMap();

            const next: MasterIdMap = {};
            for (const [masterId, entry] of Object.entries(existing)) {
                if (entry.localId === null || present.has(entry.localId)) next[masterId] = entry;
            }
            for (const [masterId, localId] of localFolderMap) next[masterId] = { kind: 'folder', localId };
            for (const [masterId, localId] of localBookmarkMap) next[masterId] = { kind: 'bookmark', localId };
            await this.storageManager.setMasterIdMap(next);
        } catch (error) {
            console.warn('Could not refresh the masterId map after a push:', error);
        }
    }

    private async rememberServerIdentities(processed: any[]): Promise<void> {
        const map = await this.storageManager.getMasterIdMap();
        for (const item of processed) if (item.success && item.masterId && item.browserId) map[item.masterId] = { kind: item.type, localId: item.browserId };
        await this.storageManager.setMasterIdMap(map);
    }

    public async overwriteFromMaster(): Promise<any> {
        return this.withOperationLock(() => this.overwriteFromMasterUnlocked());
    }

    private async overwriteFromMasterUnlocked(): Promise<any> {
        return this.switchCollectionUnlocked((await this.storageManager.getCollectionId()) || '', await this.storageManager.getCollectionName());
    }

    public async fetchMasterCollectionPublic(): Promise<any> {
        return this.fetchMasterCollection();
    }

    /** Establish a snapshot baseline only when both libraries have no user items. */
    public async baselineEmptyCollection(): Promise<{ success: boolean; data?: { baselined: boolean }; error?: string }> {
        return this.withOperationLock(async () => {
            try {
                if ((await this.storageManager.getQueuedChanges()).length) return { success: true, data: { baselined: false } };
                const tree = (await this.getBookmarkTree())[0];
                const local = this.processBookmarkTree(tree);
                if (local.bookmarks.length || local.folders.some(folder => !folder.rootKind)) {
                    return { success: true, data: { baselined: false } };
                }
                const status = await this.getSyncStatus();
                if (!status.success || status.data?.needsInitialSync ||
                    !Object.values(status.data?.pendingChanges || {}).some(count => typeof count === 'number' && count > 0)) {
                    return { success: true, data: { baselined: false } };
                }
                const snapshot = await this.fetchMasterCollection();
                const data = snapshot.data;
                if (!snapshot.success || !Array.isArray(data?.bookmarks) || data.bookmarks.length ||
                    !Array.isArray(data?.folders) || !Number.isSafeInteger(data.cursor) || data.cursor < 0) {
                    return { success: true, data: { baselined: false } };
                }
                const roots = new BookmarkRoots(tree);
                const map: MasterIdMap = {};
                for (const folder of data.folders) {
                    // A user-created empty folder can have a system-looking name.
                    // Baseline only explicitly canonical roots, never infer this from its title.
                    if (!folder.rootKind || folder.masterParentId) return { success: true, data: { baselined: false } };
                    const role = BookmarkRoots.masterKind(folder);
                    const localId = role && roots.byKind.get(role);
                    if (!localId) return { success: true, data: { baselined: false } };
                    map[folder.masterId] = { kind: 'folder', localId };
                }
                // No native mutation or queue removal. Save root identities before acknowledging
                // exactly this empty snapshot; edits arriving after its cursor remain pending.
                await this.storageManager.setMasterIdMap(map);
                await this.ackPull(data.cursor, 0);
                await this.storageManager.updateLastSync();
                return { success: true, data: { baselined: true } };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });
    }

    /**
     * Switch the browser to a different collection.
     * Clears local bookmarks and restores from the target collection.
     */
    public async switchCollection(newCollectionId: string, newCollectionName: string): Promise<{ success: boolean; error?: string }> {
        return this.withOperationLock(() => this.switchCollectionUnlocked(newCollectionId, newCollectionName));
    }

    private async switchCollectionUnlocked(newCollectionId: string, newCollectionName: string): Promise<{ success: boolean; error?: string }> {
        const wasSuppressed = await this.storageManager.isQueueingSuppressed();
        await this.storageManager.setQueueingSuppressed(true);

        try {
            console.log(`[SwitchCollection] Switching to collection: ${newCollectionName} (${newCollectionId})`);

            const collectionData = await this.fetchMasterCollection(newCollectionId);
            if (!collectionData.success) {
                throw new Error(collectionData.error || 'Failed to fetch collection data');
            }
            const oldData = await this.storageManager.getData();
            const oldTree = await this.getBookmarkTree();
            await this.storageManager.saveReplacementBackup({ data: oldData, tree: oldTree });
            await this.storageManager.setCollection(newCollectionId, newCollectionName);
            await this.clearLocalBookmarks();
            await this.restoreFromMasterCollection(collectionData.data);
            // Retain actual user edits made during replacement; suppress only our expected API events.
            await this.storageManager.removeQueuedChanges(oldData?.changes || []);
            await this.storageManager.saveReplacementBackup(null);
            await this.storageManager.updateLastSync();
            // Once the durable local replacement is complete, a lost acknowledgement must never
            // roll it back: the server might have accepted the acknowledgement already.
            if (collectionData.data.cursor !== undefined) await this.ackPull(collectionData.data.cursor, (collectionData.data.bookmarks || []).length + (collectionData.data.folders || []).length);

            console.log(`[SwitchCollection] Successfully switched to ${newCollectionName}`);
            return { success: true };
        } catch (error) {
            await this.recoverReplacement();
            console.error('[SwitchCollection] Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        } finally {
            try {
                await this.storageManager.setQueueingSuppressed(wasSuppressed);
            } catch (error) {
                console.error('Failed to restore queueing state after switch:', error);
            }
        }
    }

    public async listCollections(): Promise<any> {
        try {
            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(`${this.API_BASE}/collections`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error listing collections:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private async fetchMasterCollection(collectionId?: string): Promise<any> {
        try {
            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }
            const deviceId = await this.storageManager.getDeviceId();
            const userId = await this.storageManager.getUserId();
            const browserInstanceId = await this.storageManager.getBrowserInstanceId();

            const collectionHeaders = collectionId ? { 'X-Collection-ID': collectionId, 'X-Sync-Version': '2' } : await this.getCollectionHeaders();
            const response = await fetch(`${this.API_ENDPOINT}/master-collection`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId,
                    ...(browserInstanceId ? { 'X-Browser-Instance-ID': browserInstanceId } : {}),
                    ...collectionHeaders
                }
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching master collection:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    private async clearLocalBookmarks(): Promise<void> {
        const tree = (await this.getBookmarkTree())[0];
        this.roots = new BookmarkRoots(tree);
        for (const root of tree.children || []) {
            if (this.roots.excludedIds.has(root.id)) continue;
            for (const child of [...(root.children || [])].reverse()) {
                if (child.url) await this.removeBookmarkNode(child.id);
                else await this.removeBookmarkTree(child.id);
            }
        }
        const remaining = (await this.getBookmarkTree())[0].children?.filter(r => !this.roots!.excludedIds.has(r.id))
            .reduce((sum, r) => sum + (r.children?.length || 0), 0) || 0;
        if (remaining) throw new Error('Some local bookmarks could not be cleared; restore was stopped');
    }

    private async restoreFromMasterCollection(collection: any): Promise<void> {
        this.roots = new BookmarkRoots((await this.getBookmarkTree())[0]);
        const localFolderMap = new Map<string, string>();
        const map: MasterIdMap = {};
        const pending = [...(collection.folders || [])];
        while (pending.length) {
            let progress = false;
            for (let i = 0; i < pending.length;) {
                const folder = pending[i];
                if (folder.masterParentId && !localFolderMap.has(folder.masterParentId)) { i++; continue; }
                const role = BookmarkRoots.masterKind(folder);
                const parentId = role ? undefined : await this.resolveParentIdForSync(folder.masterParentId, folder.parentId, localFolderMap, {});
                const localId = role ? await this.ensureLocalRoot(role, folder.masterId) : (await this.createBookmarkNode({ parentId: parentId!, title: folder.title,
                    index: await this.safeIndex(parentId!, folder.position) })).id;
                localFolderMap.set(folder.masterId, localId);
                map[folder.masterId] = { kind: 'folder', localId };
                pending.splice(i, 1); progress = true;
            }
            if (!progress) throw new Error('Collection has missing parents or a folder cycle');
        }
        for (const bookmark of [...(collection.bookmarks || [])].sort((a, b) => a.position - b.position)) {
            const parentId = await this.resolveParentIdForSync(bookmark.masterParentId, bookmark.parentId, localFolderMap, {});
            const local = await this.createBookmarkNode({ parentId, title: bookmark.title, url: bookmark.url, index: await this.safeIndex(parentId, bookmark.position) });
            map[bookmark.masterId] = { kind: 'bookmark', localId: local.id };
        }
        await this.storageManager.setMasterIdMap(map);
    }

    private async safeIndex(parentId: string, position?: number): Promise<number | undefined> {
        if (!Number.isInteger(position) || position! < 0) return undefined;
        return Math.min(position!, (await this.getBookmarkChildren(parentId)).length);
    }

    public withOperationLock<T>(operation: () => Promise<T>): Promise<T> {
        const run = this.operationChain.then(operation, operation);
        this.operationChain = run.then(() => undefined, () => undefined);
        return run;
    }

    private async recoverReplacement(): Promise<void> {
        const backup = await this.storageManager.getReplacementBackup();
        if (!backup) return;
        const current = await this.storageManager.getData();
        if (current?.auth?.user.id !== backup.data?.auth?.user.id) throw new Error('Sign into the original account to recover the interrupted replacement');
        await this.clearLocalBookmarks();
        const liveTree = (await this.getBookmarkTree())[0];
        const remapped = new Map<string, string>();
        const restore = async (nodes: chrome.bookmarks.BookmarkTreeNode[], parentId: string) => {
            for (const node of [...nodes].sort((a, b) => (a.index || 0) - (b.index || 0))) {
                const created = await this.createBookmarkNode({ parentId, title: node.title, ...(node.url ? { url: node.url } : {}) });
                remapped.set(node.id, created.id);
                if (node.children) await restore(node.children, created.id);
            }
        };
        for (const root of backup.tree[0].children || []) {
            if (this.roots?.excludedIds.has(root.id)) continue;
            const target = liveTree.children?.find(r => r.id === root.id);
            if (!target) throw new Error('Original bookmark root is unavailable; backup is retained');
            remapped.set(root.id, target.id);
            await restore(root.children || [], target.id);
        }
        const masterIdMap: MasterIdMap = {};
        for (const [masterId, value] of Object.entries(backup.data.masterIdMap || {}) as [string, any][]) {
            masterIdMap[masterId] = { ...value, localId: value.localId ? remapped.get(value.localId) || null : null };
        }
        const changes = (backup.data.changes || []).map((change: any) => ({ ...change, data: { ...change.data,
            browserId: remapped.get(change.data.browserId) || change.data.browserId,
            parentId: remapped.get(change.data.parentId) || change.data.parentId } }));
        await this.storageManager.setData({ ...backup.data, auth: current!.auth, changes, masterIdMap });
        await this.storageManager.saveReplacementBackup(null);
    }
}
