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

            // Fetch pending changes from server
            const response = await fetch(`${this.API_ENDPOINT}/pending`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-Browser-Instance-ID': browserInstanceId
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
            
            if (summary.total === 0) {
                console.log('No pending changes to apply');
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

            // Build a map of masterId -> local browserId for existing items
            const tree = await this.getBookmarkTree();
            const { localFolderMap, localBookmarkMap } = await this.buildLocalIdMaps(tree[0]);

            // 1. Create new folders (parent folders first)
            if (changes.creates.folders.length > 0) {
                const folderIdMap: Record<string, string> = {}; // masterId -> new local id
                
                // Sort folders by creation time to handle parent-child ordering
                const sortedFolders = [...changes.creates.folders].sort((a: any, b: any) => 
                    (a.createdAt || 0) - (b.createdAt || 0)
                );

                for (const folder of sortedFolders) {
                    try {
                        const parentId = await this.resolveParentIdForSync(
                            folder.masterParentId, 
                            folder.parentId, 
                            localFolderMap, 
                            folderIdMap
                        );
                        
                        const newFolder = await chrome.bookmarks.create({
                            parentId,
                            title: folder.title
                        });
                        
                        folderIdMap[folder.masterId] = newFolder.id;
                        localFolderMap.set(folder.masterId, newFolder.id);
                        applied.creates.folders++;
                        console.log(`Created folder: ${folder.title} (${newFolder.id})`);
                    } catch (error) {
                        console.error(`Failed to create folder ${folder.title}:`, error);
                    }
                }
            }

            // 2. Create new bookmarks
            if (changes.creates.bookmarks.length > 0) {
                for (const bookmark of changes.creates.bookmarks) {
                    try {
                        const parentId = await this.resolveParentIdForSync(
                            bookmark.masterParentId, 
                            bookmark.parentId, 
                            localFolderMap, 
                            {}
                        );
                        
                        await chrome.bookmarks.create({
                            parentId,
                            title: bookmark.title,
                            url: bookmark.url
                        });
                        
                        applied.creates.bookmarks++;
                        console.log(`Created bookmark: ${bookmark.title}`);
                    } catch (error) {
                        console.error(`Failed to create bookmark ${bookmark.title}:`, error);
                    }
                }
            }

            // 3. Apply updates to folders
            if (changes.updates.folders.length > 0) {
                for (const folder of changes.updates.folders) {
                    try {
                        const localId = localFolderMap.get(folder.masterId);
                        if (localId) {
                            await chrome.bookmarks.update(localId, {
                                title: folder.title
                            });
                            applied.updates.folders++;
                            console.log(`Updated folder: ${folder.title}`);
                        } else {
                            console.warn(`Folder not found locally for update: ${folder.masterId}`);
                        }
                    } catch (error) {
                        console.error(`Failed to update folder ${folder.title}:`, error);
                    }
                }
            }

            // 4. Apply updates to bookmarks
            if (changes.updates.bookmarks.length > 0) {
                for (const bookmark of changes.updates.bookmarks) {
                    try {
                        const localId = localBookmarkMap.get(bookmark.masterId);
                        if (localId) {
                            await chrome.bookmarks.update(localId, {
                                title: bookmark.title,
                                url: bookmark.url
                            });
                            applied.updates.bookmarks++;
                            console.log(`Updated bookmark: ${bookmark.title}`);
                        } else {
                            console.warn(`Bookmark not found locally for update: ${bookmark.masterId}`);
                        }
                    } catch (error) {
                        console.error(`Failed to update bookmark ${bookmark.title}:`, error);
                    }
                }
            }

            // 5. Delete bookmarks (before folders to avoid errors)
            if (changes.deletes.bookmarks.length > 0) {
                for (const bookmark of changes.deletes.bookmarks) {
                    try {
                        const localId = localBookmarkMap.get(bookmark.masterId);
                        if (localId) {
                            await chrome.bookmarks.remove(localId);
                            applied.deletes.bookmarks++;
                            console.log(`Deleted bookmark: ${bookmark.title}`);
                        }
                    } catch (error) {
                        console.error(`Failed to delete bookmark ${bookmark.title}:`, error);
                    }
                }
            }

            // 6. Delete folders
            if (changes.deletes.folders.length > 0) {
                for (const folder of changes.deletes.folders) {
                    try {
                        const localId = localFolderMap.get(folder.masterId);
                        if (localId) {
                            await chrome.bookmarks.removeTree(localId);
                            applied.deletes.folders++;
                            console.log(`Deleted folder: ${folder.title}`);
                        }
                    } catch (error) {
                        console.error(`Failed to delete folder ${folder.title}:`, error);
                    }
                }
            }

            // Acknowledge the sync to the server
            await this.acknowledgeSyncDown(summary.total);
            await this.storageManager.updateLastSync();

            const totalApplied = 
                applied.creates.folders + applied.creates.bookmarks +
                applied.updates.folders + applied.updates.bookmarks +
                applied.deletes.folders + applied.deletes.bookmarks;

            console.log(`Sync down complete. Applied ${totalApplied} changes.`);

            return {
                success: true,
                data: {
                    message: `Applied ${totalApplied} changes`,
                    applied,
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
    }> {
        const localFolderMap = new Map<string, string>();
        const localBookmarkMap = new Map<string, string>();
        
        // For now, we need to fetch the master collection to get masterId mappings
        // In the future, we could store these locally during initial sync
        const masterCollection = await this.fetchMasterCollection();
        if (!masterCollection.success) {
            console.warn('Could not fetch master collection for ID mapping');
            return { localFolderMap, localBookmarkMap };
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
                // It's a folder
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
        return { localFolderMap, localBookmarkMap };
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
        newFolderIdMap: Record<string, string>
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
     * Acknowledge to the server that changes have been applied.
     */
    private async acknowledgeSyncDown(changesApplied: number): Promise<void> {
        try {
            const authToken = await this.storageManager.getAuthToken();
            const browserInstanceId = await this.storageManager.getBrowserInstanceId();
            const deviceId = await this.storageManager.getDeviceId();

            await fetch(`${this.API_ENDPOINT}/ack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-Device-ID': deviceId,
                    'X-Browser-Instance-ID': browserInstanceId
                },
                body: JSON.stringify({ changesApplied })
            });
        } catch (error) {
            console.error('Failed to acknowledge sync:', error);
            // Don't throw - sync was successful even if ack fails
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
                        // It's a folder - remove it and all its contents
                        console.log(`[clearLocalBookmarks] Removing folder: ${child.title} (id: ${child.id})`);
                        await chrome.bookmarks.removeTree(child.id);
                    } else {
                        // It's a bookmark
                        console.log(`[clearLocalBookmarks] Removing bookmark: ${child.title} (id: ${child.id})`);
                        await chrome.bookmarks.remove(child.id);
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
                            await chrome.bookmarks.removeTree(child.id);
                        } else {
                            await chrome.bookmarks.remove(child.id);
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
        const getFolderSourceId = (folder: any): string => String(folder?.browserId ?? folder?.id ?? '');
        const getFolderParentId = (folder: any): string => String(folder?.parentId ?? '');
        
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
