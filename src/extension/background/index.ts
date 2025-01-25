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
            // Existing sync handler
            if (message.action === 'syncNow') {
                console.log('Received sync request from popup');
                this.syncManager.sync()
                    .then(result => {
                        console.log('Sync completed with result:', result);
                        sendResponse({ success: result });
                    })
                    .catch(error => {
                        console.error('Sync failed:', error);
                        sendResponse({ success: false, error: error.message });
                    });
                return true;
            }
    
            // Sync status handler
            if (message.action === 'getSyncStatus') {
                (async () => {
                    try {
                        const deviceId = await this.storageManager.getDeviceId();
                        console.log('Debug - deviceId before request:', deviceId);
            
                        const response = await fetch('http://localhost:3005/api/v1/sync/status', {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Device-ID': deviceId
                            }
                        });                        
            
                        if (!response.ok) {
                            console.error('Server response not OK:', response.status);
                            throw new Error('Failed to get sync status');
                        }
            
                        const serverStatus = await response.json();
                        console.log('Server status:', serverStatus);
    
                        // Get local changes
                        const localChanges = await this.storageManager.getQueuedChanges();
    
                        // Count local changes by type
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