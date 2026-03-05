/**
 * Notification routes — in-app notification management.
 *
 * GET  /                    → list all notifications (optional ?unread=true)
 * GET  /unread-count        → badge count for UI
 * PUT  /read-all            → mark all as read
 * PUT  /:id/read            → mark one as read
 *
 * Error codes:
 *   SQIRL-NOTIFY-001   Unexpected server error
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from '../services/notificationService';
import { broadcastToUser } from '../ws/wsServer';

const router = Router();
router.use(authenticate);

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const notifications = await getNotifications(req.user!.userId, unreadOnly);
    res.json({ notifications });
  } catch (err) {
    console.error('SQIRL-NOTIFY-001: getNotifications error', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-NOTIFY-001' });
  }
});

// ── GET /unread-count ─────────────────────────────────────────────────────────

router.get('/unread-count', async (req: Request, res: Response): Promise<void> => {
  try {
    const unreadCount = await getUnreadCount(req.user!.userId);
    res.json({ unreadCount });
  } catch (err) {
    console.error('SQIRL-NOTIFY-001: getUnreadCount error', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-NOTIFY-001' });
  }
});

// ── PUT /read-all — MUST be before /:id/read to avoid route collision ─────────

router.put('/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    await markAllRead(userId);
    res.json({ success: true });
    broadcastToUser('notifications:changed', userId);
  } catch (err) {
    console.error('SQIRL-NOTIFY-001: markAllRead error', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-NOTIFY-001' });
  }
});

// ── PUT /:id/read ─────────────────────────────────────────────────────────────

router.put('/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    await markRead(req.params.id, userId);
    res.json({ success: true });
    broadcastToUser('notifications:changed', userId);
  } catch (err) {
    console.error('SQIRL-NOTIFY-001: markRead error', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-NOTIFY-001' });
  }
});

export default router;
