import { StorageManager, MasterIdMap } from './StorageManager';
import { detectBrowser } from './utils/browserDetect';
import { API_BASE_URL, WEBSITE_BASE_URL } from '../config';

// Give up on a pull window after this many failed applies, so one bad change can't block sync forever.
const MAX_PULL_ATTEMPTS = 5;

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
    private syncInProgress: boolean = false;
    private readonly SYNC_RETRY_DELAY = 5000; // 5 seconds
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private retryCount = 0;
    private readonly API_BASE = `${API_BASE_URL}/api/v1`;
    private readonly API_ENDPOINT = `${this.API_BASE}/sync`;
    private appConfig: any = null;

    constructor(private storageManager: StorageManager) { }

    private async getCollectionHeaders(): Promise<Record<string, string>> {
        const collectionId = await this.storageManager.getCollectionId();
        return collectionId ? { 'X-Collection-ID': collectionId } : {};
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
        return new Promise((resolve, reject) => {
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
        return new Promise((resolve, reject) => {
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
    }

    private async removeBookmarkTree(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
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
    }

    private async updateBookmarkNode(id: string, changes: chrome.bookmarks.BookmarkChangesArg): Promise<chrome.bookmarks.BookmarkTreeNode> {
        return new Promise((resolve, reject) => {
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
    }

    private async moveBookmarkNode(id: string, destination: { parentId?: string; index?: number }): Promise<chrome.bookmarks.BookmarkTreeNode> {
        return new Promise((resolve, reject) => {
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
        } catch (error) {
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

    public async sync(): Promise<boolean> {
        if (this.syncInProgress) {
            console.log('Sync already in progress');
            return false;
        }

        try {
            this.syncInProgress = true;
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
                // Clear the synced changes only if we had any
                if (changes.length > 0) {
                    await this.storageManager.clearQueuedChanges();
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
        } finally {
            this.syncInProgress = false;
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
            const formattedChanges = changes.map(change => ({
                type: change.type,
                data: {
                    type: change.data.type,
                    id: change.data.id || change.data.browserId,
                    browserId: change.data.browserId || change.data.id,
                    title: change.data.title,
                    url: change.data.url,
                    parentId: change.data.parentId,
                    index: change.data.index,
                    dateAdded: change.data.dateAdded
                },
                metadata: {
                    deviceInfo,
                    userAgent: navigator.userAgent,
                    timestamp: Date.now()
                },
                timestamp: Date.now()
            }));

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
                            upgradeUrl: `${WEBSITE_BASE_URL}/upgrade`
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
                        result.error.upgradeUrl || `${WEBSITE_BASE_URL}/upgrade`
                    );
                }

                if (errorCode === 'BROWSER_LIMIT_REACHED') {
                    const limit = result.error.limit || 2;
                    throw new LimitError(
                        `You've reached your limit of ${limit} browsers. ` +
                        `Please remove a browser or upgrade to ${premiumTitle} for up to ${premiumBrowsers} browsers.`,
                        'BROWSER_LIMIT_REACHED',
                        result.error.upgradeUrl || `${WEBSITE_BASE_URL}/upgrade`
                    );
                }

                if (errorCode === 'BROWSER_REGISTRATION_RATE_LIMITED') {
                    throw new LimitError(
                        `You've registered too many browsers recently. Please wait or upgrade to ${premiumTitle}.`,
                        'BROWSER_REGISTRATION_RATE_LIMITED',
                        result.error.upgradeUrl || `${WEBSITE_BASE_URL}/upgrade`
                    );
                }

                // Generic error
                throw new Error(errorMessage || 'Failed to send initial sync');
            }

            // ... (rest of success handling) ...

            console.log('\nInitial sync response:', result);

            if (result.success) {
                console.log('Initial sync completed successfully');
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
        try {
            console.log('\n=== Starting Overwrite Remote ===');

            if (!this.appConfig) {
                await this.fetchAppConfig();
            }

            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }

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
        try {
            console.log('\n=== Starting Merge Into Master ===');

            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }

            // Get all bookmarks using safe wrapper
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
                await this.storageManager.updateLastSync();
                await this.storageManager.clearQueuedChanges();
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

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
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

        // Listen for alarm
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'sync') {
                this.checkForPendingChanges();
            }
        });
    }

    public async getSyncSummary(): Promise<SyncSummary> {
        const authToken = await this.storageManager.getAuthToken();
        if (!authToken) {
            throw new Error('Not authenticated');
        }
        const changes = await this.storageManager.getQueuedChanges();
        const deviceId = await this.storageManager.getDeviceId();

        // Check if this is initial sync
        try {
            const response = await fetch(`${this.API_ENDPOINT}/status`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId
                }
            });

            if (!response.ok) {
                throw new Error('Failed to check sync status');
            }

            const status = await response.json();
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
                const sortedFolders = [...changes.creates.folders].sort((a: any, b: any) =>
                    (a.createdAt || 0) - (b.createdAt || 0)
                );

                for (const folder of sortedFolders) {
                    try {
                        // Top-level bookmarks bar / other / mobile: map onto this browser's own root.
                        // Creating a copy here is what produced a second "Bookmarks Bar" folder.
                        const rootKind = this.systemRootKindOfMasterFolder(folder);
                        if (rootKind) {
                            folderIdMap[folder.masterId] = rootKind;
                            localFolderMap.set(folder.masterId, rootKind);
                            nextMap[folder.masterId] = { kind: 'folder', localId: rootKind };
                            continue;
                        }

                        // Already here (matched earlier, or re-sent after a failed pull): reuse, don't duplicate
                        const existing = await this.existingLocalId(localFolderMap, folder.masterId);
                        if (existing) {
                            folderIdMap[folder.masterId] = existing;
                            nextMap[folder.masterId] = { kind: 'folder', localId: existing };
                            continue;
                        }

                        const parentId = await this.resolveParentIdForSync(
                            folder.masterParentId,
                            folder.parentId,
                            localFolderMap,
                            folderIdMap,
                            folder.title
                        );

                        const newFolder = await this.createBookmarkNode({
                            parentId,
                            title: folder.title
                        });

                        folderIdMap[folder.masterId] = newFolder.id;
                        localFolderMap.set(folder.masterId, newFolder.id);
                        nextMap[folder.masterId] = { kind: 'folder', localId: newFolder.id };
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
                for (const bookmark of changes.creates.bookmarks) {
                    try {
                        // Already here (re-sent after a failed pull): reuse, don't duplicate
                        const existing = await this.existingLocalId(localBookmarkMap, bookmark.masterId);
                        if (existing) {
                            nextMap[bookmark.masterId] = { kind: 'bookmark', localId: existing };
                            continue;
                        }

                        const parentId = await this.resolveParentIdForSync(
                            bookmark.masterParentId,
                            bookmark.parentId,
                            localFolderMap,
                            {}
                        );

                        const created = await this.createBookmarkNode({
                            parentId,
                            title: bookmark.title,
                            url: bookmark.url
                        });

                        localBookmarkMap.set(bookmark.masterId, created.id);
                        nextMap[bookmark.masterId] = { kind: 'bookmark', localId: created.id };
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
                        if (localId && !SyncManager.isSystemRootId(localId)) {
                            await this.updateBookmarkNode(localId, {
                                title: folder.title
                            });
                            applied.updates.folders++;
                            console.log(`Updated folder: ${folder.title}`);
                        } else if (!localId) {
                            console.warn(`Folder not found locally for update: ${folder.masterId}`);
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
                            applied.updates.bookmarks++;
                            console.log(`Updated bookmark: ${bookmark.title}`);
                        } else {
                            console.warn(`Bookmark not found locally for update: ${bookmark.masterId}`);
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
                            console.log(`Deleted bookmark: ${bookmark.title}`);
                        } else if (bookmark.url && masterUrls && !masterUrls.has(this.normalizeUrl(bookmark.url))) {
                            // Not in the persisted map (e.g. created locally and never matched). Fall back to the URL
                            // on the delete record, only when no live master bookmark still uses that URL.
                            const matches = await this.findLocalBookmarksByUrl(bookmark.url);
                            for (const match of matches) {
                                await this.removeBookmarkNode(match.id);
                                applied.deletes.bookmarks++;
                            }
                            nextMap[bookmark.masterId] = { kind: 'bookmark', localId: null };
                            console.log(`Deleted ${matches.length} local bookmark(s) by URL fallback: ${bookmark.title}`);
                        } else if (!masterUrls) {
                            // Can't tell whether it exists here without the master. Retry, don't drop it.
                            throw new Error(`Cannot resolve delete for ${bookmark.title}: master collection unavailable`);
                        } else {
                            nextMap[bookmark.masterId] = { kind: 'bookmark', localId: null };
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
                        if (localId && SyncManager.isSystemRootId(localId)) {
                            // Never remove a browser's own bookmarks bar, other or mobile root
                            console.warn(`Refusing to delete system root for ${folder.title}`);
                        } else if (localId) {
                            await this.removeBookmarkTree(localId);
                            applied.deletes.folders++;
                            nextMap[folder.masterId] = { kind: 'folder', localId: null };
                            console.log(`Deleted folder: ${folder.title}`);
                        } else if (!masterUrls) {
                            throw new Error(`Cannot resolve delete for folder ${folder.title}: master collection unavailable`);
                        } else {
                            nextMap[folder.masterId] = { kind: 'folder', localId: null };
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
                if (attempts < MAX_PULL_ATTEMPTS) {
                    await this.storageManager.setPullFailure({ since: since ?? 0, attempts });
                    console.warn(`${failures} change(s) failed to apply; will retry (attempt ${attempts} of ${MAX_PULL_ATTEMPTS})`);
                    return {
                        success: false,
                        error: `${failures} change(s) could not be applied. Sync will retry them.`
                    };
                }
                console.error(`Giving up on ${failures} change(s) after ${attempts} attempts. Advancing past them.`);
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
        localFolderMap: Map<string, string>;
        localBookmarkMap: Map<string, string>;
        // Normalized URLs still live in the master collection; null when the fetch failed.
        masterUrls: Set<string> | null;
    }> {
        const localFolderMap = new Map<string, string>();
        const localBookmarkMap = new Map<string, string>();

        // For now, we need to fetch the master collection to get masterId mappings
        // In the future, we could store these locally during initial sync
        const masterCollection = await this.fetchMasterCollection();
        if (!masterCollection.success) {
            console.warn('Could not fetch master collection for ID mapping');
            return { localFolderMap, localBookmarkMap, masterUrls: null };
        }

        // Build URL -> masterId map for bookmarks
        const masterBookmarksByUrl = new Map<string, string>();
        for (const b of masterCollection.data.bookmarks || []) {
            if (b.url && b.masterId) {
                masterBookmarksByUrl.set(this.normalizeUrl(b.url), b.masterId);
            }
        }

        // Build path -> masterId map for folders
        const masterFoldersByPath = new Map<string, string>();
        const masterFolderMap = new Map<string, any>();
        for (const f of masterCollection.data.folders || []) {
            masterFolderMap.set(f.masterId, f);
        }
        for (const f of masterCollection.data.folders || []) {
            const path = this.buildFolderPath(f.masterId, masterFolderMap);
            if (path && f.masterId) {
                masterFoldersByPath.set(path.toLowerCase(), f.masterId);
            }
        }

        // Master folder that stands for each system root (1 = bar, 2 = other, 3 = mobile)
        const masterRootIdByKind = new Map<string, string>();
        for (const f of masterCollection.data.folders || []) {
            const kind = this.systemRootKindOfMasterFolder(f);
            if (kind && f.masterId && !masterRootIdByKind.has(kind)) masterRootIdByKind.set(kind, f.masterId);
        }

        // Now traverse local tree and match
        const processNode = (node: chrome.bookmarks.BookmarkTreeNode, pathParts: string[]) => {
            if (node.id === '0') {
                // Root node - process children
                for (const child of node.children || []) {
                    processNode(child, []);
                }
                return;
            }

            if (node.url) {
                // It's a bookmark
                const normalizedUrl = this.normalizeUrl(node.url);
                const masterId = masterBookmarksByUrl.get(normalizedUrl);
                if (masterId) {
                    localBookmarkMap.set(masterId, node.id);
                }
            } else {
                // It's a folder. Top-level system roots match by browser id, whatever this browser calls them
                // (Chrome "Bookmarks bar", Edge "Favourites bar", Firefox id "toolbar_____").
                const rootKind = pathParts.length === 0 ? SyncManager.ROOT_KIND_BY_ID[node.id] : undefined;
                const masterRootId = rootKind ? masterRootIdByKind.get(rootKind) : undefined;
                if (masterRootId) localFolderMap.set(masterRootId, node.id);

                const currentPath = [...pathParts, node.title.toLowerCase()].join('/');
                const masterId = masterFoldersByPath.get(currentPath);
                if (masterId) {
                    localFolderMap.set(masterId, node.id);
                }

                // Process children
                for (const child of node.children || []) {
                    processNode(child, [...pathParts, node.title.toLowerCase()]);
                }
            }
        };

        processNode(rootNode, []);

        console.log(`Built local ID maps: ${localFolderMap.size} folders, ${localBookmarkMap.size} bookmarks`);
        return { localFolderMap, localBookmarkMap, masterUrls: new Set(masterBookmarksByUrl.keys()) };
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
            return normalized.toLowerCase();
        } catch {
            return url.toLowerCase().trim();
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
    private async resolveParentIdForSync(
        masterParentId: string | null,
        browserParentId: string | null,
        localFolderMap: Map<string, string>,
        newFolderIdMap: Record<string, string>,
        folderTitle?: string
    ): Promise<string> {
        // First, try to find by masterParentId
        if (masterParentId) {
            // Check in newly created folders this session
            if (newFolderIdMap[masterParentId]) {
                return newFolderIdMap[masterParentId];
            }
            // Check in existing local folders
            const localId = localFolderMap.get(masterParentId);
            if (localId) {
                return localId;
            }
        }

        // If the folder title matches a root folder name, map to the corresponding Chrome root ID
        // This handles the case where the master collection has root-level folders from other browsers
        // that should map to the current browser's native root folders
        if (folderTitle) {
            const normalizedTitle = folderTitle.toLowerCase().trim();
            const rootFolderTitleMap: Record<string, string> = {
                'bookmarks bar': '1',
                'bookmarks toolbar': '1',
                'toolbar': '1',
                'favourites bar': '1',
                'favorites bar': '1',
                'other bookmarks': '2',
                'unfiled bookmarks': '2',
                'other': '2',
                'other favourites': '2',
                'other favorites': '2',
                'mobile bookmarks': '3',
                'mobile': '3',
                'bookmarks menu': '2'
            };
            if (rootFolderTitleMap[normalizedTitle]) {
                return rootFolderTitleMap[normalizedTitle];
            }
        }

        // Fall back to browser root folder mapping
        // Note: This mapping is used when syncing changes between browsers
        // We need to map Firefox/Edge/Opera IDs to the current browser's root folder IDs
        if (browserParentId) {
            const rootMap: Record<string, string> = {
                // Chrome/Brave/Chromium root IDs
                '1': '1', // Bookmarks Bar
                '2': '2', // Other Bookmarks
                '3': '3', // Mobile Bookmarks
                // Firefox root IDs
                'toolbar_____': '1', // Firefox Bookmarks Toolbar -> Bookmarks Bar
                'unfiled_____': '2', // Firefox Other Bookmarks -> Other Bookmarks
                'mobile______': '3', // Firefox Mobile -> Mobile
                'menu________': '2', // Firefox Bookmarks Menu -> Other Bookmarks
                // Edge may use similar numeric IDs but with "Favourites" naming
                // Opera may have different root structure
            };
            if (rootMap[browserParentId]) {
                return rootMap[browserParentId];
            }
        }

        // Default to Bookmarks Bar
        return '1';
    }

    /**
     * Acknowledge an applied pull. The server moves this browser's watermark to `cursor`.
     * If the ack is lost, the next pull repeats the window. Apply is idempotent, so that's safe.
     */
    private async ackPull(cursor: number, changesApplied: number): Promise<void> {
        try {
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
                    ...collectionHeaders
                },
                body: JSON.stringify({ cursor, changesApplied })
            });
            if (!response.ok) {
                console.warn(`Pull ack failed with status ${response.status}; the next pull will repeat this window`);
            }
        } catch (error) {
            console.warn('Pull ack failed; the next pull will repeat this window:', error);
        }
    }

    // Top-level folder that stands for one of the browser's system roots, or null.
    // Matched by title, so it works across browsers: Chrome "Bookmarks bar", Edge "Favourites bar".
    private systemRootKindOfMasterFolder(folder: any): '1' | '2' | '3' | null {
        if (!folder || folder.masterParentId) return null; // nested folders are never system roots
        const key = String(folder.title ?? '').trim().toLowerCase();
        return SyncManager.ROOT_KIND_BY_NAME[key] ?? null;
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

    public async overwriteFromMaster(): Promise<any> {
        const wasSuppressed = await this.storageManager.isQueueingSuppressed();
        await this.storageManager.setQueueingSuppressed(true);

        try {
            console.log('Starting overwrite from master collection...');

            await this.storageManager.clearQueuedChanges();

            // Get the master collection from the server
            const masterCollection = await this.fetchMasterCollection();
            if (!masterCollection.success) {
                throw new Error(masterCollection.error || 'Failed to fetch master collection');
            }

            // Clear local bookmarks (except root folders)
            await this.clearLocalBookmarks();

            // Restore bookmarks from master collection
            await this.restoreFromMasterCollection(masterCollection.data);

            // Update last sync timestamp
            await this.storageManager.updateLastSync();

            return { success: true };
        } catch (error) {
            console.error('Overwrite error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        } finally {
            try {
                await this.storageManager.setQueueingSuppressed(wasSuppressed);
            } catch (error) {
                console.error('Failed to restore queueing state after overwrite:', error);
            }
        }
    }

    public async fetchMasterCollectionPublic(): Promise<any> {
        return this.fetchMasterCollection();
    }

    /**
     * Switch the browser to a different collection.
     * Clears local bookmarks and restores from the target collection.
     */
    public async switchCollection(newCollectionId: string, newCollectionName: string): Promise<{ success: boolean; error?: string }> {
        const wasSuppressed = await this.storageManager.isQueueingSuppressed();
        await this.storageManager.setQueueingSuppressed(true);

        try {
            console.log(`[SwitchCollection] Switching to collection: ${newCollectionName} (${newCollectionId})`);

            await this.storageManager.clearQueuedChanges();

            // Update stored collection BEFORE fetching so the header is sent correctly
            await this.storageManager.setCollection(newCollectionId, newCollectionName);

            const collectionData = await this.fetchMasterCollection();
            if (!collectionData.success) {
                throw new Error(collectionData.error || 'Failed to fetch collection data');
            }

            await this.clearLocalBookmarks();
            await this.restoreFromMasterCollection(collectionData.data);
            await this.storageManager.updateLastSync();

            console.log(`[SwitchCollection] Successfully switched to ${newCollectionName}`);
            return { success: true };
        } catch (error) {
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

    private async fetchMasterCollection(): Promise<any> {
        try {
            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }
            const deviceId = await this.storageManager.getDeviceId();
            const userId = await this.storageManager.getUserId();
            const browserInstanceId = await this.storageManager.getBrowserInstanceId();

            const collectionHeaders = await this.getCollectionHeaders();
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
        console.log('Clearing local bookmarks...');

        // Get all bookmarks using safe wrapper
        const tree = await this.getBookmarkTree();

        // Log the tree structure for debugging
        console.log('[clearLocalBookmarks] Tree structure:', JSON.stringify({
            rootId: tree[0]?.id,
            rootTitle: tree[0]?.title,
            rootChildren: tree[0]?.children?.map(c => ({ id: c.id, title: c.title, childCount: c.children?.length || 0 }))
        }));

        // Opera-specific system folders that should NOT be cleared
        // These are either system-managed or trash folders
        const skipFolderTitles = new Set([
            'bin',              // Opera trash
            'trash',            // Alternative trash name
            'speed dials',      // Opera speed dial
            'pinboard',         // Opera pinboard
            'unsynchronized pinboard'  // Opera unsynchronized pinboard
        ]);

        // Folders we SHOULD clear (user bookmark folders)
        const clearFolderTitles = new Set([
            'bookmarks bar',
            'bookmarks toolbar',
            'other bookmarks',
            'unsorted bookmarks',
            'imported bookmarks',
            'unfiled bookmarks',
            'bookmarks menu',
            'mobile bookmarks',
            'bookmarks',         // Opera uses just "Bookmarks" as the main folder
            'my bookmarks',      // Some Opera versions
            'favourites',        // Opera alternative name
            'favorites',         // Opera alternative name (US spelling)
            'favourites bar',    // Edge UK spelling
            'favorites bar'      // Edge US spelling
        ]);

        // Process each root folder
        const rootFolders = tree[0]?.children || [];

        for (const rootFolder of rootFolders) {
            const folderTitle = (rootFolder.title || '').toLowerCase();

            // Skip Opera system folders
            if (skipFolderTitles.has(folderTitle)) {
                console.log(`[clearLocalBookmarks] SKIPPING system folder: ${rootFolder.title} (id: ${rootFolder.id})`);
                continue;
            }

            // Only clear known bookmark folders, skip unknown ones to be safe
            const isKnownFolder = clearFolderTitles.has(folderTitle);
            if (!isKnownFolder) {
                console.log(`[clearLocalBookmarks] SKIPPING unknown folder: ${rootFolder.title} (id: ${rootFolder.id})`);
                continue;
            }

            console.log(`[clearLocalBookmarks] Processing root folder: ${rootFolder.title} (id: ${rootFolder.id}), children: ${rootFolder.children?.length || 0}`);

            const children = rootFolder.children || [];

            // Delete in reverse order to avoid index shifting issues
            for (let i = children.length - 1; i >= 0; i--) {
                const child = children[i];
                try {
                    if (!child.url) {
                        console.log(`[clearLocalBookmarks] Removing folder: ${child.title} (id: ${child.id})`);
                        await this.removeBookmarkTree(child.id);
                    } else {
                        console.log(`[clearLocalBookmarks] Removing bookmark: ${child.title} (id: ${child.id})`);
                        await this.removeBookmarkNode(child.id);
                    }
                } catch (error) {
                    console.error(`[clearLocalBookmarks] Error removing ${child.id} (${child.title}):`, error);
                    // Continue with other bookmarks even if one fails
                }
            }
        }

        // Verify deletion worked - only count items in clearable folders
        const verifyTree = await this.getBookmarkTree();
        let remainingCount = 0;
        const foldersWithRemaining: string[] = [];

        for (const rootFolder of verifyTree[0]?.children || []) {
            const folderTitle = (rootFolder.title || '').toLowerCase();
            if (skipFolderTitles.has(folderTitle) || !clearFolderTitles.has(folderTitle)) {
                continue; // Don't count skipped folders
            }
            const count = rootFolder.children?.length || 0;
            if (count > 0) {
                remainingCount += count;
                foldersWithRemaining.push(`${rootFolder.title}: ${count}`);
            }
        }

        console.log(`[clearLocalBookmarks] Complete. Remaining items in clearable folders: ${remainingCount}`);

        if (remainingCount > 0) {
            console.warn(`[clearLocalBookmarks] Some items were not deleted! Folders: ${foldersWithRemaining.join(', ')}`);
            console.warn('[clearLocalBookmarks] Attempting second pass...');

            // Second pass - sometimes items remain due to timing issues
            for (const rootFolder of verifyTree[0]?.children || []) {
                const folderTitle = (rootFolder.title || '').toLowerCase();
                if (skipFolderTitles.has(folderTitle) || !clearFolderTitles.has(folderTitle)) {
                    continue;
                }

                for (const child of rootFolder.children || []) {
                    try {
                        if (!child.url) {
                            await this.removeBookmarkTree(child.id);
                        } else {
                            await this.removeBookmarkNode(child.id);
                        }
                    } catch (error) {
                        console.error(`[clearLocalBookmarks] Second pass error for ${child.id}:`, error);
                    }
                }
            }

            // Final verification
            const finalTree = await this.getBookmarkTree();
            let finalRemaining = 0;
            for (const rootFolder of finalTree[0]?.children || []) {
                const folderTitle = (rootFolder.title || '').toLowerCase();
                if (skipFolderTitles.has(folderTitle) || !clearFolderTitles.has(folderTitle)) {
                    continue;
                }
                finalRemaining += rootFolder.children?.length || 0;
            }
            console.log(`[clearLocalBookmarks] After second pass, remaining: ${finalRemaining}`);
        }
    }

    private async restoreFromMasterCollection(collection: any): Promise<void> {
        console.log('Restoring from master collection...', collection);

        // Get the root folders using safe wrapper
        const tree = await this.getBookmarkTree();
        const rootFolders: Record<string, string> = {};
        const normalizeTitle = (value: string) => value.trim().toLowerCase();
        const getFolderIdentifierCandidates = (folder: any): string[] => {
            const ids = [folder?.masterId, folder?.browserId, folder?.id]
                .filter((value) => value !== undefined && value !== null)
                .map((value) => String(value).trim())
                .filter((value) => value.length > 0);
            return Array.from(new Set(ids));
        };
        const getFolderSourceId = (folder: any): string => getFolderIdentifierCandidates(folder)[0] || '';
        const getFolderParentId = (folder: any): string => String(folder?.masterParentId ?? folder?.parentId ?? '');

        // Map folder names to IDs
        for (const rootNode of tree[0].children || []) {
            rootFolders[normalizeTitle(rootNode.title)] = rootNode.id;
        }

        // Different browsers use different names for the bookmarks bar:
        // - Chrome/Brave/Chromium: "Bookmarks Bar" (id: 1)
        // - Firefox: "Bookmarks Toolbar" (id: toolbar_____)
        // - Edge: "Favourites bar" or "Favorites bar"
        // - Opera: "Bookmarks bar" (but may have additional folders like Pinboard, Bin)
        const bookmarksBarId = rootFolders['bookmarks bar']
            || rootFolders['bookmarks toolbar']
            || rootFolders['favourites bar']    // Edge UK spelling
            || rootFolders['favorites bar']     // Edge US spelling
            || rootFolders['bookmarks']
            || rootFolders['my bookmarks']
            || '1';
        const otherBookmarksId = rootFolders['other bookmarks']
            || rootFolders['unfiled bookmarks']
            || rootFolders['unsorted bookmarks']
            || rootFolders['other favourites']  // Edge UK spelling
            || rootFolders['other favorites']   // Edge US spelling 
            || '2';
        const bookmarksMenuId = rootFolders['bookmarks menu'];
        const mobileBookmarksId = rootFolders['mobile bookmarks'] || '3';

        // Create a map to track new IDs for folders
        const folderIdMap: Record<string, string> = {};
        const mapFolderIds = (folder: any, mappedBrowserFolderId: string): void => {
            for (const id of getFolderIdentifierCandidates(folder)) {
                folderIdMap[id] = mappedBrowserFolderId;
            }
        };

        // Log detected browser folders for debugging
        console.log('[restoreFromMasterCollection] Detected browser root folders:', {
            allRootFolders: rootFolders,
            resolved: {
                bookmarksBarId,
                otherBookmarksId,
                bookmarksMenuId,
                mobileBookmarksId
            }
        });

        const resolveRootIdBySourceId = (sourceId: string): string | undefined => {
            const normalizedSourceId = sourceId.trim().toLowerCase();
            if (sourceId === '1') {
                return bookmarksBarId;
            }
            if (sourceId === '2') {
                return otherBookmarksId;
            }
            if (sourceId === '3') {
                return mobileBookmarksId;
            }
            if (normalizedSourceId.startsWith('toolbar')) {
                return bookmarksBarId;
            }
            if (normalizedSourceId.startsWith('menu')) {
                return bookmarksMenuId || otherBookmarksId;
            }
            if (normalizedSourceId.startsWith('unfiled')) {
                return otherBookmarksId;
            }
            if (normalizedSourceId.startsWith('mobile')) {
                return mobileBookmarksId;
            }
            return undefined;
        };

        const isRootSystemFolder = (folder: any): boolean => {
            const parentId = getFolderParentId(folder);
            const sourceId = getFolderSourceId(folder);
            const normalizedSourceId = sourceId.trim().toLowerCase();
            if (sourceId === '1' || sourceId === '2' || sourceId === '3') {
                return true;
            }
            if (normalizedSourceId.startsWith('toolbar')
                || normalizedSourceId.startsWith('menu')
                || normalizedSourceId.startsWith('unfiled')
                || normalizedSourceId.startsWith('mobile')) {
                return true;
            }
            const normalizedParentId = parentId.trim().toLowerCase();
            if (parentId && parentId !== '0' && !normalizedParentId.startsWith('root')) {
                return false;
            }
            const normalizedTitle = normalizeTitle(String(folder?.title || ''));
            return normalizedTitle === 'bookmarks bar'
                || normalizedTitle === 'bookmarks toolbar'
                || normalizedTitle === 'bookmarks menu'
                || normalizedTitle === 'other bookmarks'
                || normalizedTitle === 'unfiled bookmarks'
                || normalizedTitle === 'mobile bookmarks'
                || normalizedTitle === 'bookmarks'      // Opera main folder
                || normalizedTitle === 'my bookmarks'   // Some Opera versions
                || normalizedTitle === 'unsorted bookmarks'
                || normalizedTitle === 'favourites bar'   // Edge UK spelling
                || normalizedTitle === 'favorites bar'    // Edge US spelling
                || normalizedTitle === 'other favourites' // Edge UK spelling
                || normalizedTitle === 'other favorites'; // Edge US spelling
        };

        const resolveRootIdByTitle = (title: string): string | undefined => {
            const normalizedTitle = normalizeTitle(title);
            // Bookmarks Bar equivalents across browsers
            if (normalizedTitle === 'bookmarks bar'
                || normalizedTitle === 'bookmarks toolbar'
                || normalizedTitle === 'favourites bar'     // Edge UK
                || normalizedTitle === 'favorites bar'      // Edge US
                || normalizedTitle === 'bookmarks'          // Opera
                || normalizedTitle === 'my bookmarks') {    // Some Opera versions
                return bookmarksBarId;
            }
            // Other Bookmarks equivalents across browsers
            if (normalizedTitle === 'other bookmarks'
                || normalizedTitle === 'unfiled bookmarks'
                || normalizedTitle === 'unsorted bookmarks'
                || normalizedTitle === 'other favourites'   // Edge UK
                || normalizedTitle === 'other favorites') { // Edge US
                return otherBookmarksId;
            }
            if (normalizedTitle === 'bookmarks menu') {
                return bookmarksMenuId || otherBookmarksId;
            }
            if (normalizedTitle === 'mobile bookmarks') {
                return mobileBookmarksId;
            }
            return undefined;
        };

        const resolveParentId = (rawParentId?: unknown, folderTitle?: string): string | undefined => {
            const parentId = rawParentId === undefined || rawParentId === null ? '' : String(rawParentId);
            const normalizedParentId = parentId.trim().toLowerCase();
            if (!parentId || parentId === '0') {
                // If folder title matches a root folder name, map to the corresponding root ID
                if (folderTitle) {
                    const mappedByTitle = resolveRootIdByTitle(folderTitle);
                    if (mappedByTitle) {
                        return mappedByTitle;
                    }
                }
                return bookmarksBarId;
            }
            if (folderIdMap[parentId]) {
                return folderIdMap[parentId];
            }
            if (parentId === '1') {
                return bookmarksBarId;
            }
            if (parentId === '2') {
                return otherBookmarksId || bookmarksBarId;
            }
            if (parentId === '3') {
                return mobileBookmarksId || bookmarksBarId;
            }
            if (normalizedParentId.startsWith('toolbar')) {
                return bookmarksBarId;
            }
            if (normalizedParentId.startsWith('menu')) {
                return otherBookmarksId || bookmarksBarId;
            }
            if (normalizedParentId.startsWith('unfiled')) {
                return otherBookmarksId || bookmarksBarId;
            }
            if (normalizedParentId.startsWith('mobile')) {
                return mobileBookmarksId || bookmarksBarId;
            }
            if (normalizedParentId.startsWith('root')) {
                return bookmarksBarId;
            }
            return undefined;
        };

        const getSafeIndex = async (parentId: string, position?: number): Promise<number | undefined> => {
            if (typeof position !== 'number' || Number.isNaN(position) || position < 0) {
                return undefined;
            }
            try {
                const children = await this.getBookmarkChildren(parentId);
                return Math.min(position, children.length);
            } catch {
                return undefined;
            }
        };

        const allFolders = Array.isArray(collection.folders) ? collection.folders : [];
        const menuFolderIds = new Set<string>();

        if (!bookmarksMenuId) {
            const menuRoots = allFolders.filter((folder: any) => {
                if (!folder) return false;
                const sourceId = getFolderSourceId(folder);
                const normalizedTitle = normalizeTitle(String(folder?.title || ''));
                return normalizedTitle === 'bookmarks menu' || sourceId.trim().toLowerCase().startsWith('menu');
            });

            if (menuRoots.length) {
                const menuRoot = menuRoots[0];
                try {
                    const created = await this.createBookmarkNode({
                        parentId: otherBookmarksId || bookmarksBarId,
                        title: menuRoot.title
                    });
                    mapFolderIds(menuRoot, created.id);
                    menuFolderIds.add(getFolderSourceId(menuRoot));
                } catch (error) {
                    console.error('Error creating Bookmarks Menu container:', error);
                }

                for (let i = 1; i < menuRoots.length; i += 1) {
                    const duplicate = menuRoots[i];
                    mapFolderIds(duplicate, folderIdMap[getFolderSourceId(menuRoot)]);
                    menuFolderIds.add(getFolderSourceId(duplicate));
                }
            }
        }

        const pendingFolders = allFolders
            .filter((folder: any) => {
                if (!folder) {
                    return false;
                }
                if (menuFolderIds.has(getFolderSourceId(folder))) {
                    return false;
                }
                if (isRootSystemFolder(folder)) {
                    const sourceId = getFolderSourceId(folder);
                    const mappedRootId = resolveRootIdBySourceId(sourceId) ?? resolveRootIdByTitle(folder.title);
                    if (mappedRootId) {
                        mapFolderIds(folder, mappedRootId);
                    }
                    return false;
                }
                return true;
            })
            .sort((a: any, b: any) => {
                // Sort by masterParentId first (or parentId as fallback), then by position
                const aParent = String(a.masterParentId ?? a.parentId ?? '');
                const bParent = String(b.masterParentId ?? b.parentId ?? '');
                const parentCompare = aParent.localeCompare(bParent);
                if (parentCompare !== 0) {
                    return parentCompare;
                }
                const posA = typeof a.position === 'number' ? a.position : 0;
                const posB = typeof b.position === 'number' ? b.position : 0;
                return posA - posB;
            });

        const createFolderInBrowser = async (parentId: string, title: string, position?: number): Promise<chrome.bookmarks.BookmarkTreeNode> => {
            const index = await getSafeIndex(parentId, position);
            return this.createBookmarkNode({
                parentId,
                title,
                ...(typeof index === 'number' ? { index } : {})
            });
        };

        const remainingFolders = [...pendingFolders];
        let madeProgress = true;

        while (remainingFolders.length && madeProgress) {
            madeProgress = false;
            for (let i = 0; i < remainingFolders.length;) {
                const folder = remainingFolders[i];
                const parentId = resolveParentId(getFolderParentId(folder), folder.title);

                if (!parentId) {
                    i += 1;
                    continue;
                }

                try {
                    const newFolder = await createFolderInBrowser(parentId, folder.title, folder.position);
                    mapFolderIds(folder, newFolder.id);
                    remainingFolders.splice(i, 1);
                    madeProgress = true;
                } catch (error) {
                    console.error(`Error creating folder ${folder.title}:`, error);
                    remainingFolders.splice(i, 1);
                }
            }
        }

        if (remainingFolders.length) {
            console.warn('Some folders could not resolve parents. Placing under Bookmarks Bar.', remainingFolders.map((folder: any) => folder.title));
            for (const folder of remainingFolders) {
                try {
                    const newFolder = await createFolderInBrowser(bookmarksBarId, folder.title, folder.position);
                    mapFolderIds(folder, newFolder.id);
                } catch (error) {
                    console.error(`Error creating folder ${folder.title}:`, error);
                }
            }
        }

        // Then create all bookmarks
        const bookmarks = (Array.isArray(collection.bookmarks) ? collection.bookmarks : [])
            .sort((a: any, b: any) => {
                // Sort by masterParentId first (or parentId as fallback), then by position
                const aParent = String(a.masterParentId ?? a.parentId ?? '');
                const bParent = String(b.masterParentId ?? b.parentId ?? '');
                const parentCompare = aParent.localeCompare(bParent);
                if (parentCompare !== 0) {
                    return parentCompare;
                }
                const posA = typeof a.position === 'number' ? a.position : 0;
                const posB = typeof b.position === 'number' ? b.position : 0;
                return posA - posB;
            });

        let bmCreated = 0;
        let bmFailed = 0;
        for (const bookmark of bookmarks) {
            try {
                const parentId = resolveParentId(bookmark.masterParentId ?? bookmark.parentId) || bookmarksBarId;
                const index = await getSafeIndex(parentId, bookmark.position);

                await this.createBookmarkNode({
                    parentId,
                    title: bookmark.title,
                    url: bookmark.url,
                    ...(typeof index === 'number' ? { index } : {})
                });
                bmCreated++;
            } catch (error) {
                console.error(`Error creating bookmark ${bookmark.title}:`, error);
                bmFailed++;
            }
        }
        console.log(`[restoreFromMaster] Bookmark restore complete: ${bmCreated} created, ${bmFailed} failed out of ${bookmarks.length}`);
    }
}
