import { Request, Response } from 'express';
import { db } from '../db/database';

interface BookmarkNode {
    id: string;
    title: string;
    url?: string;
    children?: BookmarkNode[];
    parentId?: string;
    dateAdded?: number;
}

export const getBookmarkTree = async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        console.log('Fetching bookmarks for userId:', userId);

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_USER_ID',
                    message: 'User ID is required'
                }
            });
        }

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
    const folderMap = new Map();
    folders.forEach(folder => {
        folderMap.set(folder.id, {
            id: folder.id,
            title: folder.title,
            parentId: folder.parentId,
            children: []
        });
    });

    // Add bookmarks to their parent folders
    bookmarks.forEach(bookmark => {
        const node = {
            id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url
        };

        if (bookmark.folderId && folderMap.has(bookmark.folderId)) {
            folderMap.get(bookmark.folderId).children.push(node);
        }
    });

    // Build the tree structure
    const rootNodes: BookmarkNode[] = [];
    folderMap.forEach(folder => {
        if (!folder.parentId || !folderMap.has(folder.parentId)) {
            rootNodes.push(folder);
        } else {
            const parent = folderMap.get(folder.parentId);
            parent.children.push(folder);
        }
    });

    return rootNodes;
}
