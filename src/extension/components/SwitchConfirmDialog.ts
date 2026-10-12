export type SwitchChoice = 'sync' | 'discard' | 'cancel';

export class SwitchConfirmDialog {
    private dialog: HTMLDialogElement;

    constructor() {
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'switch-confirm-dialog';
        document.body.appendChild(this.dialog);
    }

    public show(pendingChanges: number, targetCollectionName: string): Promise<SwitchChoice> {
        return new Promise((resolve) => {
            this.dialog.innerHTML = `
                <div class="switch-confirm-header">Unsaved Changes</div>
                <div class="switch-confirm-message">
                    You have <strong>${pendingChanges}</strong> pending change${pendingChanges !== 1 ? 's' : ''}
                    that haven't been synced yet. What would you like to do before switching to
                    <strong>${targetCollectionName}</strong>?
                </div>
                <div class="switch-confirm-options">
                    <button class="switch-option-btn primary" data-choice="sync">
                        <strong>Sync first</strong>
                        <small>Push your changes to the current collection, then switch</small>
                    </button>
                    <button class="switch-option-btn" data-choice="discard">
                        <strong>Discard changes</strong>
                        <small>Lose unsaved changes and switch immediately</small>
                    </button>
                </div>
                <button class="switch-cancel-btn" data-choice="cancel">Cancel</button>
            `;

            const buttons = this.dialog.querySelectorAll('[data-choice]');
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const choice = (btn as HTMLElement).dataset.choice as SwitchChoice;
                    this.dialog.close();
                    resolve(choice);
                });
            });

            this.dialog.addEventListener('close', () => {
                resolve('cancel');
            }, { once: true });

            this.dialog.showModal();
        });
    }
}
