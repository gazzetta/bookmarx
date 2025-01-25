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
        // Listen for extension installation/update
        chrome.runtime.onInstalled.addListener(this.handleInstall.bind(this));
        
        // Listen for browser startup
        chrome.runtime.onStartup.addListener(this.handleStartup.bind(this));

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
                return true; // Will respond asynchronously
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