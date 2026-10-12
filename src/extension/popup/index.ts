import { SyncConfirmDialog } from '../components/SyncConfirmDialog';
import { OnboardingDialog, OnboardingInfo, CollectionInfo, OnboardingResult } from '../components/OnboardingDialog';
import { SwitchConfirmDialog } from '../components/SwitchConfirmDialog';
import { API_BASE_URL, WEBSITE_BASE_URL } from '../config';

class PopupManager {
    private syncUpButton: HTMLButtonElement;
    private syncDownButton: HTMLButtonElement;
    private lastSyncElement: HTMLElement;
    private localBookmarksCountElement: HTMLElement;
    private localFoldersCountElement: HTMLElement;
    private remoteBookmarksCountElement: HTMLElement;
    private remoteFoldersCountElement: HTMLElement;
    private pendingUpCountElement: HTMLElement;
    private pendingDownCountElement: HTMLElement;
    private initialSyncNoticeElement: HTMLElement;
    private statsContainerElement: HTMLElement;
    private actionsContainerElement: HTMLElement;
    private syncStatusElement: HTMLElement;
    private errorContainer: HTMLElement;
    private syncConfirmDialog: SyncConfirmDialog;
    private onboardingDialog: OnboardingDialog;
    private switchConfirmDialog: SwitchConfirmDialog;
    private authLoggedOut: HTMLElement;
    private authLoggedIn: HTMLElement;
    private authUserEmail: HTMLElement;
    private googleLoginButton: HTMLButtonElement;
    private emailLoginButton: HTMLButtonElement;
    private emailRegisterButton: HTMLButtonElement;
    private logoutButton: HTMLButtonElement;
    private emailInput: HTMLInputElement;
    private passwordInput: HTMLInputElement;
    private togglePasswordButton: HTMLButtonElement;
    private overwriteButton: HTMLButtonElement;
    private openManagerButton: HTMLButtonElement;
    private collectionUsageElement: HTMLElement;
    private collectionLimitElement: HTMLElement;
    private collectionTrigger: HTMLButtonElement;
    private collectionDropdown: HTMLElement;
    private collectionNameElement: HTMLElement;
    private themeToggle: HTMLButtonElement;
    private userAvatar: HTMLElement;
    private usageFooter: HTMLElement;
    private readonly apiBase = API_BASE_URL;
    private onboardingChecked: boolean = false;
    private collectionDropdownOpen: boolean = false;

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
        this.switchConfirmDialog = new SwitchConfirmDialog();
        this.initializeElements();
        this.attachEventListeners();
        this.initializeTheme();
        this.updateUI();
        this.checkOnboardingNeeded();
    }

    private initializeElements(): void {
        this.syncUpButton = document.getElementById('syncUp') as HTMLButtonElement;
        this.syncDownButton = document.getElementById('syncDown') as HTMLButtonElement;
        this.lastSyncElement = document.getElementById('lastSync') as HTMLElement;
        this.localBookmarksCountElement = document.getElementById('localBookmarksCount') as HTMLElement;
        this.localFoldersCountElement = document.getElementById('localFoldersCount') as HTMLElement;
        this.remoteBookmarksCountElement = document.getElementById('remoteBookmarksCount') as HTMLElement;
        this.remoteFoldersCountElement = document.getElementById('remoteFoldersCount') as HTMLElement;
        this.pendingUpCountElement = document.getElementById('pendingUpCount') as HTMLElement;
        this.pendingDownCountElement = document.getElementById('pendingDownCount') as HTMLElement;
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
        this.togglePasswordButton = document.getElementById('togglePassword') as HTMLButtonElement;
        this.overwriteButton = document.getElementById('overwriteFromMaster') as HTMLButtonElement;
        this.openManagerButton = document.getElementById('openManager') as HTMLButtonElement;
        this.collectionUsageElement = document.getElementById('collectionUsage') as HTMLElement;
        this.collectionLimitElement = document.getElementById('collectionLimit') as HTMLElement;
        this.collectionTrigger = document.getElementById('collectionTrigger') as HTMLButtonElement;
        this.collectionDropdown = document.getElementById('collectionDropdown') as HTMLElement;
        this.collectionNameElement = document.getElementById('collectionName') as HTMLElement;
        this.themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;
        this.userAvatar = document.getElementById('userAvatar') as HTMLElement;
        this.usageFooter = document.getElementById('usageFooter') as HTMLElement;
    }

    private attachEventListeners(): void {
        this.syncUpButton.addEventListener('click', () => this.handleSyncUp());
        this.syncDownButton.addEventListener('click', () => this.handleSyncDown());
        this.googleLoginButton?.addEventListener('click', () => this.handleGoogleLogin());
        this.emailLoginButton?.addEventListener('click', () => this.handleEmailAuth('login'));
        this.emailRegisterButton?.addEventListener('click', () => this.handleEmailAuth('register'));
        this.logoutButton?.addEventListener('click', () => this.handleLogout());
        this.themeToggle?.addEventListener('click', () => this.toggleTheme());
        this.togglePasswordButton?.addEventListener('click', () => this.togglePasswordVisibility());

        // Collection selector
        this.collectionTrigger?.addEventListener('click', () => this.toggleCollectionDropdown());

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.collectionDropdownOpen &&
                !this.collectionTrigger?.contains(e.target as Node) &&
                !this.collectionDropdown?.contains(e.target as Node)) {
                this.closeCollectionDropdown();
            }
        });

        // Debug toggle
        document.getElementById('debugToggle')?.addEventListener('click', () => {
            const panel = document.getElementById('debugPanel');
            if (panel) {
                panel.classList.toggle('hidden');
            }
        });

        document.getElementById('overwriteFromMaster')?.addEventListener('click', async () => {
            try {
                const response = await this.sendMessage({ action: 'getMasterCollectionSummary' });
                if (!response.success) {
                    throw new Error(response.error?.message || 'Failed to get master collection summary');
                }

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
                    await this.updateUI();
                } catch (error) {
                    this.showError('Failed to clear storage');
                    console.error('Clear Storage Error:', error);
                }
            }
        });

        document.getElementById('debugBookmarkData')?.addEventListener('click', async () => {
            try {
                chrome.bookmarks.getTree(async (tree) => {
                    if (!tree || tree.length === 0) {
                        this.showError('Could not get bookmark tree');
                        return;
                    }

                    const { folders, bookmarks, rawTree } = this.extractBookmarkData(tree[0]);
                    const browserInfo = await this.sendMessage({ action: 'getBrowserInfo' });

                    const debugData = {
                        browser: browserInfo?.data || 'Unknown',
                        timestamp: new Date().toISOString(),
                        summary: {
                            totalFolders: folders.length,
                            totalBookmarks: bookmarks.length
                        },
                        folders: folders,
                        bookmarks: bookmarks.slice(0, 50),
                        rawTree: rawTree
                    };

                    chrome.storage.local.set({ debugBookmarkData: debugData }, () => {
                        const url = chrome.runtime.getURL('popup/debug.html');
                        chrome.tabs.create({ url });
                    });
                });
            } catch (error) {
                this.showError('Failed to get bookmark data');
                console.error('Debug Bookmark Data Error:', error);
            }
        });
    }

    // Theme management
    private initializeTheme(): void {
        const stored = localStorage.getItem('bookmarx-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = stored === 'dark' || (!stored && prefersDark);
        this.applyTheme(isDark);
    }

    private toggleTheme(): void {
        const isDark = document.body.classList.contains('dark');
        this.applyTheme(!isDark);
        localStorage.setItem('bookmarx-theme', !isDark ? 'dark' : 'light');
    }

    private togglePasswordVisibility(): void {
        const eyeIcon = this.togglePasswordButton.querySelector('.eye-icon') as SVGElement;
        const eyeOffIcon = this.togglePasswordButton.querySelector('.eye-off-icon') as SVGElement;
        
        if (this.passwordInput.type === 'password') {
            this.passwordInput.type = 'text';
            eyeIcon.classList.add('hidden');
            eyeOffIcon.classList.remove('hidden');
            this.togglePasswordButton.title = 'Hide password';
        } else {
            this.passwordInput.type = 'password';
            eyeIcon.classList.remove('hidden');
            eyeOffIcon.classList.add('hidden');
            this.togglePasswordButton.title = 'Show password';
        }
    }

    private applyTheme(dark: boolean): void {
        if (dark) {
            document.body.classList.add('dark');
            if (this.themeToggle) this.themeToggle.textContent = '🌙';
        } else {
            document.body.classList.remove('dark');
            if (this.themeToggle) this.themeToggle.textContent = '☀️';
        }
    }

    // Collection selector
    private async toggleCollectionDropdown(): Promise<void> {
        if (this.collectionDropdownOpen) {
            this.closeCollectionDropdown();
            return;
        }

        this.collectionTrigger.classList.add('open');
        this.collectionDropdownOpen = true;
        this.collectionDropdown.classList.remove('hidden');
        this.collectionDropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--ink-muted); font-size: 12px;">Loading...</div>';

        try {
            const result = await this.sendMessage({ action: 'listCollections' });
            const currentCollection = await this.sendMessage({ action: 'getCurrentCollection' });
            const currentId = currentCollection?.data?.collectionId || null;

            if (!result?.success || !result.data?.collections) {
                this.collectionDropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--ink-muted); font-size: 12px;">Failed to load collections</div>';
                return;
            }

            const collections = result.data.collections;
            this.collectionDropdown.innerHTML = '';

            for (const coll of collections) {
                const btn = document.createElement('button');
                btn.className = 'collection-option';
                if ((coll.isDefault && !currentId) || coll.id === currentId) {
                    btn.classList.add('active');
                }

                const nameSpan = document.createElement('span');
                nameSpan.textContent = coll.name;

                btn.appendChild(nameSpan);

                if (coll.isDefault) {
                    const badge = document.createElement('span');
                    badge.className = 'collection-option-badge';
                    badge.textContent = 'Default';
                    btn.appendChild(badge);
                }

                btn.addEventListener('click', () => this.handleCollectionSelect(coll.id, coll.name, coll.isDefault));
                this.collectionDropdown.appendChild(btn);
            }
        } catch (error) {
            console.error('Failed to load collections:', error);
            this.collectionDropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--ink-muted); font-size: 12px;">Error loading collections</div>';
        }
    }

    private closeCollectionDropdown(): void {
        this.collectionDropdownOpen = false;
        this.collectionTrigger?.classList.remove('open');
        this.collectionDropdown?.classList.add('hidden');
    }

    private async handleCollectionSelect(collectionId: string, collectionName: string, isDefault: boolean): Promise<void> {
        this.closeCollectionDropdown();

        const currentCollection = await this.sendMessage({ action: 'getCurrentCollection' });
        const currentId = currentCollection?.data?.collectionId || null;

        // If selecting the same collection, do nothing
        if (collectionId === currentId || (isDefault && !currentId)) {
            return;
        }

        // Check for pending changes before switching
        try {
            const syncStatus = await this.getSyncStatus().catch(() => null);
            if (syncStatus?.success) {
                const local = syncStatus.data?.local || {};
                const localChanges = (local.adds || 0) + (local.updates || 0) + (local.moves || 0) + (local.deletes || 0) +
                    (local.addsFolders || 0) + (local.updatesFolders || 0) + (local.deletesFolders || 0);

                if (localChanges > 0) {
                    const choice = await this.switchConfirmDialog.show(localChanges, collectionName);
                    if (choice === 'cancel') return;
                    if (choice === 'sync') {
                        this.showSuccess('Syncing current changes...');
                        const syncResult = await this.triggerSync();
                        if (!syncResult.success) {
                            this.showError('Sync failed: ' + (syncResult.error?.message || 'Unknown error'));
                            return;
                        }
                    }
                    // 'discard' - proceed directly, switchCollection clears queued changes
                }
            }
        } catch (error) {
            console.error('Error checking pending changes:', error);
        }

        // Perform the switch
        this.showSuccess(`Switching to ${collectionName}...`);
        try {
            const result = await this.sendMessage({
                action: 'switchCollection',
                data: { collectionId, collectionName }
            });

            if (result?.success) {
                this.showSuccess(`Switched to ${collectionName}`);
                if (this.collectionNameElement) {
                    this.collectionNameElement.textContent = collectionName;
                }
                await this.updateUI();
            } else {
                this.showError(result?.error || 'Failed to switch collection');
            }
        } catch (error) {
            this.showError('Failed to switch collection');
            console.error('Collection switch error:', error);
        }
    }

    private async updateUI(): Promise<void> {
        try {
            const data = await this.getStorageData();
            this.updateAuthUI(data);
            this.updateSyncInfo(data);
            await this.updateStats(data);
            await this.updateCollectionName();
        } catch (error) {
            this.showError('Failed to load extension data');
        }
    }

    private async updateCollectionName(): Promise<void> {
        try {
            const result = await this.sendMessage({ action: 'getCurrentCollection' });
            if (result?.success && this.collectionNameElement) {
                this.collectionNameElement.textContent = result.data?.collectionName || 'Master Collection';
            }
        } catch (error) {
            // Silently fail - keep the current name
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
            this.lastSyncElement.textContent = this.formatDate(lastSyncDate);
        } else {
            this.lastSyncElement.textContent = 'Never synced';
        }

        this.syncStatusElement.className = 'sync-status';
        if (data.syncInProgress) {
            this.syncStatusElement.classList.add('syncing');
        } else if (data.syncError) {
            this.syncStatusElement.classList.add('error');
        }
    }

    private async updateStats(data: any): Promise<void> {
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
            this.pendingUpCountElement.textContent = '0';
            this.pendingDownCountElement.textContent = '0';
            this.remoteBookmarksCountElement.textContent = '0';
            this.remoteFoldersCountElement.textContent = '0';
            return;
        }

        try {
            const syncStatus = await this.getSyncStatus().catch(() => null);
            const isInitialSync = Boolean(syncStatus?.data?.needsInitialSync);
            this.setInitialSyncUI(isInitialSync);

            let localChanges = 0;
            let remoteChanges = 0;

            if (syncStatus?.success) {
                const local = syncStatus.data?.local || {};
                const remote = syncStatus.data?.remote || {};

                localChanges = (local.adds || 0) + (local.updates || 0) + (local.moves || 0) + (local.deletes || 0) +
                    (local.addsFolders || 0) + (local.updatesFolders || 0) + (local.deletesFolders || 0);

                remoteChanges = (remote.adds || 0) + (remote.updates || 0) + (remote.moves || 0) + (remote.deletes || 0) +
                    (remote.addsFolders || 0) + (remote.updatesFolders || 0) + (remote.deletesFolders || 0);

                this.pendingUpCountElement.textContent = localChanges.toString();
                this.pendingDownCountElement.textContent = remoteChanges.toString();
            } else {
                this.pendingUpCountElement.textContent = '0';
                this.pendingDownCountElement.textContent = '0';
            }

            if (isInitialSync) {
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

            this.updateSyncButtonStates(localChanges, remoteChanges);
        } catch (error) {
            console.error('Failed to update remote stats:', error);
            this.pendingUpCountElement.textContent = '0';
            this.pendingDownCountElement.textContent = '0';
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
            this.syncUpButton.textContent = '⬆ Run Initial Sync';
            this.syncUpButton.classList.add('initial-sync');
            this.syncUpButton.disabled = false;
            this.syncDownButton.style.display = 'none';
        } else {
            this.initialSyncNoticeElement?.classList.add('hidden');
            this.statsContainerElement?.classList.remove('hidden');
            this.actionsContainerElement?.classList.remove('hidden');
            this.syncUpButton.textContent = '⬆ Sync Up';
            this.syncUpButton.classList.remove('initial-sync');
            this.syncDownButton.style.display = '';
        }
    }

    private updateSyncButtonStates(localChanges: number, remoteChanges: number): void {
        this.syncUpButton.disabled = localChanges === 0;
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
            const response = await this.getSyncStatus();
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to get sync status');
            }

            let summary = response.data;
            if (summary.needsInitialSync) {
                const bookmarkCount = await this.getTotalBookmarkCount();
                summary = {
                    ...summary,
                    isInitialSync: true,
                    local: {
                        adds: bookmarkCount,
                        updates: 0,
                        moves: 0,
                        deletes: 0
                    }
                };
            }

            const confirmed = await this.syncConfirmDialog.showConfirmation(summary);
            if (!confirmed) return;

            const syncResult = await this.triggerSync();
            if (syncResult.success) {
                this.showSuccess('Local changes synced to master');
                this.updateUI();
            } else {
                const errorMessage = syncResult.error?.message || 'Sync failed';
                const upgradeUrl = syncResult.error?.upgradeUrl;
                this.showError(errorMessage, upgradeUrl);
            }
        } catch (error) {
            this.showError((error as Error).message);
        }
    }

    private async handleSyncDown(): Promise<void> {
        try {
            // Fetch sync status to build a confirmation summary of incoming remote changes.
            const statusResponse = await this.getSyncStatus().catch(() => null);
            const remote = statusResponse?.data?.remote || {};
            const remoteAdds = (remote.adds || 0) + (remote.addsFolders || 0);
            const remoteUpdates = (remote.updates || 0) + (remote.updatesFolders || 0);
            const remoteMoves = remote.moves || 0;
            const remoteDeletes = (remote.deletes || 0) + (remote.deletesFolders || 0);
            const remoteTotal = remoteAdds + remoteUpdates + remoteMoves + remoteDeletes;

            // Build a SyncSummary highlighting what is about to come down from the server.
            const summary = {
                isSyncDown: true,
                local: { adds: 0, updates: 0, moves: 0, deletes: 0 },
                remote: {
                    adds: remoteAdds,
                    updates: remoteUpdates,
                    moves: remoteMoves,
                    deletes: remoteDeletes
                }
            };

            // If we have nothing to pull, skip the dialog and inform the user.
            if (remoteTotal === 0) {
                this.showSuccess('Already up to date with master collection');
                await this.updateUI();
                return;
            }

            const confirmed = await this.syncConfirmDialog.showConfirmation(summary);
            if (!confirmed) return;

            this.syncDownButton.disabled = true;
            this.syncDownButton.textContent = '⏳ Syncing...';

            const result = await this.sendMessage({ action: 'syncDown' });

            if (result.success) {
                const applied = result.data?.applied;
                const total = (applied?.creates?.folders || 0) + (applied?.creates?.bookmarks || 0) +
                    (applied?.updates?.folders || 0) + (applied?.updates?.bookmarks || 0) +
                    (applied?.deletes?.folders || 0) + (applied?.deletes?.bookmarks || 0);

                if (total > 0) {
                    this.showSuccess(`Applied ${total} changes from master collection`);
                } else {
                    this.showSuccess('Already up to date with master collection');
                }
                await this.updateUI();
            } else {
                throw new Error(result.error || 'Sync down failed');
            }
        } catch (error) {
            this.showError((error as Error).message);
        } finally {
            this.syncDownButton.textContent = '⬇ Sync Down';
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

            // Set avatar initial
            if (this.userAvatar) {
                const email = auth.user?.email || '?';
                this.userAvatar.textContent = email.charAt(0).toUpperCase();
            }

            this.updatePremiumUI(auth.user);
            this.usageFooter?.classList.remove('hidden');
        } else {
            this.authLoggedIn.classList.add('hidden');
            this.authLoggedOut.classList.remove('hidden');
            this.authUserEmail.textContent = '';
            this.usageFooter?.classList.add('hidden');
        }

        if (!isAuthed) {
            this.syncUpButton.disabled = true;
            this.syncDownButton.disabled = true;
        }
        if (this.overwriteButton) this.overwriteButton.disabled = !isAuthed;
        if (this.openManagerButton) this.openManagerButton.disabled = !isAuthed;
    }

    private updatePremiumUI(user: any): void {
        const tierBadge = document.getElementById('tierBadge');
        const bookmarkUsage = document.getElementById('bookmarkUsage');
        const bookmarkLimit = document.getElementById('bookmarkLimit');
        const browserUsage = document.getElementById('browserUsage');
        const browserLimit = document.getElementById('browserLimit');
        const upgradeCta = document.getElementById('upgradeCta');
        const upgradeButton = document.getElementById('upgradeBtn');

        if (!tierBadge || !bookmarkUsage || !bookmarkLimit || !browserUsage || !browserLimit || !upgradeCta) {
            return;
        }

        const isPremium = user?.isPremium || user?.subscriptionTier === 'premium';
        const tier = isPremium ? 'premium' : 'free';

        tierBadge.textContent = tier === 'premium' ? 'Premium' : 'Free';
        tierBadge.className = `tier-badge tier-${tier}`;

        const userBookmarkLimit = user?.bookmarkLimit || 250;
        const userBrowserLimit = user?.browserLimit || 2;
        const userCollectionLimit = user?.collectionLimit || 1;

        bookmarkLimit.textContent = userBookmarkLimit >= 10000 ? '∞' : userBookmarkLimit.toString();
        browserLimit.textContent = userBrowserLimit >= 100 ? '∞' : userBrowserLimit.toString();

        if (this.collectionLimitElement) {
            this.collectionLimitElement.textContent = userCollectionLimit >= 100 ? '∞' : userCollectionLimit.toString();
        }

        this.fetchUsageStats(bookmarkUsage, browserUsage, this.collectionUsageElement, userBookmarkLimit, userBrowserLimit, userCollectionLimit);

        if (isPremium) {
            upgradeCta.classList.add('hidden');
        } else {
            upgradeCta.classList.remove('hidden');
        }

        if (upgradeButton && !upgradeButton.hasAttribute('data-listener-attached')) {
            upgradeButton.setAttribute('data-listener-attached', 'true');
            upgradeButton.addEventListener('click', () => {
                chrome.tabs.create({ url: `${WEBSITE_BASE_URL}/upgrade` });
            });
        }
    }

    private async fetchUsageStats(
        bookmarkUsageEl: HTMLElement,
        browserUsageEl: HTMLElement,
        collectionUsageEl: HTMLElement,
        bookmarkLimit: number,
        browserLimit: number,
        collectionLimit: number
    ): Promise<void> {
        try {
            const data = await this.getStorageData();
            const auth = data?.auth;
            if (!auth?.token) return;

            const response = await fetch(`${this.apiBase}/api/v1/user/stats`, {
                headers: {
                    'Authorization': `Bearer ${auth.token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    const bookmarkCount = result.data?.bookmarkCount || 0;
                    const browserCount = result.data?.browserCount || 0;

                    bookmarkUsageEl.textContent = bookmarkCount.toString();
                    browserUsageEl.textContent = browserCount.toString();
                    if (collectionUsageEl) {
                        collectionUsageEl.textContent = (result.data?.collectionCount || 0).toString();
                    }

                    this.applyLimitClass(bookmarkUsageEl, bookmarkCount, bookmarkLimit);
                    this.applyLimitClass(browserUsageEl, browserCount, browserLimit);
                    if (collectionUsageEl) {
                        this.applyLimitClass(collectionUsageEl, result.data?.collectionCount || 0, collectionLimit);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch usage stats:', error);
            bookmarkUsageEl.textContent = '-';
            browserUsageEl.textContent = '-';
            if (collectionUsageEl) collectionUsageEl.textContent = '-';
        }
    }

    private applyLimitClass(el: HTMLElement, count: number, limit: number): void {
        el.classList.remove('near-limit', 'at-limit');
        if (count >= limit) {
            el.classList.add('at-limit');
        } else if (count >= limit * 0.8) {
            el.classList.add('near-limit');
        }
    }

    private async handleGoogleLogin(): Promise<void> {
        try {
            chrome.runtime.sendMessage({ action: 'googleLogin' }, (response) => {
                if (response?.success) {
                    this.showSuccess('Signed in with Google');
                    this.updateUI();
                    this.checkOnboardingNeeded();
                } else if (response?.error) {
                    this.showError(response.error.message || 'Google login failed');
                }
            });
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

            if (this.onboardingChecked) {
                console.log('[Onboarding] Already checked this session, skipping');
                return;
            }

            const storageData = await this.getStorageData();
            const isLoggedIn = storageData?.auth?.token;
            if (!isLoggedIn) {
                console.log('[Onboarding] Not logged in, skipping');
                return;
            }

            const lastSyncValue = storageData?.lastSync;
            const hasLocalSync = typeof lastSyncValue === 'number' && lastSyncValue > 0;
            if (hasLocalSync) {
                console.log('[Onboarding] Browser has synced before, no onboarding needed');
                this.onboardingChecked = true;
                return;
            }
            console.log('[Onboarding] Browser has NEVER synced - continuing to check master');

            const statusResponse = await this.sendMessage({ action: 'getSyncStatus' });
            if (!statusResponse?.success) {
                console.log('[Onboarding] Failed to get sync status');
                return;
            }

            if (statusResponse.data?.needsInitialSync) {
                console.log('[Onboarding] No master collection exists - initial sync UI will handle');
                this.onboardingChecked = true;
                return;
            }

            console.log('[Onboarding] Master exists, browser never synced - checking if bookmarks match');
            this.onboardingChecked = true;

            const masterSummary = await this.getMasterCollectionSummary();
            if (!masterSummary?.success) {
                console.log('Failed to get master collection summary');
                return;
            }

            const localBookmarkCount = await this.getTotalBookmarkCount();
            const localFolderCount = await this.getTotalFolderCount();

            const masterBookmarkCount = masterSummary.data?.bookmarkCount ?? 0;
            const masterFolderCount = masterSummary.data?.folderCount ?? 0;

            if (localBookmarkCount === masterBookmarkCount && localFolderCount === masterFolderCount) {
                console.log('[Onboarding] Counts match - comparing URLs to check for exact match');
                const isMatch = await this.compareLocalWithMaster();
                if (isMatch) {
                    console.log('[Onboarding] Bookmarks are identical - auto-registering browser, skipping dialog');
                    const result = await this.sendMessage({ action: 'mergeIntoMaster' });
                    if (result?.success) {
                        this.showSuccess('Bookmarks already in sync with master collection');
                    } else {
                        console.warn('[Onboarding] Auto-merge failed, showing dialog instead:', result?.error);
                        await this.showOnboardingDialog(masterBookmarkCount, masterFolderCount, localBookmarkCount, localFolderCount);
                    }
                    await this.updateUI();
                    return;
                }
                console.log('[Onboarding] Counts match but URLs differ - showing dialog');
            }

            await this.showOnboardingDialog(masterBookmarkCount, masterFolderCount, localBookmarkCount, localFolderCount);
        } catch (error) {
            console.error('Onboarding check error:', error);
        }
    }

    private getTotalFolderCount(): Promise<number> {
        return new Promise((resolve) => {
            chrome.bookmarks.getTree((bookmarkItems) => {
                if (!bookmarkItems) {
                    resolve(0);
                    return;
                }
                const count = this.countFolders(bookmarkItems);
                resolve(count);
            });
        });
    }

    private async compareLocalWithMaster(): Promise<boolean> {
        try {
            const masterResponse = await this.sendMessage({ action: 'getMasterCollectionUrls' });
            if (!masterResponse?.success) {
                console.log('[Onboarding] Could not fetch master URLs for comparison');
                return false;
            }

            const masterUrls = new Set<string>(masterResponse.data.urls || []);

            const localUrls = await new Promise<Set<string>>((resolve) => {
                chrome.bookmarks.getTree((tree) => {
                    if (!tree || tree.length === 0) {
                        resolve(new Set());
                        return;
                    }
                    const urls = new Set<string>();
                    const walk = (node: chrome.bookmarks.BookmarkTreeNode) => {
                        if (node.url) urls.add(node.url.toLowerCase().trim());
                        if (node.children) node.children.forEach(walk);
                    };
                    walk(tree[0]);
                    resolve(urls);
                });
            });

            console.log(`[Onboarding] Comparing ${localUrls.size} local URLs vs ${masterUrls.size} master URLs`);

            if (localUrls.size !== masterUrls.size) return false;

            for (const url of localUrls) {
                if (!masterUrls.has(url)) {
                    console.log(`[Onboarding] URL mismatch - local has: ${url.substring(0, 60)}...`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('[Onboarding] Error comparing bookmarks:', error);
            return false;
        }
    }

    private async showOnboardingDialog(
        masterBookmarkCount: number,
        masterFolderCount: number,
        localBookmarkCount: number,
        localFolderCount: number
    ): Promise<void> {
        // Fetch user's collections
        let collections: CollectionInfo[] = [];
        let defaultCollectionId = '';
        try {
            const collectionsResult = await this.sendMessage({ action: 'listCollections' });
            const currentCollection = await this.sendMessage({ action: 'getCurrentCollection' });
            defaultCollectionId = currentCollection?.data?.collectionId || '';

            if (collectionsResult?.success && collectionsResult.data?.collections) {
                const rawCollections = collectionsResult.data.collections as Array<any>;
                const storageData = await this.getStorageData();
                const authToken = storageData?.auth?.token;

                const summaryByCollection = new Map<string, { bookmarkCount: number; folderCount: number }>();
                if (authToken) {
                    const summaryResults = await Promise.allSettled(
                        rawCollections.map(async (collection) => {
                            const response = await fetch(`${this.apiBase}/api/v1/collections/${collection.id}`, {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${authToken}`
                                }
                            });

                            if (!response.ok) {
                                throw new Error(`Failed to fetch summary for ${collection.id}`);
                            }

                            const payload = await response.json();
                            const summary = payload?.data?.summary;
                            summaryByCollection.set(collection.id, {
                                bookmarkCount: summary?.bookmarksCount ?? summary?.bookmarkCount ?? 0,
                                folderCount: summary?.foldersCount ?? summary?.folderCount ?? 0
                            });
                        })
                    );

                    const failedSummaryCount = summaryResults.filter((r) => r.status === 'rejected').length;
                    if (failedSummaryCount > 0) {
                        console.warn(`[Onboarding] Failed to fetch ${failedSummaryCount} collection summaries, using fallback counts`);
                    }
                }

                collections = rawCollections.map((c: any) => {
                    const summary = summaryByCollection.get(c.id);
                    return {
                        id: c.id,
                        name: c.name,
                        bookmarkCount: summary?.bookmarkCount ?? c.bookmarksCount ?? c.bookmarkCount ?? 0,
                        folderCount: summary?.folderCount ?? c.foldersCount ?? c.folderCount ?? 0
                    };
                });

                if (!defaultCollectionId && collections.length > 0) {
                    defaultCollectionId = collections[0].id;
                }
            }
        } catch (error) {
            console.error('[Onboarding] Failed to fetch collections:', error);
        }

        const info: OnboardingInfo = {
            masterBookmarkCount,
            masterFolderCount,
            localBookmarkCount,
            localFolderCount,
            collections,
            defaultCollectionId
        };

        const result: OnboardingResult = await this.onboardingDialog.showOnboarding(info);

        if (result.choice === 'overwrite') {
            this.showSuccess('Overwriting local bookmarks from master...');
            // Set the selected collection before overwriting
            if (result.selectedCollectionId) {
                const selectedCollectionName = collections.find((c) => c.id === result.selectedCollectionId)?.name || 'Selected Collection';
                await this.sendMessage({
                    action: 'switchCollection',
                    data: {
                        collectionId: result.selectedCollectionId,
                        collectionName: selectedCollectionName
                    }
                });
            }
            const overwriteResult = await this.sendMessage({ action: 'overwriteFromMaster' });
            if (overwriteResult?.success) {
                this.showSuccess('Local bookmarks replaced with master collection');
            } else {
                this.showError(overwriteResult?.error || 'Overwrite failed');
            }
        } else if (result.choice === 'mergeThenOverwrite') {
            this.showSuccess('Merging into master, then syncing back...');

            // Set the selected collection before merge
            if (result.selectedCollectionId) {
                const selectedCollectionName = collections.find((c) => c.id === result.selectedCollectionId)?.name || 'Selected Collection';
                await this.sendMessage({
                    action: 'switchCollection',
                    data: {
                        collectionId: result.selectedCollectionId,
                        collectionName: selectedCollectionName
                    }
                });
            }

            // Step 1: Merge local into master
            const mergeResult = await this.sendMessage({ action: 'mergeIntoMaster' });
            if (!mergeResult?.success) {
                this.showError(mergeResult?.error || 'Merge failed');
                await this.updateUI();
                return;
            }

            const mergeData = mergeResult.data;
            this.showSuccess(`Merged ${mergeData?.bookmarksCreated ?? 0} new bookmarks into master`);

            // Step 2: Overwrite local with updated master
            this.showSuccess('Syncing complete master back to browser...');
            const overwriteResult = await this.sendMessage({ action: 'overwriteFromMaster' });
            if (overwriteResult?.success) {
                this.showSuccess('Browser now synced with complete master collection');
            } else {
                this.showError(overwriteResult?.error || 'Sync back failed');
            }
        } else if (result.choice === 'overwriteRemote') {
            this.showSuccess('Replacing remote collection with local bookmarks...');

            if (result.selectedCollectionId) {
                const selectedCollectionName = collections.find((c) => c.id === result.selectedCollectionId)?.name || 'Selected Collection';
                await this.sendMessage({
                    action: 'switchCollection',
                    data: {
                        collectionId: result.selectedCollectionId,
                        collectionName: selectedCollectionName
                    }
                });
            }

            const remoteResult = await this.sendMessage({ action: 'overwriteRemote' });
            if (remoteResult?.success) {
                this.showSuccess('Remote collection replaced with local bookmarks');
            } else {
                this.showError(remoteResult?.error || 'Overwrite remote failed');
            }
        }

        await this.updateUI();
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
                <button class="dismiss-button">&times;</button>
            `;
            errorContainer.className = 'success-container';

            const dismissButton = errorContainer.querySelector('.dismiss-button');
            dismissButton?.addEventListener('click', () => {
                errorContainer.className = 'toast-container hidden';
            });

            setTimeout(() => {
                errorContainer.className = 'toast-container hidden';
            }, 4000);
        }
    }

    private showError(message: string, upgradeUrl?: string): void {
        const errorContainer = document.getElementById('errorContainer');
        if (errorContainer) {
            const isLimitError = upgradeUrl || message.toLowerCase().includes('upgrade') || message.toLowerCase().includes('limit');

            let html = `<span>${message}</span>`;

            if (isLimitError) {
                const url = upgradeUrl || `${WEBSITE_BASE_URL}/upgrade`;
                html += `
                    <div style="margin-top: 8px;">
                        <a href="${url}" target="_blank" class="upgrade-error-link" style="
                            display: inline-block;
                            padding: 6px 12px;
                            background: rgba(255,255,255,0.2);
                            color: #fff;
                            text-decoration: none;
                            border-radius: 8px;
                            font-weight: 600;
                            font-size: 12px;
                        ">Upgrade to Premium</a>
                    </div>
                `;
            }

            html += `<button class="dismiss-button">&times;</button>`;

            errorContainer.innerHTML = html;
            errorContainer.className = 'error-container';

            const dismissButton = errorContainer.querySelector('.dismiss-button');
            dismissButton?.addEventListener('click', () => {
                errorContainer.className = 'toast-container hidden';
            });

            const upgradeLink = errorContainer.querySelector('.upgrade-error-link');
            upgradeLink?.addEventListener('click', (e) => {
                e.preventDefault();
                const url = (e.target as HTMLAnchorElement).href;
                chrome.tabs.create({ url });
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
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});
