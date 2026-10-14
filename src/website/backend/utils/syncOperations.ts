import { createHash, randomUUID } from 'crypto';
import { db } from '../db/database';
import { CustomError } from './errors';
import { safeBookmarkUrl } from './bookmarkFiles';

const sourceRoots: Record<string, string> = { '1': 'bar', '2': 'other', '3': 'mobile', toolbar_____: 'bar', unfiled_____: 'other', menu________: 'menu', mobile______: 'mobile' };
const roleNames: Record<string, string> = { 'bookmarks bar': 'bar', 'bookmarks toolbar': 'bar', 'favourites bar': 'bar', 'favorites bar': 'bar',
    'other bookmarks': 'other', 'other favourites': 'other', 'other favorites': 'other', 'bookmarks menu': 'menu', 'mobile bookmarks': 'mobile',
    'imported bookmarks': 'imported', 'unsorted bookmarks': 'unsorted' };

function validateItem(item: any, bookmark: boolean): void {
    if (!item || typeof item.title !== 'string' || item.title.length > 10000 ||
        (bookmark && (typeof item.url !== 'string' || !item.url.trim() || item.url.length > 100000))) throw new CustomError('Invalid bookmark or folder', 400, 'INVALID_ITEM');
    if (bookmark) safeBookmarkUrl(item.url);
}
function parent(userId: string, collectionId: string, data: any, instanceId: string, aliases: Record<string, string> = {}): string | null {
    if (data.parentId && aliases[data.parentId]) {
        db.validateParent(userId, collectionId, aliases[data.parentId]);
        return aliases[data.parentId];
    }
    if (data.masterParentId !== undefined) {
        db.validateParent(userId, collectionId, data.masterParentId);
        return data.masterParentId;
    }
    if (!data.parentId || data.parentId === '0' || data.parentId === 'root________') return null;
    const asMaster = db.getFoldersByCollection(collectionId, userId).find(f => f.masterId === data.parentId);
    if (asMaster) return asMaster.masterId;
    const own = db.getFoldersByCollection(collectionId, userId).find(f => f.browserId === data.parentId && f.browserInstanceId === instanceId);
    if (own) return own.masterId;
    const role = sourceRoots[data.parentId];
    const root = role && db.getFoldersByCollection(collectionId, userId).find(f => f.rootKind === role);
    if (root) return root.masterId;
    throw new CustomError('Parent folder is not in this browser and collection', 400, 'PARENT_NOT_FOUND');
}
function limits(userId: string, maximum: number): void {
    if (db.getBookmarkCount(userId) > maximum) throw new CustomError('Bookmark limit reached. Upgrade or remove bookmarks before adding more.', 403, 'BOOKMARK_LIMIT_REACHED');
}

export function applySync(userId: string, collectionId: string, body: any, maximum: number): any {
    if (!Array.isArray(body?.changes) || body.changes.length > 10000 || !body.metadata?.deviceInfo?.browserInstanceId) throw new CustomError('Invalid sync payload', 400, 'INVALID_SYNC');
    const instanceId = body.metadata.deviceInfo.browserInstanceId;
    return db.transaction(() => {
        const revisionBefore = db.getCollectionRevision(userId, collectionId);
        const results: any[] = [];
        const aliases: Record<string, string> = {};
        for (const change of body.changes) {
            if (!change?.data) throw new CustomError('Invalid sync change', 400, 'INVALID_SYNC');
            const data = change.data;
            const metadata = change.metadata || body.metadata;
            if (metadata.deviceInfo?.browserInstanceId !== instanceId) throw new CustomError('Change browser identity does not match', 400, 'DEVICE_MISMATCH');
            const kind = data.type === 'bookmark' || data.type === 'folder' ? data.type : data.masterId ? db.findMasterItemKind(data.masterId, userId) : db.findBrowserItemKind(data.browserId || data.id, instanceId, userId);
            if (!kind) throw new CustomError('Bookmark type could not be resolved', 400, 'INVALID_ITEM');
            const hash = createHash('sha256').update(JSON.stringify({ type: change.type, data })).digest('hex');
            const operationId = change.operationId ? `sync:${instanceId}:${change.operationId}` : undefined;
            const previous = operationId && db.getMutationReceipt(userId, collectionId, operationId, hash);
            if (previous) {
                if (change.type === 'CREATE' && previous.browserId && previous.masterId) aliases[previous.browserId] = previous.masterId;
                results.push(previous);
                continue;
            }
            const details = { ...data, id: data.id || data.browserId, browserId: data.browserId || data.id, userId, collectionId, metadata };
            let masterId = data.masterId;
            let duplicate = false;
            if (change.type === 'CREATE') {
                validateItem(data, kind === 'bookmark');
                const existing = db.findActiveCreatedMasterId(kind === 'bookmark' ? 'bookmarks' : 'folders', details.browserId, instanceId, userId, collectionId);
                if (existing) { masterId = existing; duplicate = true; }
                else {
                    const masterParentId = parent(userId, collectionId, data, instanceId, aliases);
                    masterId = (kind === 'bookmark' ? db.createBookmark({ ...details, masterParentId }) : db.createFolder({ ...details, masterParentId })).masterId;
                }
                if (masterId) aliases[details.browserId] = masterId;
            } else {
                const row = db.findSyncItem(kind, details);
                if (!row) throw new CustomError('Item not found in this account and collection', 404, 'ITEM_NOT_FOUND');
                masterId = row.masterId;
                if (change.type === 'DELETE') kind === 'bookmark' ? db.deleteBookmark(details) : db.deleteFolder({ ...details, recursive: true });
                else if (change.type === 'UPDATE' || change.type === 'MOVE') {
                    if (data.title !== undefined && (typeof data.title !== 'string' || data.title.length > 10000)) throw new CustomError('Invalid title', 400, 'INVALID_ITEM');
                    if (kind === 'bookmark' && data.url !== undefined) safeBookmarkUrl(data.url);
                    const masterParentId = data.parentId !== undefined || data.masterParentId !== undefined ? parent(userId, collectionId, data, instanceId, aliases) : undefined;
                    kind === 'bookmark' ? db.updateBookmark({ ...details, masterParentId }) : db.updateFolder({ ...details, masterParentId });
                } else throw new CustomError('Unsupported change type', 400, 'INVALID_SYNC');
            }
            const result = { success: true, type: kind, browserId: details.browserId, masterId, duplicate };
            if (operationId) db.recordMutationReceipt(userId, collectionId, operationId, hash, result);
            results.push(result);
        }
        limits(userId, maximum);
        db.rememberUploadedRevisions(userId, collectionId, instanceId, revisionBefore, results.map(item => item.masterId));
        db.markCollectionInitialized(userId, collectionId);
        db.createSyncHistory({ userId, deviceId: body.deviceId, collectionId, type: 'SYNC', status: 'SUCCESS',
            changesCount: results.length, details: { kind: 'push' }, metadata: body.metadata });
        return { action: 'SYNC_COMPLETE', changesApplied: results.length, results, processed: results };
    });
}

export function importBrowserSnapshot(userId: string, collectionId: string, body: any, maximum: number, merge = false): any {
    if (!Array.isArray(body?.folders) || !Array.isArray(body?.bookmarks) || body.folders.length + body.bookmarks.length > 50000 || !body.metadata?.deviceInfo?.browserInstanceId) throw new CustomError('Invalid browser snapshot', 400, 'INVALID_SYNC');
    const instanceId = body.metadata.deviceInfo.browserInstanceId;
    const hash = createHash('sha256').update(JSON.stringify({ folders: body.folders, bookmarks: body.bookmarks, mode: body.mode, merge })).digest('hex');
    const operationId = body.operationId ? `snapshot:${instanceId}:${body.operationId}` : undefined;
    return db.transaction(() => {
        const previous = operationId && db.getMutationReceipt(userId, collectionId, operationId, hash);
        if (previous) return previous;
        const revisionBefore = db.getCollectionRevision(userId, collectionId);
        const snapshot = db.getCollectionSnapshot(collectionId, userId);
        if (body.mode === 'replace') {
            for (const b of snapshot.bookmarks) db.deleteBookmark({ masterId: b.masterId, userId, collectionId });
            for (const f of snapshot.folders) if (!f.rootKind) db.deleteFolder({ masterId: f.masterId, userId, collectionId });
        }
        const aliases: Record<string, string> = {};
        const processed: any[] = [];
        const sessionId = randomUUID();
        const remaining = [...body.folders];
        while (remaining.length) {
            let progress = false;
            for (let i = 0; i < remaining.length;) {
                const f = remaining[i]; validateItem(f, false);
                const rawId = f.browserId || f.id;
                if (typeof rawId !== 'string') throw new CustomError('Missing browser folder ID', 400, 'INVALID_ITEM');
                const top = !f.parentId || f.parentId === '0' || f.parentId === 'root________';
                const role = top ? f.rootKind || roleNames[f.title.toLowerCase()] || sourceRoots[rawId] : undefined;
                if (!top && !f.masterParentId && !aliases[f.parentId] && remaining.some(p => (p.browserId || p.id) === f.parentId)) { i++; continue; }
                const root = role && db.getFoldersByCollection(collectionId, userId).find(row => row.rootKind === role);
                const existing = root?.masterId || db.findActiveCreatedMasterId('folders', rawId, instanceId, userId, collectionId);
                const masterParentId = role ? null : parent(userId, collectionId, f, instanceId, aliases);
                const id = existing || db.createFolder({ ...f, browserId: rawId, rootKind: role, masterParentId, userId, collectionId, metadata: body.metadata, sessionId }).masterId;
                aliases[rawId] = id;
                processed.push({ success: true, type: 'folder', browserId: rawId, masterId: id });
                remaining.splice(i, 1); progress = true;
            }
            if (!progress) throw new CustomError('Snapshot contains a folder cycle', 400, 'INVALID_PARENT');
        }
        for (const b of body.bookmarks) {
            validateItem(b, true);
            const rawId = b.browserId || b.id;
            if (typeof rawId !== 'string') throw new CustomError('Missing browser bookmark ID', 400, 'INVALID_ITEM');
            const existing = db.findActiveCreatedMasterId('bookmarks', rawId, instanceId, userId, collectionId);
            const id = existing || db.createBookmark({ ...b, browserId: rawId, masterParentId: parent(userId, collectionId, b, instanceId, aliases),
                userId, collectionId, metadata: body.metadata, sessionId }).masterId;
            processed.push({ success: true, type: 'bookmark', browserId: rawId, masterId: id });
        }
        limits(userId, maximum);
        db.rememberUploadedRevisions(userId, collectionId, instanceId, revisionBefore, processed.map(item => item.masterId), true);
        db.markCollectionInitialized(userId, collectionId);
        db.createSyncHistory({ userId, deviceId: body.deviceId, collectionId, type: merge ? 'MERGE_IMPORT' : 'INITIAL_IMPORT', status: 'SUCCESS',
            changesCount: processed.length, sessionId, details: { kind: 'push' }, metadata: body.metadata });
        const eventId = db.createCollectionEvent({ userId, collectionId, type: merge ? 'MERGE_IMPORT' : 'INITIAL_IMPORT',
            sourceBrowser: body.metadata.deviceInfo.browser, sessionId, changesCount: processed.length, snapshot });
        const data = { action: merge ? 'MERGE_COMPLETE' : 'INITIAL_IMPORT_COMPLETE', eventId, sessionId, processed,
            imported: { folders: body.folders.length, bookmarks: body.bookmarks.length }, bookmarksCreated: body.bookmarks.length, foldersCreated: body.folders.length };
        if (operationId) db.recordMutationReceipt(userId, collectionId, operationId, hash, data);
        return data;
    });
}
