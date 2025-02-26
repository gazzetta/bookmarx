import { StorageManager } from './StorageManager';

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

export class SyncManager {
    private syncInProgress: boolean = false;
    private readonly SYNC_RETRY_DELAY = 5000; // 5 seconds
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private retryCount = 0;
    private readonly API_ENDPOINT = 'http://localhost:3005/api/v1/sync'; // We'll update this later

    constructor(private storageManager: StorageManager) {}

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
            const deviceId = await this.storageManager.getDeviceId();
            const browserInstanceId = await this.storageManager.getBrowserInstanceId();
            const userId = await this.storageManager.getUserId();
            
            // Get device info for metadata
            const deviceInfo = {
                browser: 'Chrome',
                browserVersion: navigator.userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || '',
                browserInstanceId,
                deviceId,
                os: navigator.platform,
                osVersion: navigator.userAgent
            };

            // Format changes with proper metadata
            const formattedChanges = changes.map(change => ({
                type: change.type,
                data: {
                    type: change.data.type,
                    id: change.data.id,
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
            
            // Get all bookmarks
            const tree = await chrome.bookmarks.getTree();
            const { bookmarks, folders } = this.processBookmarkTree(tree[0]);
            
            console.log(`Preparing to sync ${bookmarks.length} bookmarks and ${folders.length} folders`);
            
            // Get device info
            const deviceInfo = {
                browser: 'Chrome',
                browserVersion: navigator.userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || '',
                browserInstanceId: await this.storageManager.getBrowserInstanceId() || crypto.randomUUID(),
                deviceId: await this.storageManager.getDeviceId(),
                os: navigator.platform,
                osVersion: navigator.userAgent
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

    private processBookmarkTree(node: chrome.bookmarks.BookmarkTreeNode): { bookmarks: any[], folders: any[] } {
        const bookmarks: any[] = [];
        const folders: any[] = [];

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
            // Skip the root node
            if (node.id !== '0') {
                if (node.url) {
                    bookmarks.push({
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
        const changes = await this.storageManager.getQueuedChanges();
        const deviceId = await this.storageManager.getDeviceId();

        // Check if this is initial sync
        try {
            const response = await fetch(`${this.API_ENDPOINT}/status`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
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
                const tree = await chrome.bookmarks.getTree();
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
        
        const response = await fetch(`${this.API_ENDPOINT}/status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
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
            const deviceId = await this.storageManager.getDeviceId();
            const userId = await this.storageManager.getUserId();
            
            const response = await fetch(`${this.API_ENDPOINT}/master-summary`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
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
        try {
            console.log('Starting overwrite from master collection...');
            
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
        }
    }
    
    private async fetchMasterCollection(): Promise<any> {
        try {
            const deviceId = await this.storageManager.getDeviceId();
            const userId = await this.storageManager.getUserId();
            
            const response = await fetch(`${this.API_ENDPOINT}/master-collection`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
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
        
        // Get all bookmarks
        const tree = await chrome.bookmarks.getTree();
        
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
        
        // Get the root folders
        const tree = await chrome.bookmarks.getTree();
        const rootFolders: Record<string, string> = {};
        
        // Map folder names to IDs
        for (const rootNode of tree[0].children || []) {
            rootFolders[rootNode.title] = rootNode.id;
        }
        
        // Create a map to track new IDs for folders
        const folderIdMap: Record<string, string> = {};
        
        // First, create all folders
        for (const folder of collection.folders || []) {
            try {
                // Determine parent ID
                let parentId: string;
                
                if (!folder.parentId || folder.parentId === '0' || folder.parentId === '1') {
                    // Top-level folder, place in Bookmarks Bar by default
                    parentId = rootFolders['Bookmarks Bar'] || rootFolders['Bookmarks bar'] || '1';
                } else if (folderIdMap[folder.parentId]) {
                    // Parent is a folder we've already created
                    parentId = folderIdMap[folder.parentId];
                } else {
                    // Default to Bookmarks Bar if we can't find the parent
                    parentId = rootFolders['Bookmarks Bar'] || rootFolders['Bookmarks bar'] || '1';
                }
                
                // Create the folder
                const newFolder = await chrome.bookmarks.create({
                    parentId,
                    title: folder.title,
                    index: folder.position || undefined
                });
                
                // Store the mapping from old ID to new ID
                folderIdMap[folder.id] = newFolder.id;
            } catch (error) {
                console.error(`Error creating folder ${folder.title}:`, error);
            }
        }
        
        // Then create all bookmarks
        for (const bookmark of collection.bookmarks || []) {
            try {
                // Determine parent ID
                let parentId: string;
                
                if (!bookmark.parentId || bookmark.parentId === '0' || bookmark.parentId === '1') {
                    // Top-level bookmark, place in Bookmarks Bar by default
                    parentId = rootFolders['Bookmarks Bar'] || rootFolders['Bookmarks bar'] || '1';
                } else if (folderIdMap[bookmark.parentId]) {
                    // Parent is a folder we've already created
                    parentId = folderIdMap[bookmark.parentId];
                } else {
                    // Default to Bookmarks Bar if we can't find the parent
                    parentId = rootFolders['Bookmarks Bar'] || rootFolders['Bookmarks bar'] || '1';
                }
                
                // Create the bookmark
                await chrome.bookmarks.create({
                    parentId,
                    title: bookmark.title,
                    url: bookmark.url,
                    index: bookmark.position || undefined
                });
            } catch (error) {
                console.error(`Error creating bookmark ${bookmark.title}:`, error);
            }
        }
    }
}
