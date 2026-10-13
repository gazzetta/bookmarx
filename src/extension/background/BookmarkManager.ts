import { StorageManager } from './StorageManager';
import { BookmarkRoots } from './utils/bookmarkRoots';

interface ProcessedBookmark {
    id: string;
    title: string;
    url?: string;
    parentId?: string;
    position?: number;
    dateAdded?: number;
}

export class BookmarkManager {
    constructor(private storageManager: StorageManager) {}

    private getNode(id: string): Promise<chrome.bookmarks.BookmarkTreeNode> {
        return new Promise((resolve, reject) => chrome.bookmarks.get(id, nodes => {
            const error = chrome.runtime.lastError;
            if (error || !nodes?.[0]) reject(new Error(error?.message || 'Bookmark no longer exists'));
            else resolve(nodes[0]);
        }));
    }

    private isExcluded(id: string): Promise<boolean> {
        return new Promise((resolve, reject) => chrome.bookmarks.getTree(tree => {
            const error = chrome.runtime.lastError;
            if (error) { reject(new Error(error.message)); return; }
            const roots = new BookmarkRoots(tree[0]);
            const contains = (node: chrome.bookmarks.BookmarkTreeNode): boolean => node.id === id || Boolean(node.children?.some(contains));
            resolve(Boolean(tree[0].children?.some(root => roots.excludedIds.has(root.id) && contains(root))));
        }));
    }

    public async initialize(): Promise<void> {
        // Set up bookmark event listeners
        chrome.bookmarks.onCreated.addListener(this.handleBookmarkCreated.bind(this));
        chrome.bookmarks.onRemoved.addListener(this.handleBookmarkRemoved.bind(this));
        chrome.bookmarks.onChanged.addListener(this.handleBookmarkChanged.bind(this));
        chrome.bookmarks.onMoved.addListener(this.handleBookmarkMoved.bind(this));
    }

    private async handleBookmarkCreated(id: string, bookmark: chrome.bookmarks.BookmarkTreeNode): Promise<void> {
        try {
            if (await this.storageManager.consumeBookmarkEvent('CREATE', id, bookmark)) {
                return;
            }
            if (await this.isExcluded(id)) return;
            // Process new bookmark
            const processedBookmark = await this.processBookmark(bookmark);
            const isFolder = !bookmark.url;
            const userId = await this.storageManager.getUserId();
            
            // Queue for sync
            await this.storageManager.queueChange({
                type: 'CREATE',
                data: {
                    type: isFolder ? 'folder' : 'bookmark',
                    browserId: id,
                    userId,
                    ...processedBookmark
                }
            });
            
            if (isFolder) {
                console.log('Folder created:', processedBookmark);
            } else {
                console.log('Bookmark created:', processedBookmark);
            }
        } catch (error) {
            console.error('Error handling bookmark creation:', error);
        }
    }
    
    private async handleBookmarkRemoved(id: string, removeInfo?: chrome.bookmarks.BookmarkRemoveInfo): Promise<void> {
        try {
            if (await this.storageManager.consumeBookmarkEvent('DELETE', id)) {
                return;
            }
            const userId = await this.storageManager.getUserId();
            // The removed node says whether it was a bookmark or a folder. Sending the type avoids a
            // server-side guess, which picked the wrong table when browser ids repeated across browsers.
            const removed = removeInfo?.node;
            if (removed?.parentId && await this.isExcluded(removed.parentId)) return;
            await this.storageManager.queueChange({
                type: 'DELETE',
                data: {
                    type: removed ? (removed.url ? 'bookmark' : 'folder') : 'unknown',
                    browserId: id,
                    title: removed?.title,
                    url: removed?.url,
                    userId
                }
            });
            console.log('Bookmark or Folder deleted:', id);
        } catch (error) {
            console.error('Error handling bookmark removal:', error);
        }
    }

    private async handleBookmarkChanged(id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo): Promise<void> {
        try {
            if (await this.storageManager.consumeBookmarkEvent('UPDATE', id)) return;
            if (await this.isExcluded(id)) return;
            const bookmark = await this.getNode(id);
            await this.storageManager.queueChange({ type: 'UPDATE', data: {
                type: bookmark.url ? 'bookmark' : 'folder', browserId: id,
                title: changeInfo.title ?? bookmark.title, url: changeInfo.url ?? bookmark.url,
                parentId: bookmark.parentId, index: bookmark.index, dateAdded: bookmark.dateAdded
            }});
        } catch (error) { console.error('Error handling bookmark change:', error); }
    }

    private async handleBookmarkMoved(id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo): Promise<void> {
        try {
            if (await this.storageManager.consumeBookmarkEvent('MOVE', id)) {
                return;
            }
            // Opera moves deleted bookmarks into its native Bin instead of emitting onRemoved.
            const removed = await this.isExcluded(moveInfo.parentId);
            if (removed && await this.storageManager.consumeBookmarkEvent('DELETE', id)) return;
            // Get the node to determine if it's a bookmark or folder
            const node = await this.getNode(id);
            const type = node.url ? 'bookmark' : 'folder';
            const userId = await this.storageManager.getUserId();
            if (removed) {
                await this.storageManager.queueChange({ type: 'DELETE', data: { type, browserId: id, title: node.title, url: node.url, userId } });
                return;
            }
            if (await this.isExcluded(moveInfo.oldParentId)) {
                await this.storageManager.queueChange({ type: 'CREATE', data: { type, browserId: id, userId, ...await this.processBookmark(node) } });
                return;
            }

            // Only queue if it's a real move (different parent folders)
            if (moveInfo.parentId !== moveInfo.oldParentId || moveInfo.index !== moveInfo.oldIndex) {
                await this.storageManager.queueChange({
                    type: 'MOVE',
                    data: {
                        type: type,
                        browserId: id,
                        userId,
                        parentId: moveInfo.parentId,
                        index: moveInfo.index,
                        moveInfo
                    }
                });
                
                if (type === 'bookmark') {
                    console.log('Bookmark moved:', { id, moveInfo });
                } else {
                    console.log('Folder moved:', { id, moveInfo });
                }
            }
        } catch (error) {
            console.error('Error handling bookmark move:', error);
        }
    }

    private async processBookmark(
        bookmark: chrome.bookmarks.BookmarkTreeNode
    ): Promise<ProcessedBookmark> {
        return {
            id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            parentId: bookmark.parentId,
            position: bookmark.index || 0,
            dateAdded: bookmark.dateAdded
        };
    }
}
