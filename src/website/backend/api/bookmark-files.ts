import { Router } from 'express';
import { randomUUID, createHash } from 'crypto';
import { db } from '../db/database';
import { authenticate } from '../middleware/auth';
import { isPremium, type AuthenticatedRequest } from '../middleware/premium';
import { bookmarksToHtml, collectionToFile, parseBookmarkFile, validateBookmarkItems } from '../utils/bookmarkFiles';

const router = Router();
router.use(authenticate);
function collection(req: AuthenticatedRequest): any {
    const user = req.user!;
    const id = req.params.collectionId === 'default' ? db.ensureDefaultCollection(user.id) : req.params.collectionId;
    const c = db.getCollectionById(id, user.id);
    if (!c || (!c.isDefault && !isPremium(user))) throw new Error('Collection is unavailable for this account');
    return c;
}
router.get('/:collectionId/export', (req: AuthenticatedRequest, res) => {
    try {
        const c = collection(req);
        const items = collectionToFile(db.getFoldersByCollection(c.id, req.user!.id), db.getBookmarksByCollection(c.id, req.user!.id));
        const html = req.query.format === 'html';
        const filename = `bookmarx-${c.id}.${html ? 'html' : 'json'}`;
        res.set({ 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.type(html ? 'text/html' : 'application/json').send(html ? bookmarksToHtml(items) : JSON.stringify({ format: 'bookmarx', version: 1, collection: { name: c.name }, items }, null, 2));
    } catch (error) { return res.status(400).json({ success: false, error: { message: error instanceof Error ? error.message : 'Export failed' } }); }
});
router.post('/:collectionId/import/preview', (req: AuthenticatedRequest, res) => {
    try {
        collection(req);
        return res.json({ success: true, data: parseBookmarkFile(req.body?.content, req.body?.format) });
    } catch (error) { return res.status(400).json({ success: false, error: { message: error instanceof Error ? error.message : 'Invalid import' } }); }
});
router.post('/:collectionId/import', (req: AuthenticatedRequest, res) => {
    try {
        const user = req.user!;
        const c = collection(req);
        const parsed = validateBookmarkItems(req.body?.items);
        const parentId = req.body?.parentId || null;
        const operationId = req.body?.operationId;
        if (typeof operationId !== 'string' || operationId.length > 128) throw new Error('A stable import operation ID is required');
        const hash = createHash('sha256').update(JSON.stringify({ items: parsed.items, parentId })).digest('hex');
        const data = db.transaction(() => {
            const previous = db.getMutationReceipt(user.id, c.id, `file:${operationId}`, hash);
            if (previous) return previous;
            if (db.getBookmarkCount(user.id) + parsed.bookmarks > user.bookmarkLimit) throw new Error(`This import exceeds your ${user.bookmarkLimit} bookmark limit`);
            db.validateParent(user.id, c.id, parentId);
            const snapshot = db.getCollectionSnapshot(c.id, user.id);
            const insert = (nodes: typeof parsed.items, parent: string | null) => {
                nodes.forEach((node, index) => {
                    const details = { browserId: `file-${randomUUID()}`, userId: user.id, collectionId: c.id, title: node.title,
                        masterParentId: parent, parentId: parent ? db.getFolderBrowserIdByMasterId(parent, user.id, c.id) : '1',
                        position: node.position ?? index, dateAdded: node.dateAdded ?? Date.now() };
                    if (node.type === 'folder') {
                        const root = !parent && node.rootKind && db.getFoldersByCollection(c.id, user.id).find(f => f.rootKind === node.rootKind);
                        const id = root?.masterId || db.createFolder({ ...details, ...(node.rootKind && !parent ? { rootKind: node.rootKind, parentId: '0' } : {}) }).masterId;
                        insert(node.children || [], id);
                    } else db.createBookmark({ ...details, url: node.url });
                });
            };
            insert(parsed.items, parentId);
            const eventId = db.createCollectionEvent({ userId: user.id, collectionId: c.id, type: 'FILE_IMPORT',
                changesCount: parsed.bookmarks + parsed.folders, snapshot });
            const result = { bookmarks: parsed.bookmarks, folders: parsed.folders, eventId };
            db.recordMutationReceipt(user.id, c.id, `file:${operationId}`, hash, result);
            return result;
        });
        return res.json({ success: true, data });
    } catch (error) { return res.status(400).json({ success: false, error: { message: error instanceof Error ? error.message : 'Import failed; nothing was saved' } }); }
});
export default router;
