import { Request, Response } from 'express';
import { db } from '../db/database';

interface BookmarkNode {
    id: string;
    title: string;
    url?: string;
    children?: BookmarkNode[];
    parentId?: string;
    dateAdded?: number;
    createdAt?: number;
    updatedAt?: number;
}

export const getBookmarkTree = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string } }).user;
        const paramUserId = req.params.userId;

        if (!authUser) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Unauthorized'
                }
            });
        }

        const userId = authUser.id;
        if (paramUserId && paramUserId !== userId) {
            console.warn(`User ID mismatch. Using token userId=${userId} instead of param=${paramUserId}`);
        }

        console.log('Fetching bookmarks for userId:', userId);

        // Get all bookmarks and folders for the user
        const bookmarks = await db.getAllBookmarks(userId);
        const folders = await db.getAllFolders(userId);

        console.log('Found bookmarks:', bookmarks.length);
        console.log('Found folders:', folders.length);

        // Build tree structure
        const tree = buildBookmarkTree(folders, bookmarks);
        console.log('Built tree structure:', JSON.stringify(tree, null, 2));

        return res.json({
            success: true,
            data: tree,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in getBookmarkTree:', error);
        return res.status(500).json({
            success: false,
            error: {
                code: 'SERVER_ERROR',
                message: error instanceof Error ? error.message : 'Internal server error'
            }
        });
    }
};

function buildBookmarkTree(folders: any[], bookmarks: any[]): BookmarkNode[] {
    console.log('Building tree from:', { folders, bookmarks });

    // Create a map for quick folder lookup
    // Map by BOTH masterId and browserId to support mixed linkage
    const folderMap = new Map();

    folders.forEach(folder => {
        const node = {
            id: folder.id, // Keep browserId as primary ID for display/legacy
            masterId: folder.masterId,
            title: folder.title,
            parentId: folder.parentId,
            masterParentId: folder.masterParentId,
            position: folder.position ?? 0,
            dateAdded: folder.dateAdded,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
            sourceBrowser: folder.sourceBrowser,
            sessionId: folder.sessionId,
            children: []
        };

        // Index by browserId (legacy)
        if (folder.id) {
            folderMap.set(folder.id, node);
        }
        // Index by masterId (new)
        if (folder.masterId) {
            folderMap.set(folder.masterId, node);
        }
    });

    // Add bookmarks to their parent folders
    bookmarks.forEach(bookmark => {
        const node = {
            id: bookmark.id,
            masterId: bookmark.masterId,
            title: bookmark.title,
            url: bookmark.url,
            position: bookmark.position ?? 0,
            dateAdded: bookmark.dateAdded,
            createdAt: bookmark.createdAt,
            updatedAt: bookmark.updatedAt,
            sourceBrowser: bookmark.sourceBrowser,
            sessionId: bookmark.sessionId
        };

        // Try linking by masterParentId first (reliable for merged items)
        if (bookmark.masterParentId && folderMap.has(bookmark.masterParentId)) {
            folderMap.get(bookmark.masterParentId).children.push(node);
        }
        // Fallback to linking by browserId (folderId)
        else if (bookmark.folderId && folderMap.has(bookmark.folderId)) {
            folderMap.get(bookmark.folderId).children.push(node);
        }
        // If neither found, it will be orphaned (filtered out or added to root if handled)
    });

    // Build the tree structure (link folders to parents)
    const rootNodes: BookmarkNode[] = [];

    // We iterate the unique nodes, not the map keys (which has duplicates)
    // Use a Set to track processed nodes since map has double entries
    const processedNodes = new Set<any>();

    folderMap.forEach(folder => {
        if (processedNodes.has(folder)) return;
        processedNodes.add(folder);

        let parentFound = false;

        // Try linking by masterParentId first
        if (folder.masterParentId && folderMap.has(folder.masterParentId)) {
            const parent = folderMap.get(folder.masterParentId);
            // Avoid circular reference or self-reference (though shouldn't happen)
            if (parent !== folder) {
                parent.children.push(folder);
                parentFound = true;
            }
        }
        // Fallback to linking by parentId (browserId)
        else if (folder.parentId && folder.parentId !== '0' && folderMap.has(folder.parentId)) {
            const parent = folderMap.get(folder.parentId);
            if (parent !== folder) {
                parent.children.push(folder);
                parentFound = true;
            }
        }

        if (!parentFound) {
            rootNodes.push(folder);
        }
    });

    // Sort all children by position to preserve original browser order
    const sortByPosition = (nodes: any[]) => {
        nodes.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
                sortByPosition(node.children);
            }
        });
    };
    sortByPosition(rootNodes);

    return rootNodes;
}
