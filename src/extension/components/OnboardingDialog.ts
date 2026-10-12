// src/extension/components/OnboardingDialog.ts
export interface CollectionInfo {
    id: string;
    name: string;
    bookmarkCount: number;
    folderCount: number;
}

export interface OnboardingResult {
    choice: 'overwrite' | 'mergeThenOverwrite' | 'overwriteRemote' | 'cancel';
    selectedCollectionId?: string;
}

export interface OnboardingInfo {
    masterBookmarkCount: number;
    masterFolderCount: number;
    localBookmarkCount: number;
    localFolderCount: number;
    collections: CollectionInfo[];
    defaultCollectionId: string;
}

type ChoiceType = 'overwrite' | 'mergeThenOverwrite' | 'overwriteRemote';

const CONFIRM_MESSAGES: Record<ChoiceType, string> = {
    overwrite: 'This will DELETE all local bookmarks and replace them with the master collection. Continue?',
    mergeThenOverwrite: 'This will merge your local bookmarks into the master collection, then replace local bookmarks with the merged result. Continue?',
    overwriteRemote: 'This will DELETE all bookmarks in the remote collection and replace them with your local bookmarks. Continue?'
};

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

    public async showOnboarding(info: OnboardingInfo): Promise<OnboardingResult> {
        return new Promise((resolve) => {
            const content = this.createContent(info);
            this.dialog.innerHTML = content;

            let activeChoice: ChoiceType | null = null;

            const cards = this.dialog.querySelectorAll('.onboarding-option-card') as NodeListOf<HTMLElement>;
            const cancelBtn = this.dialog.querySelector('.onboarding-cancel-btn');

            const resetCards = () => {
                activeChoice = null;
                cards.forEach(card => {
                    card.classList.remove('active', 'dimmed');
                    const selectWrapper = card.querySelector('.collection-select-wrapper') as HTMLElement;
                    if (selectWrapper) selectWrapper.classList.add('hidden');
                    const btn = card.querySelector('.onboarding-action-btn') as HTMLElement;
                    if (btn) btn.textContent = 'Next';
                });
            };

            cards.forEach(card => {
                const btn = card.querySelector('.onboarding-action-btn') as HTMLElement;
                const choice = card.dataset.choice as ChoiceType;

                btn?.addEventListener('click', (e) => {
                    e.stopPropagation();

                    if (activeChoice !== choice) {
                        activeChoice = choice;
                        cards.forEach(c => {
                            if (c.dataset.choice === choice) {
                                c.classList.add('active');
                                c.classList.remove('dimmed');
                                const sw = c.querySelector('.collection-select-wrapper') as HTMLElement;
                                if (sw) sw.classList.remove('hidden');
                                const b = c.querySelector('.onboarding-action-btn') as HTMLElement;
                                if (b) b.textContent = 'Process';
                            } else {
                                c.classList.remove('active');
                                c.classList.add('dimmed');
                                const sw = c.querySelector('.collection-select-wrapper') as HTMLElement;
                                if (sw) sw.classList.add('hidden');
                                const b = c.querySelector('.onboarding-action-btn') as HTMLElement;
                                if (b) b.textContent = 'Next';
                            }
                        });
                        return;
                    }

                    const confirmed = confirm(CONFIRM_MESSAGES[choice]);
                    if (!confirmed) {
                        resetCards();
                        return;
                    }

                    const select = card.querySelector('.collection-select') as HTMLSelectElement;
                    this.dialog.close();
                    resolve({
                        choice,
                        selectedCollectionId: select?.value || info.defaultCollectionId
                    });
                });
            });

            cancelBtn?.addEventListener('click', () => {
                this.dialog.close();
                resolve({ choice: 'cancel' });
            });

            this.dialog.showModal();
        });
    }

    private createCollectionSelect(id: string, info: OnboardingInfo): string {
        if (info.collections.length <= 1) return '';
        return `
            <div class="collection-select-wrapper hidden">
                <label for="${id}">Collection for this option</label>
                <select id="${id}" class="collection-select">
                    ${info.collections.map(c => `
                        <option value="${c.id}" ${c.id === info.defaultCollectionId ? 'selected' : ''}>
                            ${c.name} (${c.bookmarkCount} bookmarks, ${c.folderCount} folders)
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    private createContent(info: OnboardingInfo): string {
        return `
            <div class="onboarding-header">Setup Your Bookmarks</div>
            <p class="onboarding-intro">
                You already have a collection on the server. Choose how to sync this browser:
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
                <div class="onboarding-option onboarding-option-card onboarding-option-overwrite" data-choice="overwrite">
                    <div class="onboarding-option-row">
                        <span class="onboarding-btn-icon">\u2B07\uFE0F</span>
                        <span class="onboarding-btn-text">
                            <strong>Overwrite Local</strong>
                            <small>Replace all local bookmarks with master collection</small>
                        </span>
                        <button class="onboarding-action-btn">Next</button>
                    </div>
                    ${this.createCollectionSelect('overwrite-collection-select', info)}
                </div>
                <div class="onboarding-option onboarding-option-card onboarding-option-merge" data-choice="mergeThenOverwrite">
                    <div class="onboarding-option-row">
                        <span class="onboarding-btn-icon">\uD83D\uDD04</span>
                        <span class="onboarding-btn-text">
                            <strong>Merge Into Master then Overwrite Local</strong>
                            <small>Add local to master, then sync complete master back to browser</small>
                        </span>
                        <button class="onboarding-action-btn">Next</button>
                    </div>
                    ${this.createCollectionSelect('merge-collection-select', info)}
                </div>
                <div class="onboarding-option onboarding-option-card onboarding-option-remote" data-choice="overwriteRemote">
                    <div class="onboarding-option-row">
                        <span class="onboarding-btn-icon">\u2B06\uFE0F</span>
                        <span class="onboarding-btn-text">
                            <strong>Overwrite Remote</strong>
                            <small>Replace remote collection with your local bookmarks</small>
                        </span>
                        <button class="onboarding-action-btn">Next</button>
                    </div>
                    ${this.createCollectionSelect('remote-collection-select', info)}
                </div>
            </div>

            <div class="onboarding-footer">
                <button class="onboarding-cancel-btn">Cancel</button>
            </div>
        `;
    }
}
