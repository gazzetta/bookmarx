// src/extension/components/SyncConfirmDialog.ts
export interface SyncSummary {
    isInitialSync?: boolean;
    isOverwrite?: boolean;
    local: {
        adds?: number;
        updates?: number;
        moves?: number;
        deletes?: number;
    };
    remote?: {
        adds?: number;
        updates?: number;
        moves?: number;
        deletes?: number;
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
        let headerText = '🔄 Sync Changes Confirmation';
        let message = '<p>The following changes will be synchronized:</p>';
        let confirmButtonText = 'Sync Now';
        
        if (summary.isInitialSync) {
            headerText = '🚀 Initial Sync Required';
            message = `<p>This will upload all your bookmarks (${summary.local.adds} items) to the server for the first time.</p>`;
        } else if (summary.isOverwrite) {
            headerText = '⚠️ Overwrite Local Bookmarks';
            message = `<p>This will <strong>delete all your local bookmarks</strong> and replace them with the master collection from the server.</p>`;
            confirmButtonText = 'Overwrite Bookmarks';
        }

        const localChangesSection = this.createChangesSection('Local Changes', summary.local);
        const remoteChangesSection = summary.remote 
            ? this.createChangesSection('Remote Changes', summary.remote)
            : '';

        return `
            <div class="sync-confirm-header">${headerText}</div>
            ${message}
            ${localChangesSection}
            ${remoteChangesSection}
            <div class="sync-button-group">
                <button class="sync-button sync-cancel-btn">Cancel</button>
                <button class="sync-button sync-confirm-btn">${confirmButtonText}</button>
            </div>
        `;
    }

    private createChangesSection(title: string, changes: { 
        adds?: number; 
        updates?: number; 
        moves?: number; 
        deletes?: number; 
    }): string {
        // Ensure all values are numbers (default to 0 if undefined)
        const adds = changes.adds || 0;
        const updates = changes.updates || 0;
        const moves = changes.moves || 0;
        const deletes = changes.deletes || 0;
        
        // Now pass an object with all required properties as numbers
        const hasChanges = this.hasChanges({
            adds,
            updates,
            moves,
            deletes
        });
        
        if (!hasChanges) {
            return '';
        }
        
        return `
            <div class="sync-changes-section">
                <div class="sync-changes-title">${title}</div>
                <div class="sync-changes-list">
                    ${adds > 0 ? `<div class="sync-change-item">➕ ${adds} new items</div>` : ''}
                    ${updates > 0 ? `<div class="sync-change-item">✏️ ${updates} updated items</div>` : ''}
                    ${moves > 0 ? `<div class="sync-change-item">🔄 ${moves} moved items</div>` : ''}
                    ${deletes > 0 ? `<div class="sync-change-item">❌ ${deletes} deleted items</div>` : ''}
                </div>
            </div>
        `;
    }

    private hasChanges(changes: { 
        adds: number; 
        updates: number; 
        moves: number; 
        deletes: number; 
    }): boolean {
        return changes.adds > 0 || changes.updates > 0 || changes.moves > 0 || changes.deletes > 0;
    }
}
