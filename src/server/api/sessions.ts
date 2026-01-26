import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { authenticate } from '../middleware/auth';
import { requirePremium, AuthenticatedRequest } from '../middleware/premium';

const router = Router();

/**
 * GET /api/v1/sessions
 * Get session history for the authenticated user (premium only)
 */
router.get('/', authenticate, requirePremium, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const limit = parseInt(req.query.limit as string) || 50;

        const sessions = db.getSessionHistory(userId, Math.min(limit, 100));

        res.json({
            success: true,
            data: {
                sessions,
                count: sessions.length
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error fetching session history:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to fetch session history',
                details: error.message
            }
        });
    }
});

/**
 * GET /api/v1/sessions/:sessionId
 * Get details of a specific session (premium only)
 */
router.get('/:sessionId', authenticate, requirePremium, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { sessionId } = req.params;

        const items = db.getSessionItems(sessionId, userId);

        if (items.bookmarks.length === 0 && items.folders.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Session not found or contains no items'
                }
            });
        }

        // Get session metadata from first item
        const firstItem = items.folders[0] || items.bookmarks[0];
        
        res.json({
            success: true,
            data: {
                sessionId,
                sourceBrowser: firstItem?.sourceBrowser || 'unknown',
                timestamp: firstItem?.createdAt,
                folders: items.folders,
                bookmarks: items.bookmarks,
                summary: {
                    foldersCount: items.folders.length,
                    bookmarksCount: items.bookmarks.length,
                    totalItems: items.folders.length + items.bookmarks.length
                }
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error fetching session details:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to fetch session details',
                details: error.message
            }
        });
    }
});

/**
 * POST /api/v1/sessions/:sessionId/rollback
 * Rollback (soft-delete) all items from a session (premium only)
 */
router.post('/:sessionId/rollback', authenticate, requirePremium, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { sessionId } = req.params;

        // Verify session exists and belongs to user
        const items = db.getSessionItems(sessionId, userId);
        if (items.bookmarks.length === 0 && items.folders.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Session not found or contains no items'
                }
            });
        }

        // Check if already rolled back
        const activeItems = [...items.bookmarks, ...items.folders].filter(
            (item: any) => item.status === 'active'
        );
        
        if (activeItems.length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Session has already been rolled back'
                }
            });
        }

        const affectedCount = db.rollbackSession(sessionId, userId);

        console.log(`Session ${sessionId} rolled back: ${affectedCount} items affected`);

        res.json({
            success: true,
            data: {
                sessionId,
                action: 'rolled_back',
                affectedItems: affectedCount,
                message: `Successfully rolled back ${affectedCount} items`
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error rolling back session:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to rollback session',
                details: error.message
            }
        });
    }
});

/**
 * POST /api/v1/sessions/:sessionId/restore
 * Restore a previously rolled-back session (premium only)
 */
router.post('/:sessionId/restore', authenticate, requirePremium, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { sessionId } = req.params;

        // Verify session exists and belongs to user
        const items = db.getSessionItems(sessionId, userId);
        if (items.bookmarks.length === 0 && items.folders.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Session not found or contains no items'
                }
            });
        }

        // Check if there are rolled back items to restore
        const rolledBackItems = [...items.bookmarks, ...items.folders].filter(
            (item: any) => item.status === 'rolled_back'
        );
        
        if (rolledBackItems.length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Session has no rolled back items to restore'
                }
            });
        }

        const affectedCount = db.restoreSession(sessionId, userId);

        console.log(`Session ${sessionId} restored: ${affectedCount} items affected`);

        res.json({
            success: true,
            data: {
                sessionId,
                action: 'restored',
                affectedItems: affectedCount,
                message: `Successfully restored ${affectedCount} items`
            }
        });
    } catch (err) {
        const error = err as Error;
        console.error('Error restoring session:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to restore session',
                details: error.message
            }
        });
    }
});

export default router;
