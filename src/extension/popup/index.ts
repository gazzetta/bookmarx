import { SyncConfirmDialog, SyncSummary } from '../components/SyncConfirmDialog';
import { OnboardingDialog, OnboardingChoice, OnboardingInfo } from '../components/OnboardingDialog';

class PopupManager {
    private syncUpButton: HTMLButtonElement;
    private syncDownButton: HTMLButtonElement;
    private lastSyncElement: HTMLElement;
    private pendingBookmarksCountElement: HTMLElement;
    private pendingFoldersCountElement: HTMLElement;
    private localBookmarksCountElement: HTMLElement;
    private localFoldersCountElement: HTMLElement;
    private remoteChangeBookmarksCountElement: HTMLElement;
    private remoteChangeFoldersCountElement: HTMLElement;
    private remoteBookmarksCountElement: HTMLElement;
    private remoteFoldersCountElement: HTMLElement;
    private initialSyncNoticeElement: HTMLElement;
    private statsContainerElement: HTMLElement;
    private actionsContainerElement: HTMLElement;
    private syncStatusElement: HTMLElement;
    private errorContainer: HTMLElement;
    private syncConfirmDialog: SyncConfirmDialog;
    private onboardingDialog: OnboardingDialog;
    private authLoggedOut: HTMLElement;
    private authLoggedIn: HTMLElement;
    private authUserEmail: HTMLElement;
    private googleLoginButton: HTMLButtonElement;
    private emailLoginButton: HTMLButtonElement;
    private emailRegisterButton: HTMLButtonElement;
    private logoutButton: HTMLButtonElement;
    private emailInput: HTMLInputElement;
    private passwordInput: HTMLInputElement;
    private overwriteButton: HTMLButtonElement;
    private openManagerButton: HTMLButtonElement;
    private readonly apiBase = 'http://localhost:3005';
    private onboardingChecked: boolean = false;

    private sendMessage(message: any): Promise<any> {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(new Error(error.message));
                    return;
                }
                resolve(response);
            });
        });
    }

    constructor() {
        this.syncConfirmDialog = new SyncConfirmDialog();
        this.onboardingDialog = new OnboardingDialog();
        this.initializeElements();
        this.attachEventListeners();
        this.updateUI();
        // Check onboarding on popup open (for users already logged in but never synced)
        this.checkOnboardingNeeded();
    }


    private initializeElements(): void {
        this.syncUpButton = document.getElementById('syncUp') as HTMLButtonElement;
        this.syncDownButton = document.getElementById('syncDown') as HTMLButtonElement;
        this.lastSyncElement = document.getElementById('lastSync') as HTMLElement;
        this.pendingBookmarksCountElement = document.getElementById('pendingBookmarksCount') as HTMLElement;
        this.pendingFoldersCountElement = document.getElementById('pendingFoldersCount') as HTMLElement;
        this.localBookmarksCountElement = document.getElementById('localBookmarksCount') as HTMLElement;
        this.localFoldersCountElement = document.getElementById('localFoldersCount') as HTMLElement;
        this.remoteChangeBookmarksCountElement = document.getElementById('remoteChangeBookmarksCount') as HTMLElement;
        this.remoteChangeFoldersCountElement = document.getElementById('remoteChangeFoldersCount') as HTMLElement;
        this.remoteBookmarksCountElement = document.getElementById('remoteBookmarksCount') as HTMLElement;
        this.remoteFoldersCountElement = document.getElementById('remoteFoldersCount') as HTMLElement;
        this.initialSyncNoticeElement = document.getElementById('initialSyncNotice') as HTMLElement;
        this.statsContainerElement = document.getElementById('statsContainer') as HTMLElement;
        this.actionsContainerElement = document.getElementById('actionsContainer') as HTMLElement;
        this.syncStatusElement = document.getElementById('syncStatus') as HTMLElement;
        this.errorContainer = document.getElementById('errorContainer') as HTMLElement;
        this.authLoggedOut = document.getElementById('authLoggedOut') as HTMLElement;
        this.authLoggedIn = document.getElementById('authLoggedIn') as HTMLElement;
        this.authUserEmail = document.getElementById('authUserEmail') as HTMLElement;
        this.googleLoginButton = document.getElementById('googleLogin') as HTMLButtonElement;
        this.emailLoginButton = document.getElementById('emailLogin') as HTMLButtonElement;
        this.emailRegisterButton = document.getElementById('emailRegister') as HTMLButtonElement;
        this.logoutButton = document.getElementById('logout') as HTMLButtonElement;
        this.emailInput = document.getElementById('emailInput') as HTMLInputElement;
        this.passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
        this.overwriteButton = document.getElementById('overwriteFromMaster') as HTMLButtonElement;
        this.openManagerButton = document.getElementById('openManager') as HTMLButtonElement;
    }

    private attachEventListeners(): void {
        this.syncUpButton.addEventListener('click', () => this.handleSyncUp());
        this.syncDownButton.addEventListener('click', () => this.handleSyncDown());
        this.googleLoginButton?.addEventListener('click', () => this.handleGoogleLogin());
        this.emailLoginButton?.addEventListener('click', () => this.handleEmailAuth('login'));
        this.emailRegisterButton?.addEventListener('click', () => this.handleEmailAuth('register'));
        this.logoutButton?.addEventListener('click', () => this.handleLogout());
        
        document.getElementById('overwriteFromMaster')?.addEventListener('click', async () => {
            try {
                // Get the master collection summary first
                const response = await this.sendMessage({ action: 'getMasterCollectionSummary' });
                if (!response.success) {
                    throw new Error(response.error?.message || 'Failed to get master collection summary');
                }
                
                // Show confirmation dialog
                const summary = {
                    isOverwrite: true,
                    local: {
                        deletes: await this.getTotalBookmarkCount()
                    },
                    remote: {
                        adds: response.data.totalItems
                    }
                };
                
                const confirmed = await this.syncConfirmDialog.showConfirmation(summary);
                if (!confirmed) return;
                
                // Trigger the overwrite
                const result = await this.sendMessage({ action: 'overwriteFromMaster' });
                if (result.success) {
                    this.showSuccess('Bookmarks successfully overwritten from master collection');
                    await this.updateUI();
                } else {
                    throw new Error(result.error?.message || 'Overwrite failed');
                }
            } catch (error) {
                this.showError((error as Error).message);
                console.error('Overwrite Error:', error);
            }
        });

        document.getElementById('testNotification')?.addEventListener('click', async () => {
            try {
                const response = await this.sendMessage({ action: 'testNotification' });
                if (response?.success) {
                    this.showSuccess('Test notification sent');
                } else {
                    this.showError('Test notification failed (see service worker console)');
                }
            } catch (error) {
                this.showError('Test notification failed');
                console.error('Test Notification Error:', error);
            }
        });

        document.getElementById('resetNotificationState')?.addEventListener('click', async () => {
            try {
                const response = await this.sendMessage({ action: 'resetNotificationState' });
                if (response?.success) {
                    this.showSuccess('Notification state reset');
                } else {
                    this.showError('Failed to reset notification state');
                }
            } catch (error) {
                this.showError('Failed to reset notification state');
                console.error('Reset Notification State Error:', error);
            }
        });

        document.getElementById('openManager')?.addEventListener('click', () => {
            const url = chrome.runtime.getURL('pages/master-collection.html');
            chrome.tabs.create({ url });
        });

        document.getElementById('debugStorage')?.addEventListener('click', async () => {
            try {
                const response = await this.sendMessage({ action: 'debugStorage' });
                console.log('Storage Debug Response:', response);
                
                // Also log local storage data
                const localData = await this.getStorageData();
                console.log('Local Storage Data:', localData);
            } catch (error) {
                console.error('Debug Storage Error:', error);
            }
        });

        document.getElementById('clearStorage')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all extension storage? This will reset all settings and sync data.')) {
                try {
                    await this.sendMessage({ action: 'clearStorage' });
                    this.showSuccess('Storage cleared successfully');
                    // Refresh the UI
                    await this.updateUI();
                } catch (error) {
                    this.showError('Failed to clear storage');
                    console.error('Clear Storage Error:', error);
                }
            }
        });

        document.getElementById('debugBookmarkData')?.addEventListener('click', async () => {
            try {
                // Get the full bookmark tree
                chrome.bookmarks.getTree(async (tree) => {
                    if (!tree || tree.length === 0) {
                        this.showError('Could not get bookmark tree');
                        return;
                    }

                    // Process the tree to extract folders and bookmarks
                    const { folders, bookmarks, rawTree } = this.extractBookmarkData(tree[0]);
                    
                    // Get browser info
                    const browserInfo = await this.sendMessage({ action: 'getBrowserInfo' });
                    
                    // Create a detailed debug page
                    const debugData = {
                        browser: browserInfo?.data || 'Unknown',
                        timestamp: new Date().toISOString(),
                        summary: {
                            totalFolders: folders.length,
                            totalBookmarks: bookmarks.length
                        },
                        folders: folders,
                        bookmarks: bookmarks.slice(0, 50), // Limit bookmarks for readability
                        rawTreeSample: rawTree
                    };

                    // Create HTML content
                    const html = this.createDebugHtml(debugData);
                    
                    // Open in new tab using data URL
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    chrome.tabs.create({ url });
                });
            } catch (error) {
                this.showError('Failed to get bookmark data');
                console.error('Debug Bookmark Data Error:', error);
            }
        });
    }

    private async updateUI(): Promise<void> {
        try {
            const data = await this.getStorageData();
            this.updateAuthUI(data);
            this.updateSyncInfo(data);
            await this.updateStats(data);
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

    private async updateStats(data: any): Promise<void> {
        // Get local bookmarks and folders count
        chrome.bookmarks.getTree((bookmarkItems) => {
            if (!bookmarkItems) {
                console.warn('chrome.bookmarks.getTree returned undefined in updateStats');
                this.localBookmarksCountElement.textContent = '0';
                this.localFoldersCountElement.textContent = '0';
                return;
            }
            const bookmarkCount = this.countBookmarks(bookmarkItems);
            const folderCount = this.countFolders(bookmarkItems);
            this.localBookmarksCountElement.textContent = bookmarkCount.toString();
            this.localFoldersCountElement.textContent = folderCount.toString();
        });

        const isAuthed = Boolean(data?.auth?.token);
        if (!isAuthed) {
            this.setInitialSyncUI(false);
            this.pendingBookmarksCountElement.textContent = '0';
            this.pendingFoldersCountElement.textContent = '0';
            this.remoteChangeBookmarksCountElement.textContent = '0';
            this.remoteChangeFoldersCountElement.textContent = '0';
            this.remoteBookmarksCountElement.textContent = '0';
            this.remoteFoldersCountElement.textContent = '0';
            return;
        }

        try {
            const syncStatus = await this.getSyncStatus().catch(() => null);
            const isInitialSync = Boolean(syncStatus?.data?.isInitialSync);
            this.setInitialSyncUI(isInitialSync);

            if (syncStatus?.success) {
                const local = syncStatus.data?.local || {};
                const remote = syncStatus.data?.remote || {};
                
                // Count local pending changes (these are not split by type in the current API)
                // For now, we'll show the total in bookmarks and 0 in folders
                const localCount = (local.adds || 0) + (local.updates || 0) + (local.moves || 0) + (local.deletes || 0);
                this.pendingBookmarksCountElement.textContent = localCount.toString();
                this.pendingFoldersCountElement.textContent = '0';
                
                // Remote changes from server - now split by type
                const remoteBookmarkCount = (remote.adds || 0) + (remote.updates || 0) + (remote.moves || 0) + (remote.deletes || 0);
                const remoteFolderCount = (remote.addsFolders || 0) + (remote.updatesFolders || 0) + (remote.deletesFolders || 0);
                this.remoteChangeBookmarksCountElement.textContent = remoteBookmarkCount.toString();
                this.remoteChangeFoldersCountElement.textContent = remoteFolderCount.toString();
            } else {
                this.pendingBookmarksCountElement.textContent = '0';
                this.pendingFoldersCountElement.textContent = '0';
                this.remoteChangeBookmarksCountElement.textContent = '0';
                this.remoteChangeFoldersCountElement.textContent = '0';
            }

            if (isInitialSync) {
                this.remoteChangeBookmarksCountElement.textContent = '0';
                this.remoteChangeFoldersCountElement.textContent = '0';
                this.remoteBookmarksCountElement.textContent = '0';
                this.remoteFoldersCountElement.textContent = '0';
                return;
            }

            const masterSummary = await this.getMasterCollectionSummary().catch(() => null);

            if (masterSummary?.success) {
                const remoteBookmarks = masterSummary.data?.bookmarkCount ?? 0;
                const remoteFolders = masterSummary.data?.folderCount ?? 0;
                this.remoteBookmarksCountElement.textContent = remoteBookmarks.toString();
                this.remoteFoldersCountElement.textContent = remoteFolders.toString();
            } else {
                this.remoteBookmarksCountElement.textContent = '0';
                this.remoteFoldersCountElement.textContent = '0';
            }

            // Update sync button states based on pending changes
            const localChanges = parseInt(this.pendingBookmarksCountElement.textContent || '0') + 
                                parseInt(this.pendingFoldersCountElement.textContent || '0');
            const remoteChanges = parseInt(this.remoteChangeBookmarksCountElement.textContent || '0') + 
                                 parseInt(this.remoteChangeFoldersCountElement.textContent || '0');
            this.updateSyncButtonStates(localChanges, remoteChanges);
        } catch (error) {
            console.error('Failed to update remote stats:', error);
            this.pendingBookmarksCountElement.textContent = '0';
            this.pendingFoldersCountElement.textContent = '0';
            this.remoteChangeBookmarksCountElement.textContent = '0';
            this.remoteChangeFoldersCountElement.textContent = '0';
            this.remoteBookmarksCountElement.textContent = '0';
            this.remoteFoldersCountElement.textContent = '0';
            this.setInitialSyncUI(false);
        }
    }

    private setInitialSyncUI(isInitialSync: boolean): void {
        if (isInitialSync) {
            this.initialSyncNoticeElement?.classList.remove('hidden');
            this.statsContainerElement?.classList.add('hidden');
            this.actionsContainerElement?.classList.add('hidden');
            // For initial sync, show only the sync up button with special styling
            this.syncUpButton.textContent = '🚀 Run Initial Sync';
            this.syncUpButton.classList.add('initial-sync');
            this.syncUpButton.disabled = false;
            this.syncDownButton.style.display = 'none'; // Hide sync down button
        } else {
            this.initialSyncNoticeElement?.classList.add('hidden');
            this.statsContainerElement?.classList.remove('hidden');
            this.actionsContainerElement?.classList.remove('hidden');
            this.syncUpButton.textContent = '⬆️ Sync Up';
            this.syncUpButton.classList.remove('initial-sync');
            this.syncDownButton.style.display = ''; // Show sync down button again
        }
    }

    private updateSyncButtonStates(localChanges: number, remoteChanges: number): void {
        // Enable Sync Up only if there are local changes to push
        this.syncUpButton.disabled = localChanges === 0;
        // Enable Sync Down only if there are remote changes to pull
        this.syncDownButton.disabled = remoteChanges === 0;
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

    private countFolders(bookmarkItems: chrome.bookmarks.BookmarkTreeNode[]): number {
        let count = 0;
        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
            if (node.id !== '0' && !node.url) {
                count++;
            }
            if (node.children) {
                node.children.forEach(processNode);
            }
        };
        bookmarkItems.forEach(processNode);
        return count;
    }

    private async handleSyncUp(): Promise<void> {
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

            // Trigger sync (push local changes up)
            const syncResult = await this.triggerSync();
            if (syncResult.success) {
                this.showSuccess('Local changes synced to master');
                this.updateUI();
            } else {
                throw new Error(syncResult.error?.message || 'Sync failed');
            }
        } catch (error) {
            this.showError((error as Error).message);
        }
    }

    private async handleSyncDown(): Promise<void> {
        try {
            // Get remote changes and apply them locally
            const result = await this.sendMessage({ action: 'syncNow' });
            if (result.success) {
                this.showSuccess('Remote changes applied locally');
                await this.updateUI();
            } else {
                throw new Error(result.error?.message || 'Sync down failed');
            }
        } catch (error) {
            this.showError((error as Error).message);
        }
    }

    private getTotalBookmarkCount(): Promise<number> {
        return new Promise((resolve) => {
            chrome.bookmarks.getTree((bookmarkItems) => {
                if (!bookmarkItems) {
                    console.warn('chrome.bookmarks.getTree returned undefined');
                    resolve(0);
                    return;
                }
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

    private async getMasterCollectionSummary(): Promise<any> {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getMasterCollectionSummary' }, (response) => {
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

    private updateAuthUI(data: any): void {
        const auth = data?.auth;
        const isAuthed = Boolean(auth?.token);

        if (isAuthed) {
            this.authLoggedOut.classList.add('hidden');
            this.authLoggedIn.classList.remove('hidden');
            this.authUserEmail.textContent = auth.user?.email || 'Unknown user';
        } else {
            this.authLoggedIn.classList.add('hidden');
            this.authLoggedOut.classList.remove('hidden');
            this.authUserEmail.textContent = '';
        }

        // Disable sync buttons if not authenticated (actual enable/disable based on changes is in updateSyncButtonStates)
        if (!isAuthed) {
            this.syncUpButton.disabled = true;
            this.syncDownButton.disabled = true;
        }
        if (this.overwriteButton) this.overwriteButton.disabled = !isAuthed;
        if (this.openManagerButton) this.openManagerButton.disabled = !isAuthed;
    }

    private async handleGoogleLogin(): Promise<void> {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const response = await fetch(`${this.apiBase}/api/v1/auth/google`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ accessToken })
            });

            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.error?.message || 'Google login failed');
            }

            const setAuthResult = await this.sendMessage({ action: 'setAuth', data: payload.data });
            if (!setAuthResult?.success) {
                throw new Error(setAuthResult?.error?.message || 'Failed to store authentication');
            }
            this.showSuccess('Signed in with Google');
            await this.updateUI();
            await this.checkOnboardingNeeded();
        } catch (error) {
            this.showError(error instanceof Error ? error.message : 'Google login failed');
        }
    }

    private async handleEmailAuth(mode: 'login' | 'register'): Promise<void> {
        try {
            const email = this.emailInput.value.trim();
            const password = this.passwordInput.value;

            if (!email || !password) {
                throw new Error('Email and password are required');
            }

            const endpoint = mode === 'register' ? '/api/v1/auth/register' : '/api/v1/auth/login';
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.error?.message || 'Authentication failed');
            }

            const setAuthResult = await this.sendMessage({ action: 'setAuth', data: payload.data });
            if (!setAuthResult?.success) {
                throw new Error(setAuthResult?.error?.message || 'Failed to store authentication');
            }
            this.passwordInput.value = '';
            this.showSuccess(mode === 'register' ? 'Account created' : 'Logged in');
            await this.updateUI();
            await this.checkOnboardingNeeded();
        } catch (error) {
            this.showError(error instanceof Error ? error.message : 'Authentication failed');
        }
    }

    private async handleLogout(): Promise<void> {
        try {
            const clearAuthResult = await this.sendMessage({ action: 'clearAuth' });
            if (!clearAuthResult?.success) {
                throw new Error(clearAuthResult?.error?.message || 'Failed to log out');
            }
            this.showSuccess('Logged out');
            await this.updateUI();
        } catch (error) {
            this.showError(error instanceof Error ? error.message : 'Failed to log out');
        }
    }

    private async checkOnboardingNeeded(): Promise<void> {
        try {
            console.log('[Onboarding] Starting onboarding check...');
            
            // Check if already shown this session
            if (this.onboardingChecked) {
                console.log('[Onboarding] Already checked this session, skipping');
                return;
            }

            // Check if user is logged in
            const storageData = await this.getStorageData();
            console.log('[Onboarding] Storage data:', JSON.stringify(storageData, null, 2));
            
            const isLoggedIn = storageData?.auth?.token;
            if (!isLoggedIn) {
                console.log('[Onboarding] Not logged in, skipping');
                return;
            }
            console.log('[Onboarding] User is logged in');

            // Check if this browser has synced before (lastSync must be a valid timestamp)
            const lastSyncValue = storageData?.lastSync;
            console.log('[Onboarding] lastSync value:', lastSyncValue, 'type:', typeof lastSyncValue);
            
            const hasLocalSync = typeof lastSyncValue === 'number' && lastSyncValue > 0;
            if (hasLocalSync) {
                console.log('[Onboarding] Browser has synced before (lastSync=' + lastSyncValue + '), no onboarding needed');
                this.onboardingChecked = true;
                return;
            }
            console.log('[Onboarding] Browser has NEVER synced - continuing to check master');

            // Get sync status to check if master collection exists
            const statusResponse = await this.sendMessage({ action: 'getSyncStatus' });
            console.log('[Onboarding] Sync status response:', statusResponse);
            
            if (!statusResponse?.success) {
                console.log('[Onboarding] Failed to get sync status');
                return;
            }

            // If initial sync is needed (no master collection), the existing UI handles it
            if (statusResponse.data?.isInitialSync) {
                console.log('[Onboarding] No master collection exists - initial sync UI will handle');
                this.onboardingChecked = true;
                return;
            }

            // Master collection exists and this browser hasn't synced - show onboarding!
            console.log('[Onboarding] Master exists, browser never synced - showing dialog');
            this.onboardingChecked = true;
            
            // Get master collection summary
            const masterSummary = await this.getMasterCollectionSummary();
            if (!masterSummary?.success) {
                console.log('Failed to get master collection summary');
                return;
            }

            // Get local counts
            const localBookmarkCount = await this.getTotalBookmarkCount();
            const localFolderCount = await this.getTotalFolderCount();

            const info: OnboardingInfo = {
                masterBookmarkCount: masterSummary.data?.bookmarkCount ?? 0,
                masterFolderCount: masterSummary.data?.folderCount ?? 0,
                localBookmarkCount,
                localFolderCount
            };

            const choice = await this.onboardingDialog.showOnboarding(info);
            
            if (choice === 'overwrite') {
                this.showSuccess('Overwriting local bookmarks from master...');
                const result = await this.sendMessage({ action: 'overwriteFromMaster' });
                if (result?.success) {
                    this.showSuccess('Local bookmarks replaced with master collection');
                } else {
                    this.showError(result?.error || 'Overwrite failed');
                }
            } else if (choice === 'merge') {
                this.showSuccess('Merging local bookmarks into master...');
                const result = await this.sendMessage({ action: 'mergeIntoMaster' });
                if (result?.success) {
                    const data = result.data;
                    this.showSuccess(`Merged: ${data?.bookmarksCreated ?? 0} bookmarks, ${data?.foldersCreated ?? 0} folders added`);
                } else {
                    this.showError(result?.error || 'Merge failed');
                }
            }
            // 'cancel' - do nothing

            await this.updateUI();
        } catch (error) {
            console.error('Onboarding check error:', error);
        }
    }

    private getTotalFolderCount(): Promise<number> {
        return new Promise((resolve) => {
            chrome.bookmarks.getTree((bookmarkItems) => {
                if (!bookmarkItems) {
                    console.warn('chrome.bookmarks.getTree returned undefined');
                    resolve(0);
                    return;
                }
                const count = this.countFolders(bookmarkItems);
                resolve(count);
            });
        });
    }

    private getGoogleAccessToken(): Promise<string> {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    reject(new Error(chrome.runtime.lastError?.message || 'Google authorization failed'));
                    return;
                }
                resolve(token);
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

    private extractBookmarkData(node: chrome.bookmarks.BookmarkTreeNode): { 
        folders: any[], 
        bookmarks: any[], 
        rawTree: any 
    } {
        const folders: any[] = [];
        const bookmarks: any[] = [];

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode, depth: number = 0) => {
            const nodeInfo = {
                id: node.id,
                title: node.title,
                parentId: node.parentId,
                index: node.index,
                dateAdded: node.dateAdded,
                depth: depth
            };

            if (node.id !== '0') {
                if (node.url) {
                    bookmarks.push({
                        ...nodeInfo,
                        url: node.url
                    });
                } else {
                    folders.push(nodeInfo);
                }
            }

            if (node.children) {
                node.children.forEach(child => processNode(child, depth + 1));
            }
        };

        processNode(node);

        // Create a simplified raw tree for viewing structure
        const simplifyTree = (node: chrome.bookmarks.BookmarkTreeNode): any => {
            const simplified: any = {
                id: node.id,
                title: node.title || '(root)',
                parentId: node.parentId
            };
            if (node.url) {
                simplified.url = node.url;
            }
            if (node.children && node.children.length > 0) {
                simplified.children = node.children.slice(0, 5).map(simplifyTree);
                if (node.children.length > 5) {
                    simplified.children.push({ '...': `${node.children.length - 5} more items` });
                }
            }
            return simplified;
        };

        return { folders, bookmarks, rawTree: simplifyTree(node) };
    }

    private createDebugHtml(data: any): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>BookMarx Debug - Bookmark Data</title>
    <style>
        body { 
            font-family: 'Consolas', 'Monaco', monospace; 
            padding: 20px; 
            background: #1e1e1e; 
            color: #d4d4d4;
            line-height: 1.5;
        }
        h1, h2, h3 { color: #569cd6; margin-top: 30px; }
        h1 { border-bottom: 2px solid #569cd6; padding-bottom: 10px; }
        .summary { 
            background: #2d2d2d; 
            padding: 15px; 
            border-radius: 8px; 
            margin: 20px 0;
            border-left: 4px solid #4ec9b0;
        }
        .summary-item { margin: 5px 0; }
        .summary-label { color: #9cdcfe; }
        .summary-value { color: #ce9178; font-weight: bold; }
        table { 
            border-collapse: collapse; 
            width: 100%; 
            margin: 15px 0;
            background: #252526;
        }
        th, td { 
            border: 1px solid #3c3c3c; 
            padding: 10px; 
            text-align: left; 
        }
        th { 
            background: #333333; 
            color: #4ec9b0;
            position: sticky;
            top: 0;
        }
        tr:hover { background: #2a2d2e; }
        .id { color: #b5cea8; }
        .title { color: #ce9178; }
        .parent { color: #dcdcaa; }
        .url { color: #569cd6; font-size: 0.9em; max-width: 400px; overflow: hidden; text-overflow: ellipsis; }
        pre { 
            background: #252526; 
            padding: 15px; 
            border-radius: 8px; 
            overflow-x: auto;
            border: 1px solid #3c3c3c;
        }
        .highlight { background: #4a4a00; }
        .depth-0 { font-weight: bold; color: #4ec9b0; }
        .depth-1 { padding-left: 20px; }
        .depth-2 { padding-left: 40px; }
        .copy-btn {
            background: #0e639c;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            margin-left: 10px;
        }
        .copy-btn:hover { background: #1177bb; }
        .note { 
            background: #3c2a00; 
            border-left: 4px solid #cca700; 
            padding: 10px 15px; 
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <h1>BookMarx Debug - Bookmark Data Structure</h1>
    
    <div class="summary">
        <div class="summary-item"><span class="summary-label">Browser:</span> <span class="summary-value">${JSON.stringify(data.browser)}</span></div>
        <div class="summary-item"><span class="summary-label">Timestamp:</span> <span class="summary-value">${data.timestamp}</span></div>
        <div class="summary-item"><span class="summary-label">Total Folders:</span> <span class="summary-value">${data.summary.totalFolders}</span></div>
        <div class="summary-item"><span class="summary-label">Total Bookmarks:</span> <span class="summary-value">${data.summary.totalBookmarks}</span></div>
    </div>

    <div class="note">
        <strong>Key IDs to look for:</strong><br>
        <strong>Chrome:</strong> "0" (root), "1" (Bookmarks Bar), "2" (Other Bookmarks)<br>
        <strong>Firefox:</strong> "root________", "toolbar_____" (Bookmarks Toolbar), "menu________" (Bookmarks Menu), "unfiled_____" (Other Bookmarks)
    </div>

    <h2>Folders (${data.folders.length} total)</h2>
    <p>These are the folders that would be sent to the server during sync/merge:</p>
    <table>
        <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Parent ID</th>
            <th>Index</th>
            <th>Depth</th>
        </tr>
        ${data.folders.map((f: any) => `
        <tr class="${f.depth <= 1 ? 'highlight' : ''}">
            <td class="id">${f.id}</td>
            <td class="title depth-${Math.min(f.depth, 2)}">${f.title || '(unnamed)'}</td>
            <td class="parent">${f.parentId || '(none)'}</td>
            <td>${f.index ?? '-'}</td>
            <td>${f.depth}</td>
        </tr>
        `).join('')}
    </table>

    <h2>Sample Bookmarks (first 50 of ${data.summary.totalBookmarks})</h2>
    <table>
        <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Parent ID</th>
            <th>URL</th>
        </tr>
        ${data.bookmarks.map((b: any) => `
        <tr>
            <td class="id">${b.id}</td>
            <td class="title">${b.title || '(unnamed)'}</td>
            <td class="parent">${b.parentId || '(none)'}</td>
            <td class="url">${b.url}</td>
        </tr>
        `).join('')}
    </table>

    <h2>Raw Tree Structure (truncated)</h2>
    <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('rawJson').textContent)">Copy JSON</button>
    <pre id="rawJson">${JSON.stringify(data.rawTree, null, 2)}</pre>

    <h2>Full Folder Data (for copying)</h2>
    <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('foldersJson').textContent)">Copy Folders JSON</button>
    <pre id="foldersJson">${JSON.stringify(data.folders, null, 2)}</pre>

</body>
</html>`;
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});
