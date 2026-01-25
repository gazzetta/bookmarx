import { StorageManager } from './StorageManager';
import { detectBrowser } from './utils/browserDetect';

interface SyncResponse {
    success: boolean;
    data?: {
        action?: string;
        message?: string;
        processed?: any[];
    };
    changes?: any[];
    error?: string;
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

export class SyncManager {
    private syncInProgress: boolean = false;
    private readonly SYNC_RETRY_DELAY = 5000; // 5 seconds
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private retryCount = 0;
    private readonly API_ENDPOINT = 'http://localhost:3005/api/v1/sync'; // We'll update this later

    constructor(private storageManager: StorageManager) {}

    // Safe wrapper for chrome.bookmarks.getTree() that works in both Chrome and Firefox
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
        // We'll only set up the schedule if autoSync gets enabled later
        if (await this.isAutoSyncEnabled()) {
            await this.setupSyncSchedule();
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

                return true;
            } else {
                throw new Error(response.error || 'Sync failed');
            }

        } catch (error) {
            console.error('Sync error:', error);
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

            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-Browser-Instance-ID': browserInstanceId,
                    'X-User-ID': userId
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
                throw new Error(`Server returned ${response.status}`);
            }

            return await response.json();
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

            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }
            
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
            const response = await fetch(`${this.API_ENDPOINT}/initial`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId
                },
                body: JSON.stringify({
                    bookmarks,
                    folders,
                    userId,
                    deviceId,
                    metadata
                })
            });

            if (!response.ok) {
                console.error('Server response not OK:', response.status);
                throw new Error('Failed to send initial sync');
            }

            const result = await response.json();
            console.log('\nInitial sync response:', result);

            if (result.success) {
                console.log('Initial sync completed successfully');
                await this.storageManager.updateLastSync();
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
            
            // Send to server merge endpoint
            console.log('\nSending merge request to server...');
            const userId = await this.storageManager.getUserId();
            const deviceId = await this.storageManager.getDeviceId();
            const response = await fetch(`${this.API_ENDPOINT}/merge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId
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

    private processBookmarkTree(node: chrome.bookmarks.BookmarkTreeNode): { bookmarks: any[], folders: any[] } {
        const bookmarks: any[] = [];
        const folders: any[] = [];

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
            // Skip the root node
            if (node.id !== '0') {
                if (node.url) {
                    bookmarks.push({
                        id: node.id,           // Server expects 'id' for mapping
                        browserId: node.id,
                        userId: 'default',  
                        title: node.title,
                        url: node.url,
                        parentId: node.parentId,
                        position: node.index || 0,
                        dateAdded: node.dateAdded
                    });
                } else {
                    folders.push({
                        id: node.id,           // Server expects 'id' for mapping
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
                node.children.forEach(processNode);
            }
        };

        processNode(node);
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
        await chrome.bookmarks.create({
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
        
        await chrome.bookmarks.update(change.data.id, changes);
    }

    private async applyDeleteChange(change: any): Promise<void> {
        await chrome.bookmarks.remove(change.data.id);
    }

    private async applyMoveChange(change: any): Promise<void> {
        await chrome.bookmarks.move(change.data.id, {
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
        
        const response = await fetch(`${this.API_ENDPOINT}/status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'X-Device-ID': deviceId,
                'X-Browser-Instance-ID': browserInstanceId
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
            
            const response = await fetch(`${this.API_ENDPOINT}/master-summary`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId
                }
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting master collection summary:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
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
    
    private async fetchMasterCollection(): Promise<any> {
        try {
            const authToken = await this.storageManager.getAuthToken();
            if (!authToken) {
                throw new Error('Not authenticated');
            }
            const deviceId = await this.storageManager.getDeviceId();
            const userId = await this.storageManager.getUserId();
            
            const response = await fetch(`${this.API_ENDPOINT}/master-collection`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-User-ID': userId
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
        
        // Process each root folder
        for (const rootNode of tree[0].children || []) {
            // Skip the root node itself
            if (rootNode.id === '0') continue;
            
            // Process each child of the root folders (Bookmarks Bar, Other Bookmarks, etc.)
            for (const child of rootNode.children || []) {
                try {
                    // If it's a folder, remove it and all its contents
                    if (!child.url) {
                        await chrome.bookmarks.removeTree(child.id);
                    } else {
                        // If it's a bookmark, just remove it
                        await chrome.bookmarks.remove(child.id);
                    }
                } catch (error) {
                    console.error(`Error removing bookmark/folder ${child.id}:`, error);
                    // Continue with other bookmarks even if one fails
                }
            }
        }
    }
    
    private async restoreFromMasterCollection(collection: any): Promise<void> {
        console.log('Restoring from master collection...', collection);
        
        // Get the root folders using safe wrapper
        const tree = await this.getBookmarkTree();
        const rootFolders: Record<string, string> = {};
        const normalizeTitle = (value: string) => value.trim().toLowerCase();
        const getFolderSourceId = (folder: any): string => String(folder?.browserId ?? folder?.id ?? '');
        const getFolderParentId = (folder: any): string => String(folder?.parentId ?? '');
        
        // Map folder names to IDs
        for (const rootNode of tree[0].children || []) {
            rootFolders[normalizeTitle(rootNode.title)] = rootNode.id;
        }

        const bookmarksBarId = rootFolders['bookmarks bar'] || rootFolders['bookmarks toolbar'] || '1';
        const otherBookmarksId = rootFolders['other bookmarks'] || rootFolders['unfiled bookmarks'] || '2';
        const bookmarksMenuId = rootFolders['bookmarks menu'];
        const mobileBookmarksId = rootFolders['mobile bookmarks'] || '3';
        
        // Create a map to track new IDs for folders
        const folderIdMap: Record<string, string> = {};

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
                || normalizedTitle === 'mobile bookmarks';
        };

        const resolveRootIdByTitle = (title: string): string | undefined => {
            const normalizedTitle = normalizeTitle(title);
            if (normalizedTitle === 'bookmarks bar') {
                return bookmarksBarId;
            }
            if (normalizedTitle === 'bookmarks toolbar') {
                return bookmarksBarId;
            }
            if (normalizedTitle === 'other bookmarks') {
                return otherBookmarksId;
            }
            if (normalizedTitle === 'unfiled bookmarks') {
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

        const resolveParentId = (rawParentId?: unknown): string | undefined => {
            const parentId = rawParentId === undefined || rawParentId === null ? '' : String(rawParentId);
            const normalizedParentId = parentId.trim().toLowerCase();
            if (!parentId || parentId === '0') {
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
            const children = await chrome.bookmarks.getChildren(parentId);
            return Math.min(position, children.length);
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
                    const created = await chrome.bookmarks.create({
                        parentId: otherBookmarksId || bookmarksBarId,
                        title: menuRoot.title
                    });
                    folderIdMap[getFolderSourceId(menuRoot)] = created.id;
                    menuFolderIds.add(getFolderSourceId(menuRoot));
                } catch (error) {
                    console.error('Error creating Bookmarks Menu container:', error);
                }

                for (let i = 1; i < menuRoots.length; i += 1) {
                    const duplicate = menuRoots[i];
                    folderIdMap[getFolderSourceId(duplicate)] = folderIdMap[getFolderSourceId(menuRoot)];
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
                        folderIdMap[sourceId] = mappedRootId;
                    }
                    return false;
                }
                return true;
            })
            .sort((a: any, b: any) => {
                const parentCompare = String(a.parentId ?? '').localeCompare(String(b.parentId ?? ''));
                if (parentCompare !== 0) {
                    return parentCompare;
                }
                const posA = typeof a.position === 'number' ? a.position : 0;
                const posB = typeof b.position === 'number' ? b.position : 0;
                return posA - posB;
            });

        const remainingFolders = [...pendingFolders];
        let madeProgress = true;

        while (remainingFolders.length && madeProgress) {
            madeProgress = false;
            for (let i = 0; i < remainingFolders.length;) {
                const folder = remainingFolders[i];
                const parentId = resolveParentId(folder.parentId);

                if (!parentId) {
                    i += 1;
                    continue;
                }

                try {
                    const index = await getSafeIndex(parentId, folder.position);
                    const newFolder = await chrome.bookmarks.create({
                        parentId,
                        title: folder.title,
                        ...(typeof index === 'number' ? { index } : {})
                    });
                    folderIdMap[getFolderSourceId(folder)] = newFolder.id;
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
                    const parentId = bookmarksBarId;
                    const index = await getSafeIndex(parentId, folder.position);
                    const newFolder = await chrome.bookmarks.create({
                        parentId,
                        title: folder.title,
                        ...(typeof index === 'number' ? { index } : {})
                    });
                    folderIdMap[getFolderSourceId(folder)] = newFolder.id;
                } catch (error) {
                    console.error(`Error creating folder ${folder.title}:`, error);
                }
            }
        }
        
        // Then create all bookmarks
        const bookmarks = (Array.isArray(collection.bookmarks) ? collection.bookmarks : [])
            .sort((a: any, b: any) => {
                const parentCompare = String(a.parentId ?? '').localeCompare(String(b.parentId ?? ''));
                if (parentCompare !== 0) {
                    return parentCompare;
                }
                const posA = typeof a.position === 'number' ? a.position : 0;
                const posB = typeof b.position === 'number' ? b.position : 0;
                return posA - posB;
            });

        for (const bookmark of bookmarks) {
            try {
                // Determine parent ID
                const parentId = resolveParentId(bookmark.parentId) || bookmarksBarId;
                const index = await getSafeIndex(parentId, bookmark.position);
                
                // Create the bookmark
                await chrome.bookmarks.create({
                    parentId,
                    title: bookmark.title,
                    url: bookmark.url,
                    ...(typeof index === 'number' ? { index } : {})
                });
            } catch (error) {
                console.error(`Error creating bookmark ${bookmark.title}:`, error);
            }
        }
    }
}
