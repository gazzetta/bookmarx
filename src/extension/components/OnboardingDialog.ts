// src/extension/components/OnboardingDialog.ts
export type OnboardingChoice = 'overwrite' | 'merge' | 'cancel';

export interface OnboardingInfo {
    masterBookmarkCount: number;
    masterFolderCount: number;
    localBookmarkCount: number;
    localFolderCount: number;
}

export class OnboardingDialog {
    private dialog: HTMLDialogElement;

    constructor() {
        this.createDialog();
    }

    private createDialog() {
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'onboarding-dialog';
        document.body.appendChild(this.dialog);
    }

    public async showOnboarding(info: OnboardingInfo): Promise<OnboardingChoice> {
        return new Promise((resolve) => {
            const content = this.createContent(info);
            this.dialog.innerHTML = content;

            const overwriteBtn = this.dialog.querySelector('.onboarding-overwrite-btn');
            const mergeBtn = this.dialog.querySelector('.onboarding-merge-btn');
            const cancelBtn = this.dialog.querySelector('.onboarding-cancel-btn');

            overwriteBtn?.addEventListener('click', () => {
                this.dialog.close();
                resolve('overwrite');
            });

            mergeBtn?.addEventListener('click', () => {
                this.dialog.close();
                resolve('merge');
            });

            cancelBtn?.addEventListener('click', () => {
                this.dialog.close();
                resolve('cancel');
            });

            this.dialog.showModal();
        });
    }

    private createContent(info: OnboardingInfo): string {
        return `
            <div class="onboarding-header">🔄 Setup Your Bookmarks</div>
            <p class="onboarding-intro">
                You already have a master collection on the server. Choose how to sync this browser:
            </p>
            
            <div class="onboarding-stats">
                <div class="onboarding-stat-group">
                    <div class="onboarding-stat-label">Master Collection (Server)</div>
                    <div class="onboarding-stat-value">${info.masterBookmarkCount} bookmarks, ${info.masterFolderCount} folders</div>
                </div>
                <div class="onboarding-stat-group">
                    <div class="onboarding-stat-label">Local Browser</div>
                    <div class="onboarding-stat-value">${info.localBookmarkCount} bookmarks, ${info.localFolderCount} folders</div>
                </div>
            </div>

            <div class="onboarding-options">
                <div class="onboarding-option">
                    <button class="onboarding-btn onboarding-overwrite-btn">
                        <span class="onboarding-btn-icon">⬇️</span>
                        <span class="onboarding-btn-text">
                            <strong>Overwrite Local</strong>
                            <small>Replace all local bookmarks with master collection</small>
                        </span>
                    </button>
                </div>
                <div class="onboarding-option">
                    <button class="onboarding-btn onboarding-merge-btn">
                        <span class="onboarding-btn-icon">🔀</span>
                        <span class="onboarding-btn-text">
                            <strong>Merge Into Master</strong>
                            <small>Add local bookmarks to master (duplicates skipped)</small>
                        </span>
                    </button>
                </div>
            </div>

            <div class="onboarding-footer">
                <button class="onboarding-cancel-btn">Cancel</button>
            </div>
        `;
    }
}
