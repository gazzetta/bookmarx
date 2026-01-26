import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { authenticate } from '../middleware/auth';
import { requirePremium, checkCollectionLimit, AuthenticatedRequest, isPremium } from '../middleware/premium';

const router = Router();

/**
 * GET /api/v1/collections
 * Get all collections for the authenticated user
 * Free users see only their default collection
 */
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Ensure user has a default collection
        db.ensureDefaultCollection(userId);

        const collections = db.getCollectionsByUserId(userId);

        // For free users, only return the default collection
        const userCollections = isPremium(req.user) 
            ? collections 
            : collections.filter((c: any) => c.isDefault);

        res.json({
            success: true,
            data: {
                collections: userCollections,
                count: userCollections.length,
                canCreate: isPremium(req.user)
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error fetching collections:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to fetch collections',
                details: error.message
            }
        });
    }
});

/**
 * GET /api/v1/collections/:collectionId
 * Get a specific collection with its items
 */
router.get('/:collectionId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { collectionId } = req.params;

        const collection = db.getCollectionById(collectionId, userId);

        if (!collection) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Collection not found'
                }
            });
        }

        // Free users can only access default collection
        if (!isPremium(req.user) && !collection.isDefault) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'PREMIUM_REQUIRED',
                    message: 'Access to non-default collections requires premium',
                    upgradeUrl: 'https://bookmarx.io/upgrade'
                }
            });
        }

        // Get items in this collection
        // For now, collectionId null means default collection
        const folders = db.getFoldersByCollection(collectionId, userId);
        const bookmarks = db.getBookmarksByCollection(collectionId, userId);

        res.json({
            success: true,
            data: {
                collection,
                folders,
                bookmarks,
                summary: {
                    foldersCount: folders.length,
                    bookmarksCount: bookmarks.length
                }
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error fetching collection:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to fetch collection',
                details: error.message
            }
        });
    }
});

/**
 * POST /api/v1/collections
 * Create a new collection (premium only)
 */
router.post('/', authenticate, requirePremium, checkCollectionLimit, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { name, description } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Collection name is required'
                }
            });
        }

        const collectionId = db.createCollection({
            userId,
            name: name.trim(),
            description: description?.trim() || undefined,
            isDefault: false
        });

        const collection = db.getCollectionById(collectionId, userId);

        console.log(`Collection created: ${name} (${collectionId}) for user ${userId}`);

        res.status(201).json({
            success: true,
            data: {
                collection
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error creating collection:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to create collection',
                details: error.message
            }
        });
    }
});

/**
 * PUT /api/v1/collections/:collectionId
 * Update a collection (premium only)
 */
router.put('/:collectionId', authenticate, requirePremium, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { collectionId } = req.params;
        const { name, description } = req.body;

        const collection = db.getCollectionById(collectionId, userId);

        if (!collection) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Collection not found'
                }
            });
        }

        const updates: { name?: string; description?: string } = {};
        if (name !== undefined) updates.name = name.trim();
        if (description !== undefined) updates.description = description?.trim() || null;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'No updates provided'
                }
            });
        }

        db.updateCollection(collectionId, userId, updates);

        const updatedCollection = db.getCollectionById(collectionId, userId);

        res.json({
            success: true,
            data: {
                collection: updatedCollection
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error updating collection:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to update collection',
                details: error.message
            }
        });
    }
});

/**
 * POST /api/v1/collections/:collectionId/changes
 * Apply batch changes to a collection (premium only)
 * Used by the web-based collection editor
 */
router.post('/:collectionId/changes', authenticate, requirePremium, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { collectionId } = req.params;
        const { changes } = req.body;

        if (!changes || !Array.isArray(changes)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Changes array is required'
                }
            });
        }

        // Verify collection exists and belongs to user
        const collection = collectionId === 'default' 
            ? db.getDefaultCollection(userId)
            : db.getCollectionById(collectionId, userId);

        if (!collection) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Collection not found'
                }
            });
        }

        const results: { success: boolean; changeId?: string; error?: string }[] = [];

        for (const change of changes) {
            try {
                switch (change.type) {
                    case 'move': {
                        // Update parent of an item
                        const { itemId, itemType, newParentId } = change;
                        if (itemType === 'folder') {
                            db.updateFolder({
                                masterId: itemId,
                                masterParentId: newParentId,
                                userId
                            });
                        } else {
                            db.updateBookmark({
                                masterId: itemId,
                                masterParentId: newParentId,
                                userId
                            });
                        }
                        results.push({ success: true, changeId: change.id });
                        break;
                    }
                    case 'rename': {
                        const { itemId, itemType, newTitle } = change;
                        if (itemType === 'folder') {
                            db.updateFolder({
                                masterId: itemId,
                                title: newTitle,
                                userId
                            });
                        } else {
                            db.updateBookmark({
                                masterId: itemId,
                                title: newTitle,
                                userId
                            });
                        }
                        results.push({ success: true, changeId: change.id });
                        break;
                    }
                    case 'update-url': {
                        const { itemId, newUrl } = change;
                        db.updateBookmark({
                            masterId: itemId,
                            url: newUrl,
                            userId
                        });
                        results.push({ success: true, changeId: change.id });
                        break;
                    }
                    case 'delete': {
                        const { itemId, itemType } = change;
                        if (itemType === 'folder') {
                            db.deleteFolder({
                                masterId: itemId,
                                userId,
                                recursive: true
                            });
                        } else {
                            db.deleteBookmark({
                                masterId: itemId,
                                userId
                            });
                        }
                        results.push({ success: true, changeId: change.id });
                        break;
                    }
                    case 'add-folder': {
                        const { parentId, title } = change;
                        const result = db.createFolder({
                            title,
                            masterParentId: parentId,
                            userId,
                            status: 'active'
                        });
                        results.push({ success: true, changeId: change.id });
                        break;
                    }
                    case 'add-bookmark': {
                        const { parentId, title, url } = change;
                        const result = db.createBookmark({
                            title,
                            url,
                            masterParentId: parentId,
                            userId,
                            status: 'active',
                            dateAdded: Date.now()
                        });
                        results.push({ success: true, changeId: change.id });
                        break;
                    }
                    default:
                        results.push({ 
                            success: false, 
                            changeId: change.id, 
                            error: `Unknown change type: ${change.type}` 
                        });
                }
            } catch (err) {
                const error = err as Error;
                console.error('Error applying change:', change, error);
                results.push({ 
                    success: false, 
                    changeId: change.id, 
                    error: error.message 
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        console.log(`Applied ${successCount}/${changes.length} changes to collection ${collectionId} for user ${userId}`);

        res.json({
            success: failCount === 0,
            data: {
                applied: successCount,
                failed: failCount,
                results
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error applying collection changes:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to apply changes',
                details: error.message
            }
        });
    }
});

/**
 * DELETE /api/v1/collections/:collectionId
 * Delete a collection (premium only, cannot delete default)
 */
router.delete('/:collectionId', authenticate, requirePremium, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { collectionId } = req.params;

        const collection = db.getCollectionById(collectionId, userId);

        if (!collection) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Collection not found'
                }
            });
        }

        if (collection.isDefault) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Cannot delete the default collection'
                }
            });
        }

        // TODO: Decide what happens to items in deleted collection
        // Option 1: Move to default collection
        // Option 2: Delete items
        // For now, just delete the collection (items become orphaned with collectionId pointing to deleted collection)

        const deleted = db.deleteCollection(collectionId, userId);

        if (!deleted) {
            return res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to delete collection'
                }
            });
        }

        console.log(`Collection deleted: ${collection.name} (${collectionId}) for user ${userId}`);

        res.json({
            success: true,
            data: {
                message: 'Collection deleted successfully',
                deletedCollectionId: collectionId
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error deleting collection:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to delete collection',
                details: error.message
            }
        });
    }
});

export default router;
