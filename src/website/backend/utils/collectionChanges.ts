import { randomUUID, createHash } from 'crypto';
import { db } from '../db/database';
import { safeBookmarkUrl } from './bookmarkFiles';

export function applyCollectionChanges(userId: string, collectionId: string, changes: any[]): any {
    if (!Array.isArray(changes) || changes.length > 10000) throw new Error('A valid changes array is required (maximum 10,000)');
    return db.transaction(() => {
        const snapshot = db.getCollectionSnapshot(collectionId, userId);
        const idMap: Record<string, string> = {};
        const results: any[] = [];
        let applied = 0;
        for (const change of changes) {
            if (!change || typeof change.type !== 'string') throw new Error('Invalid collection change');
            const hash = createHash('sha256').update(JSON.stringify(change)).digest('hex');
            const operationId = typeof change.operationId === 'string' ? `editor:${change.operationId}` : undefined;
            const previous = operationId && db.getMutationReceipt(userId, collectionId, operationId, hash);
            if (previous) { Object.assign(idMap, previous.idMap); results.push(previous); continue; }
            const resolve = (id: string | null | undefined) => id ? idMap[id] || id : null;
            const itemId = resolve(change.itemId);
            const parentId = resolve(change.newParentId ?? change.parentId);
            const position = change.position ?? change.index ?? 0;
            if (!Number.isInteger(position) || position < 0) throw new Error('Invalid sibling position');
            const itemType = change.itemType;
            if (itemType !== 'folder' && itemType !== 'bookmark') throw new Error('Invalid item type');
            const item = { masterId: itemId, userId, collectionId };
            const beforeIds = { ...idMap };
            switch (change.type) {
                case 'add-folder':
                case 'add-bookmark': {
                    if (typeof change.title !== 'string' || change.title.length > 10000) throw new Error('Invalid title');
                    if (change.type === 'add-bookmark' && (typeof change.url !== 'string' || !change.url.trim())) throw new Error('A bookmark URL is required');
                    if (change.type === 'add-bookmark') safeBookmarkUrl(change.url);
                    db.validateParent(userId, collectionId, parentId);
                    const details = { browserId: `manual-${randomUUID()}`, title: change.title, url: change.url,
                        parentId: parentId ? db.getFolderBrowserIdByMasterId(parentId, userId, collectionId) : '1',
                        masterParentId: parentId, userId, collectionId, position, dateAdded: Date.now() };
                    const created = change.type === 'add-folder' ? db.createFolder(details) : db.createBookmark(details);
                    if (change.itemId) idMap[change.itemId] = created.masterId;
                    break;
                }
                case 'move': {
                    db.validateParent(userId, collectionId, parentId, itemType === 'folder' ? itemId! : undefined);
                    const move = { ...item, parentId: parentId ? db.getFolderBrowserIdByMasterId(parentId, userId, collectionId) : '1', masterParentId: parentId, index: position };
                    itemType === 'folder' ? db.moveFolder(move) : db.moveBookmark(move);
                    break;
                }
                case 'rename': {
                    if (typeof change.newTitle !== 'string' || change.newTitle.length > 10000) throw new Error('Invalid title');
                    itemType === 'folder' ? db.updateFolder({ ...item, title: change.newTitle }) : db.updateBookmark({ ...item, title: change.newTitle });
                    break;
                }
                case 'update-url':
                    if (itemType !== 'bookmark' || typeof change.newUrl !== 'string' || !change.newUrl.trim()) throw new Error('Invalid bookmark URL');
                    safeBookmarkUrl(change.newUrl);
                    db.updateBookmark({ ...item, url: change.newUrl }); break;
                case 'delete':
                    itemType === 'folder' ? db.deleteFolder({ ...item, recursive: true }) : db.deleteBookmark(item); break;
                case 'copy-from': {
                    const source = change.sourceCollectionId === 'default' ? db.getDefaultCollection(userId) : db.getCollectionById(change.sourceCollectionId, userId);
                    if (!source || !Array.isArray(change.copyItems)) throw new Error('Source collection and copied items are required');
                    const copy = db.copyItemsToCollection(collectionId, source.id, userId, change.copyItems.map((i: any) => ({
                        masterId: i.masterId, type: i.type, targetParentId: resolve(i.targetParentId) }))) as any;
                    for (const [sourceId, tempId] of Object.entries(change.copyTempIds || {})) {
                        if (typeof tempId === 'string' && copy.masterIdMap[sourceId]) idMap[tempId] = copy.masterIdMap[sourceId];
                    }
                    break;
                }
                default: throw new Error(`Unknown change type: ${change.type}`);
            }
            const result = { success: true, changeId: change.operationId || change.id,
                idMap: Object.fromEntries(Object.entries(idMap).filter(([id, value]) => beforeIds[id] !== value)) };
            if (operationId) db.recordMutationReceipt(userId, collectionId, operationId, hash, result);
            results.push(result); applied++;
        }
        const eventId = applied ? db.createCollectionEvent({ userId, collectionId, type: 'MANUAL_EDIT',
            changesCount: applied, snapshot, details: { applied, results } }) : null;
        if (applied) db.updateCollection(collectionId, userId, {});
        return { applied, failed: 0, results, idMap, eventId };
    });
}
