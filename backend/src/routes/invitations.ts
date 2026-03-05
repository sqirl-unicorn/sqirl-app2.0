/**
 * Invitations routes — received invitation actions for the authenticated user.
 *
 * GET  /                  → list received pending invitations (matched by email/phone)
 * POST /:token/accept     → accept an invitation by token
 * POST /:id/decline       → decline an invitation by ID
 *
 * Error codes:
 *   SQIRL-HH-INVITE-005   Invitation not found or already acted on
 *   SQIRL-HH-INVITE-006   Acceptor already in a household
 *   SQIRL-HH-SERVER-001   Unexpected server error
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
  getHousehold,
} from '../services/householdService';
import { createNotification, notifyMany } from '../services/notificationService';
import { findUserById } from '../services/authService';
import { broadcast } from '../ws/wsServer';

const router = Router();
router.use(authenticate);

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const invitations = await getMyInvitations(req.user!.userId);
    res.json({ invitations });
  } catch (err) {
    console.error('SQIRL-HH-SERVER-001: getMyInvitations error', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-HH-SERVER-001' });
  }
});

// ── POST /:token/accept ───────────────────────────────────────────────────────

router.post('/:token/accept', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    const isTestUser = user?.isTestUser ?? false;

    const { household, created } = await acceptInvitation(
      req.params.token,
      req.user!.userId,
      isTestUser
    );

    // Fetch full household to get member IDs and test flag
    const fullHousehold = await getHousehold(req.user!.userId);
    const isTestData = fullHousehold?.isTestData ?? false;
    const existingMemberIds = (fullHousehold?.members ?? [])
      .map((m) => m.userId)
      .filter((id) => id !== req.user!.userId);

    // Notify existing members that someone joined
    if (existingMemberIds.length > 0) {
      await notifyMany(
        existingMemberIds,
        'household_member_joined',
        'New member',
        `Someone has joined the household`,
        { householdId: household.id },
        isTestData
      );
    }

    // Notify invitee that their invitation was accepted
    await createNotification(
      req.user!.userId,
      'household_invitation_accepted',
      created ? 'Household created' : 'Joined household',
      created
        ? 'Your invitation was accepted and a new household was created'
        : 'You have joined the household',
      { householdId: household.id },
      isTestData
    );

    res.json({ household, created });
    broadcast('household:changed', req.user!.userId, household.id);
  } catch (err) {
    const e = err as { errorCode?: string; message?: string };
    if (e.errorCode) {
      const status = e.errorCode === 'SQIRL-HH-INVITE-006' ? 409 : 404;
      res.status(status).json({ error: e.message ?? 'Error', errorCode: e.errorCode });
      return;
    }
    console.error('SQIRL-HH-SERVER-001: acceptInvitation error', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-HH-SERVER-001' });
  }
});

// ── POST /:id/decline ─────────────────────────────────────────────────────────

router.post('/:id/decline', async (req: Request, res: Response): Promise<void> => {
  try {
    await declineInvitation(req.params.id);
    res.json({ success: true });
  } catch (err) {
    const e = err as { errorCode?: string; message?: string };
    if (e.errorCode) {
      res.status(404).json({ error: e.message ?? 'Error', errorCode: e.errorCode });
      return;
    }
    console.error('SQIRL-HH-SERVER-001: declineInvitation error', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-HH-SERVER-001' });
  }
});

export default router;
