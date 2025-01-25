import { SyncConfirmDialog, SyncSummary } from '../components/SyncConfirmDialog';

class PopupManager {
    private syncButton: HTMLButtonElement;
    private lastSyncElement: HTMLElement;
    private pendingCountElement: HTMLElement;
    private totalCountElement: HTMLElement;
    private syncStatusElement: HTMLElement;
    private errorContainer: HTMLElement;
    private syncConfirmDialog: SyncConfirmDialog;

    constructor() {
        this.syncConfirmDialog = new SyncConfirmDialog();
        this.initializeElements();
        this.attachEventListeners();
        this.updateUI();
    }


    private initializeElements(): void {
        this.syncButton = document.getElementById('syncNow') as HTMLButtonElement;
        this.lastSyncElement = document.getElementById('lastSync') as HTMLElement;
        this.pendingCountElement = document.getElementById('pendingCount') as HTMLElement;
        this.totalCountElement = document.getElementById('totalCount') as HTMLElement;
        this.syncStatusElement = document.getElementById('syncStatus') as HTMLElement;
        this.errorContainer = document.getElementById('errorContainer') as HTMLElement;
    }

    private attachEventListeners(): void {
        this.syncButton.addEventListener('click', () => this.handleSync());
        
        document.getElementById('openOptions')?.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        document.getElementById('openManager')?.addEventListener('click', () => {
            chrome.tabs.create({ url: 'chrome://bookmarks' });
        });

        document.getElementById('debugStorage')?.addEventListener('click', async () => {
            const data = await this.getStorageData();
            console.log('Storage Debug:', JSON.stringify(data, null, 2));
        });        
    }

    private async updateUI(): Promise<void> {
        try {
            const data = await this.getStorageData();
            this.updateSyncInfo(data);
            this.updateStats(data);
        } catch (error) {
            this.showError('Failed to load extension data');
        }
    }

    private async getStorageData(): Promise<any> {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (data) => {
                resolve(data);
            });
        });
    }

    private updateSyncInfo(data: any): void {
        const lastSync = data.lastSync;
        if (lastSync) {
            const lastSyncDate = new Date(lastSync);
            this.lastSyncElement.textContent = `Last synced: ${this.formatDate(lastSyncDate)}`;
        }

        // Update sync status indicator
        this.syncStatusElement.className = 'sync-status';
        if (data.syncInProgress) {
            this.syncStatusElement.classList.add('syncing');
        } else if (data.syncError) {
            this.syncStatusElement.classList.add('error');
        }
    }

    private updateStats(data: any): void {
        // Update pending changes count
        const pendingChanges = data.changes?.length || 0;
        this.pendingCountElement.textContent = pendingChanges.toString();

        // Get total bookmarks count
        chrome.bookmarks.getTree((bookmarkItems) => {
            const count = this.countBookmarks(bookmarkItems);
            this.totalCountElement.textContent = count.toString();
        });
    }

    private countBookmarks(bookmarkItems: chrome.bookmarks.BookmarkTreeNode[]): number {
        let count = 0;
        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
            if (node.url) count++;
            if (node.children) {
                node.children.forEach(processNode);
            }
        };
        bookmarkItems.forEach(processNode);
        return count;
    }

    private async handleSync(): Promise<void> {
        try {
            // Get sync status from server
            const response = await this.getSyncStatus();
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to get sync status');
            }

            // Count all bookmarks for initial sync
            let summary = response.data;
            if (summary.isInitialSync) {
                const bookmarkCount = await this.getTotalBookmarkCount();
                summary = {
                    ...summary,
                    local: {
                        adds: bookmarkCount,
                        updates: 0,
                        moves: 0,
                        deletes: 0
                    }
                };
            }

            // Show confirmation dialog
            const confirmed = await this.syncConfirmDialog.showConfirmation(summary);
            if (!confirmed) return;

            // Trigger sync
            const syncResult = await this.triggerSync();
            if (syncResult.success) {
                this.updateUI();
            } else {
                throw new Error(syncResult.error?.message || 'Sync failed');
            }
        } catch (error) {
            this.showError((error as Error).message);
        }
    }

    private getTotalBookmarkCount(): Promise<number> {
        return new Promise((resolve) => {
            chrome.bookmarks.getTree((bookmarkItems) => {
                const count = this.countBookmarks(bookmarkItems);
                resolve(count);
            });
        });
    }

    private async getSyncStatus(): Promise<any> {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getSyncStatus' }, (response) => {
                resolve(response);
            });
        });
    }

    private async triggerSync(): Promise<any> {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'syncNow' }, (response) => {
                resolve(response);
            });
        });
    }

    private showSuccess(message: string): void {
        const errorContainer = document.getElementById('errorContainer');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <span>${message}</span>
                <button class="dismiss-button">×</button>
            `;
            errorContainer.className = 'success-container';
            
            // Add click handler for dismiss button
            const dismissButton = errorContainer.querySelector('.dismiss-button');
            dismissButton?.addEventListener('click', () => {
                errorContainer.className = 'success-container hidden';
            });
        }
    }
    
    private showError(message: string): void {
        const errorContainer = document.getElementById('errorContainer');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <span>${message}</span>
                <button class="dismiss-button">×</button>
            `;
            errorContainer.className = 'error-container';
            
            // Add click handler for dismiss button
            const dismissButton = errorContainer.querySelector('.dismiss-button');
            dismissButton?.addEventListener('click', () => {
                errorContainer.className = 'error-container hidden';
            });
        }
    }

    private formatDate(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        return date.toLocaleDateString();
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});
