import { BookmarkManager } from './BookmarkManager';
import { SyncManager } from './SyncManager';
import { StorageManager } from './StorageManager';

class BackgroundService {
    private bookmarkManager: BookmarkManager;
    private syncManager: SyncManager;
    private storageManager: StorageManager;
    private isInitialized: boolean = false;

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
    
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    
            // Sync status handler
            if (message.action === 'getSyncStatus') {
                (async () => {
                    try {
                        // First check local storage
                        const storageData = await this.storageManager.getData();
                        const hasInitialSync = storageData?.lastSync != null && storageData.lastSync > 0;

                        if (hasInitialSync) {
                            // Already synced before, just get local changes
                            const localChanges = await this.storageManager.getQueuedChanges();
                            const local = {
                                adds: localChanges.filter(c => c.type === 'CREATE').length,
                                updates: localChanges.filter(c => c.type === 'UPDATE').length,
                                moves: localChanges.filter(c => c.type === 'MOVE').length,
                                deletes: localChanges.filter(c => c.type === 'DELETE').length
                            };

                            sendResponse({
                                success: true,
                                data: {
                                    isInitialSync: false,
                                    local,
                                    remote: { adds: 0, updates: 0, moves: 0, deletes: 0 }
                                }
                            });
                            return;
                        }

                        // If no initial sync yet, then check with server
                        const browserInstanceId = await this.storageManager.getBrowserInstanceId();
                        const response = await fetch('http://localhost:3005/api/v1/sync/status', {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Browser-Instance-ID': browserInstanceId
                            }
                        });                        

                        if (!response.ok) {
                            throw new Error('Failed to get sync status');
                        }

                        const serverStatus = await response.json();
                        console.log('Server status:', serverStatus);

                        // Get local changes
                        const localChanges = await this.storageManager.getQueuedChanges();
                        const local = {
                            adds: localChanges.filter(c => c.type === 'CREATE').length,
                            updates: localChanges.filter(c => c.type === 'UPDATE').length,
                            moves: localChanges.filter(c => c.type === 'MOVE').length,
                            deletes: localChanges.filter(c => c.type === 'DELETE').length
                        };

                        sendResponse({
                            success: true,
                            data: {
                                isInitialSync: serverStatus.data.needsInitialSync,
                                local,
                                remote: serverStatus.data.pendingChanges
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
