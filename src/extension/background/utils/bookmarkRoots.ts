export type RootKind = 'bar' | 'other' | 'mobile' | 'menu' | 'imported' | 'unsorted';
type Node = chrome.bookmarks.BookmarkTreeNode & { folderType?: string; unmodifiable?: string; syncing?: boolean };

const ids: Record<string, RootKind> = { '1': 'bar', '2': 'other', '3': 'mobile',
    toolbar_____: 'bar', unfiled_____: 'other', menu________: 'menu', mobile______: 'mobile' };
const titles: Record<string, RootKind> = { 'bookmarks bar': 'bar', 'favourites bar': 'bar', 'favorites bar': 'bar',
    'bookmarks toolbar': 'bar', 'other bookmarks': 'other', 'other favourites': 'other', 'other favorites': 'other',
    'mobile bookmarks': 'mobile', 'bookmarks menu': 'menu', 'imported bookmarks': 'imported', 'unsorted bookmarks': 'unsorted' };
const excluded = new Set(['bin', 'trash', 'speed dials', 'pinboard', 'unsynchronized pinboard']);
export const ROOT_LABELS: Record<RootKind, string> = { bar: 'Bookmarks bar', other: 'Other bookmarks', mobile: 'Mobile bookmarks',
    menu: 'Bookmarks menu', imported: 'Imported bookmarks', unsorted: 'Unsorted bookmarks' };

export class BookmarkRoots {
    readonly byKind = new Map<RootKind, string>();
    readonly nativeIds = new Set<string>();
    readonly excludedIds = new Set<string>();
    readonly roles = new Map<string, RootKind>();
    constructor(tree: chrome.bookmarks.BookmarkTreeNode) {
        for (const node of (tree.children || []) as Node[]) {
            this.nativeIds.add(node.id);
            const name = (node.title || '').trim().toLowerCase();
            if (node.unmodifiable || node.folderType === 'managed' || excluded.has(name)) { this.excludedIds.add(node.id); continue; }
            // Opera has Imported Bookmarks at Chromium's id 2 and Other bookmarks at id 5.
            const role = titles[name] || ({ 'bookmarks-bar': 'bar', other: 'other', mobile: 'mobile' } as Record<string, RootKind>)[node.folderType || ''] || ids[node.id];
            if (role) {
                this.roles.set(node.id, role);
                // Prefer the local copy when a browser exposes account and local variants.
                if (!this.byKind.has(role) || node.syncing === false) this.byKind.set(role, node.id);
            }
        }
    }
    static sourceKind(id: string): RootKind | undefined { return ids[id]; }
    static masterKind(folder: any): RootKind | undefined {
        if (!folder || folder.masterParentId) return undefined;
        if (folder.rootKind && Object.prototype.hasOwnProperty.call(ROOT_LABELS, folder.rootKind)) return folder.rootKind;
        if (folder.parentId && folder.parentId !== '0' && folder.parentId !== 'root________') return undefined;
        return titles[String(folder.title || '').trim().toLowerCase()] || ids[folder.browserId || folder.id];
    }
    get fallback(): string {
        const id = this.byKind.get('other') || this.byKind.get('bar');
        if (!id) throw new Error('No writable bookmark root is available');
        return id;
    }
}
