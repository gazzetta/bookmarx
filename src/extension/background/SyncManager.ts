import { StorageManager } from './StorageManager';

interface SyncResponse {
    success: boolean;
    changes?: any[];
    error?: string;
    timestamp?: number;
}

export class SyncManager {
    private syncInProgress: boolean = false;
    private readonly SYNC_RETRY_DELAY = 5000; // 5 seconds
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private retryCount = 0;
    private readonly API_ENDPOINT = 'http://localhost:3000/api/v1/sync'; // We'll update this later

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
    
            // Get all pending changes
            const changes = await this.storageManager.getQueuedChanges();
            console.log('Changes to be synced:', changes);
    
            if (changes.length === 0) {
                console.log('No changes to sync');
                return true;
            }
    
            // Send changes to server
            const response = await this.sendChangesToServer(changes);
            console.log('Server response:', response);
    
            if (response.success) {
                // Clear the synced changes
                await this.storageManager.clearQueuedChanges();
                // Update last sync timestamp
                await this.storageManager.updateLastSync();
                
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
            // Get device info from storage
            const deviceId = await this.storageManager.getDeviceId();
            
            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-ID': deviceId
                },
                body: JSON.stringify({
                    changes,
                    deviceId,
                    timestamp: Date.now()
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
}