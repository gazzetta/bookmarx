// src/extension/components/SyncConfirmDialog.ts
export interface SyncSummary {
    isInitialSync?: boolean;
    isOverwrite?: boolean;
    isSyncDown?: boolean;
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
        let headerText = 'Sync Changes';
        let message = '<p>The following changes will be synchronized:</p>';
        let confirmButtonText = 'Sync Now';

        if (summary.isInitialSync) {
            headerText = 'Initial Sync';
            message = `<p>This will upload all your bookmarks (${summary.local.adds} items) to the server for the first time.</p>`;
        } else if (summary.isOverwrite) {
            headerText = 'Overwrite Local Bookmarks';
            const localCount = summary.local?.deletes ?? 0;
            const remoteCount = summary.remote?.adds ?? 0;
            message = `
                <p><strong>This will permanently delete all ${localCount} local bookmarks/folders in this Chrome browser</strong> and replace them with the ${remoteCount} items from your master collection on the server.</p>
                <p style="margin-top:8px;"><strong>⚠ Any unsynced local changes will be lost.</strong> Consider clicking "Sync Up" first if you have local changes you want to keep.</p>
                <p style="margin-top:8px; font-size: 12px; opacity: 0.75;">Only this Chrome browser is affected. Other connected browsers and the master collection on the server are unchanged. <strong>This action cannot be undone.</strong></p>
            `;
            confirmButtonText = 'Yes, Overwrite Local';
        } else if (summary.isSyncDown) {
            headerText = 'Sync Down — Apply Remote Changes';
            message = `
                <p>The following changes from the master collection will be applied to your local bookmarks:</p>
                <p style="margin-top:8px; font-size: 12px; opacity: 0.75;">If you have unsynced local edits to the same items, they may be overwritten. Click "Sync Up" first to push any local changes you want to keep.</p>
            `;
            confirmButtonText = 'Apply Changes';
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
