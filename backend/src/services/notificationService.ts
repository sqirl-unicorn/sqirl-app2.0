/**
 * Notification Service — in-app notifications for all household lifecycle events.
 *
 * Insertions are fire-and-forget from route handlers (errors logged, not thrown).
 * Future: email/push channels extend this module without breaking the interface.
 *
 * Error codes:
 *   SQIRL-NOTIFY-001   Unexpected notification insert error (logged only)
 */

import { pool } from '../db';
import { broadcastToUser } from '../ws/wsServer';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
  isTestData: boolean;
}

// ── Notification types (matches spec event table) ─────────────────────────────

export type NotificationType =
  | 'household_invitation_received'
  | 'household_invitation_accepted'
  | 'household_invitation_declined'
  | 'household_invitation_expired'
  | 'household_member_joined'
  | 'household_member_exited'
  | 'household_member_removed'
  | 'household_copy_request_received'
  | 'household_copy_request_approved'
  | 'household_copy_request_denied'
  | 'household_owner_status_granted'
  | 'household_owner_status_revoked'
  | 'household_name_changed'
  | 'household_expense_pushed_to_personal'
  | 'household_deleted'
  | 'household_trash_item_deleted';

// ── Row mapper ────────────────────────────────────────────────────────────────

function rowToNotification(row: Record<string, unknown>): NotificationRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as string,
    title: row.title as string,
    message: row.message as string,
    data: (row.data as Record<string, unknown> | null) ?? null,
    read: row.read as boolean,
    createdAt: row.created_at as string,
    isTestData: row.is_test_data as boolean,
  };
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Insert a notification for one user.
 * Errors are caught and logged; never thrown (fire-and-forget safe).
 *
 * @param userId     - Recipient user ID
 * @param type       - NotificationType string
 * @param title      - Short notification title
 * @param message    - Full notification message
 * @param data       - Arbitrary JSON payload for deep-linking
 * @param isTestData - Must be true when called from test context
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, unknown>,
  isTestData = false
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data, is_test_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, title, message, data ? JSON.stringify(data) : null, isTestData]
    );
    // Push real-time signal so the bell badge updates immediately
    broadcastToUser('notifications:changed', userId);
  } catch (err) {
    console.error('SQIRL-NOTIFY-001: Failed to insert notification', { userId, type, err });
  }
}

/**
 * Insert notifications for multiple users in parallel.
 * @param userIds    - Array of recipient user IDs
 * @param type       - NotificationType string
 * @param title      - Short notification title
 * @param message    - Full notification message
 * @param data       - Arbitrary JSON payload
 * @param isTestData - Test data flag
 */
export async function notifyMany(
  userIds: string[],
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, unknown>,
  isTestData = false
): Promise<void> {
  await Promise.all(
    userIds.map((id) => createNotification(id, type, title, message, data, isTestData))
  );
}

/**
 * Fetch all notifications for a user, most recent first.
 * @param userId     - Authenticated user's ID
 * @param unreadOnly - If true, return only unread notifications
 */
export async function getNotifications(
  userId: string,
  unreadOnly = false
): Promise<NotificationRow[]> {
  const whereClause = unreadOnly
    ? `WHERE user_id = $1 AND read = FALSE`
    : `WHERE user_id = $1`;
  const res = await pool.query(
    `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT 100`,
    [userId]
  );
  return res.rows.map(rowToNotification);
}

/**
 * Mark a single notification as read.
 * Silently ignores if not found (idempotent).
 *
 * @param notificationId - UUID of the notification
 * @param userId         - Must match the notification's user_id for security
 */
export async function markRead(notificationId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
}

/**
 * Mark all notifications as read for a user.
 * @param userId - Authenticated user
 */
export async function markAllRead(userId: string): Promise<void> {
  await pool.query(
    `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
    [userId]
  );
}

/**
 * Count unread notifications for a user (for the notification badge).
 * @param userId - Authenticated user
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE`,
    [userId]
  );
  return Number(res.rows[0].count);
}
