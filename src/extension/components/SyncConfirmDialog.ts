// src/extension/components/SyncConfirmDialog.ts
export interface SyncSummary {
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

export class SyncConfirmDialog {
    private dialog: HTMLDialogElement;

    constructor() {
        this.createDialog();
    }

    private createDialog() {
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'sync-confirm-dialog';
        document.body.appendChild(this.dialog);
    }

    public async showConfirmation(summary: SyncSummary): Promise<boolean> {
        return new Promise((resolve) => {
            const content = this.createContent(summary);
            this.dialog.innerHTML = content;

            const confirmBtn = this.dialog.querySelector('.sync-confirm-btn');
            const cancelBtn = this.dialog.querySelector('.sync-cancel-btn');

            confirmBtn?.addEventListener('click', () => {
                this.dialog.close();
                resolve(true);
            });

            cancelBtn?.addEventListener('click', () => {
                this.dialog.close();
                resolve(false);
            });

            this.dialog.showModal();
        });
    }

    private createContent(summary: SyncSummary): string {
        const headerText = summary.isInitialSync 
            ? '🚀 Initial Sync Required'
            : '🔄 Sync Changes Confirmation';

        const localChangesSection = this.createChangesSection('Local Changes', summary.local);
        const remoteChangesSection = !summary.isInitialSync && summary.remote 
            ? this.createChangesSection('Remote Changes', summary.remote)
            : '';

        const message = summary.isInitialSync
            ? `<p>This will upload all your bookmarks (${summary.local.adds} items) to the server for the first time.</p>`
            : '<p>The following changes will be synchronized:</p>';

        return `
            <div class="sync-confirm-header">${headerText}</div>
            ${message}
            ${localChangesSection}
            ${remoteChangesSection}
            <div class="sync-button-group">
                <button class="sync-button sync-cancel-btn">Cancel</button>
                <button class="sync-button sync-confirm-btn">Sync Now</button>
            </div>
        `;
    }

    private createChangesSection(title: string, changes: { adds: number; updates: number; moves: number; deletes: number }): string {
        if (changes.adds + changes.updates + changes.moves + changes.deletes === 0) {
            return `
                <div class="sync-changes-section">
                    <div class="sync-changes-title">${title}</div>
                    <div>No changes pending</div>
                </div>
            `;
        }

        return `
            <div class="sync-changes-section">
                <div class="sync-changes-title">${title}</div>
                <div>${changes.adds} additions</div>
                <div>${changes.updates} updates</div>
                <div>${changes.moves} moves</div>
                <div>${changes.deletes} deletions</div>
            </div>
        `;
    }
}