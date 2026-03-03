/**
 * Household routes — full lifecycle management.
 *
 * All routes require authentication via the `authenticate` middleware.
 * Owner-only operations are enforced at the route level before calling services.
 *
 * Route map:
 *   GET    /                              → getHousehold (null if not in one)
 *   PUT    /                              → renameHousehold (owner only)
 *   POST   /invite                        → createInvitation
 *   GET    /invitations                   → getSentInvitations (owner only)
 *   GET    /copy-requests                 → getPendingCopyRequests (owner only)
 *   POST   /copy-requests                 → createCopyRequest
 *   PUT    /copy-requests/:id/review      → reviewCopyRequest (owner only)
 *   POST   /members/:userId/promote       → promoteToOwner (owner only)
 *   POST   /members/:userId/demote        → demoteToMember (owner only)
 *   DELETE /members/:userId               → forcedRemoval (owner only)
 *   POST   /exit                          → exitHousehold
 *
 * Invitations (received) are on a separate /invitations router (invitations.ts).
 *
 * Error codes:
 *   SQIRL-HH-INVITE-001/002/003/004/005/006
 *   SQIRL-HH-MEMBER-001/002/003/004
 *   SQIRL-HH-EXIT-001
 *   SQIRL-HH-COPY-001/002
 *   SQIRL-HH-SERVER-001
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getHousehold,
  renameHousehold,
  getMembership,
  createInvitation,
  getSentInvitations,
  promoteToOwner,
  demoteToMember,
  removeMember,
  exitHousehold,
  createCopyRequest,
  reviewCopyRequest,
  getPendingCopyRequests,
  recordCopyGrant,
  cancelAllInvitations,
  defaultCopyScope,
  type CopyScope,
} from '../services/householdService';
import {
  createNotification,
  notifyMany,
} from '../services/notificationService';

const router = Router();
router.use(authenticate);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve the household for the authenticated user and verify they are a member.
 * Returns the household and membership, or sends 403/404 and returns null.
 */
async function resolveHouseholdAndMembership(
  req: Request,
  res: Response
): Promise<{ householdId: string; role: 'owner' | 'member' } | null> {
  const household = await getHousehold(req.user!.userId);
  if (!household) {
    res.status(404).json({ error: 'You are not in a household', errorCode: 'SQIRL-HH-MEMBER-003' });
    return null;
  }
  const membership = household.members.find((m) => m.userId === req.user!.userId);
  if (!membership) {
    res.status(404).json({ error: 'You are not in a household', errorCode: 'SQIRL-HH-MEMBER-003' });
    return null;
  }
  return { householdId: household.id, role: membership.role };
}

/** Send 403 and return false if the caller is not an owner. */
function requireOwner(role: 'owner' | 'member', res: Response): boolean {
  if (role !== 'owner') {
    res.status(403).json({
      error: 'Only owners can perform this action',
      errorCode: 'SQIRL-HH-MEMBER-004',
    });
    return false;
  }
  return true;
}

/** Extract a typed service error code or fall back to server error. */
function serviceErrorResponse(
  err: unknown,
  res: Response,
  fallbackCode = 'SQIRL-HH-SERVER-001',
  fallbackStatus = 500
): void {
  const e = err as { errorCode?: string; message?: string };
  if (e.errorCode) {
    const status = e.errorCode.includes('MEMBER-001') || e.errorCode.includes('EXIT-001')
      ? 409
      : e.errorCode.includes('INVITE-005') || e.errorCode.includes('COPY-002')
        ? 404
        : e.errorCode.includes('MEMBER-004')
          ? 403
          : 400;
    res.status(status).json({ error: e.message ?? 'Error', errorCode: e.errorCode });
    return;
  }
  console.error(`${fallbackCode}:`, err);
  res.status(fallbackStatus).json({ error: 'Unexpected server error', errorCode: fallbackCode });
}

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const household = await getHousehold(req.user!.userId);
    res.json({ household });
  } catch (err) {
    console.error('SQIRL-HH-SERVER-001: getHousehold error', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-HH-SERVER-001' });
  }
});

// ── PUT / (rename) ────────────────────────────────────────────────────────────

router.put('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await resolveHouseholdAndMembership(req, res);
    if (!ctx) return;
    if (!requireOwner(ctx.role, res)) return;

    const { name } = req.body as { name?: string };
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required', errorCode: 'SQIRL-HH-SERVER-001' });
      return;
    }

    const household = await getHousehold(req.user!.userId);
    const renamed = await renameHousehold(ctx.householdId, name.trim());

    // Notify all members
    const memberIds = household!.members.map((m) => m.userId);
    await notifyMany(
      memberIds,
      'household_name_changed',
      'Household renamed',
      `Household name changed to "${name.trim()}"`,
      { householdId: ctx.householdId },
      household!.isTestData
    );

    res.json({ household: renamed });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── POST /invite ──────────────────────────────────────────────────────────────

router.post('/invite', async (req: Request, res: Response): Promise<void> => {
  try {
    const { inviteeEmail, inviteePhone, expiryDays, householdId } = req.body as {
      inviteeEmail?: string;
      inviteePhone?: string;
      expiryDays?: number;
      householdId?: string;
    };

    // If householdId is provided (existing household), verify inviter is an owner
    if (householdId) {
      const membership = await getMembership(householdId, req.user!.userId);
      if (!membership) {
        res.status(403).json({ error: 'You are not a member of this household', errorCode: 'SQIRL-HH-MEMBER-003' });
        return;
      }
      if (membership.role !== 'owner') {
        res.status(403).json({ error: 'Only owners can invite to an existing household', errorCode: 'SQIRL-HH-INVITE-003' });
        return;
      }
    }

    // For founding invite (no householdId), verify inviter is NOT already in a household
    if (!householdId) {
      const existingHh = await getHousehold(req.user!.userId);
      if (existingHh) {
        // Use the existing household for the invite
        // (if they're already in one, they should pass householdId explicitly)
        res.status(400).json({
          error: 'You are already in a household. Pass householdId to invite someone into it.',
          errorCode: 'SQIRL-HH-INVITE-003',
        });
        return;
      }
    }

    const isTestData = false; // Real users — set false; test infra uses factory
    const invitation = await createInvitation({
      inviterId: req.user!.userId,
      inviteeEmail,
      inviteePhone,
      expiryDays,
      householdId: householdId ?? null,
      isTestData,
    });

    res.status(201).json({ invitation });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── GET /invitations (sent) ───────────────────────────────────────────────────

router.get('/invitations', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await resolveHouseholdAndMembership(req, res);
    if (!ctx) return;
    if (!requireOwner(ctx.role, res)) return;

    const invitations = await getSentInvitations(ctx.householdId);
    res.json({ invitations });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── GET /copy-requests ────────────────────────────────────────────────────────

router.get('/copy-requests', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await resolveHouseholdAndMembership(req, res);
    if (!ctx) return;
    if (!requireOwner(ctx.role, res)) return;

    const copyRequests = await getPendingCopyRequests(ctx.householdId);
    res.json({ copyRequests });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── POST /copy-requests ───────────────────────────────────────────────────────

router.post('/copy-requests', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await resolveHouseholdAndMembership(req, res);
    if (!ctx) return;

    const { requestedScope } = req.body as { requestedScope?: CopyScope };
    const scope = requestedScope ?? defaultCopyScope();

    const household = await getHousehold(req.user!.userId);
    const copyRequest = await createCopyRequest(
      ctx.householdId,
      req.user!.userId,
      scope,
      household!.isTestData
    );

    // Notify all owners of the request
    const ownerIds = household!.members
      .filter((m) => m.role === 'owner')
      .map((m) => m.userId);
    await notifyMany(
      ownerIds,
      'household_copy_request_received',
      'Copy request received',
      'A member has requested copies of household data before leaving',
      { copyRequestId: copyRequest.id, householdId: ctx.householdId },
      household!.isTestData
    );

    res.status(201).json({ copyRequest });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── PUT /copy-requests/:id/review ─────────────────────────────────────────────

router.put('/copy-requests/:id/review', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await resolveHouseholdAndMembership(req, res);
    if (!ctx) return;
    if (!requireOwner(ctx.role, res)) return;

    const { approved, approvedScope } = req.body as { approved: boolean; approvedScope?: CopyScope };

    const copyRequest = await reviewCopyRequest(
      req.params.id,
      req.user!.userId,
      approved,
      approvedScope
    );

    // Notify requester
    const household = await getHousehold(req.user!.userId);
    const notifType = approved ? 'household_copy_request_approved' : 'household_copy_request_denied';
    const notifTitle = approved ? 'Copy request approved' : 'Copy request denied';
    const notifMsg = approved
      ? 'Your copy request has been approved'
      : 'Your copy request was denied';
    await createNotification(
      copyRequest.requesterUserId,
      notifType,
      notifTitle,
      notifMsg,
      { copyRequestId: copyRequest.id },
      household?.isTestData ?? false
    );

    res.json({ copyRequest });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── POST /members/:userId/promote ─────────────────────────────────────────────

router.post('/members/:userId/promote', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await resolveHouseholdAndMembership(req, res);
    if (!ctx) return;
    if (!requireOwner(ctx.role, res)) return;

    const targetId = req.params.userId;
    const membership = await getMembership(ctx.householdId, targetId);
    if (!membership) {
      res.status(404).json({ error: 'User is not a member', errorCode: 'SQIRL-HH-MEMBER-003' });
      return;
    }

    await promoteToOwner(ctx.householdId, targetId);

    const household = await getHousehold(req.user!.userId);
    await createNotification(
      targetId,
      'household_owner_status_granted',
      'You are now an owner',
      'You have been promoted to owner in the household',
      { householdId: ctx.householdId },
      household?.isTestData ?? false
    );

    res.json({ success: true });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── POST /members/:userId/demote ──────────────────────────────────────────────

router.post('/members/:userId/demote', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await resolveHouseholdAndMembership(req, res);
    if (!ctx) return;
    if (!requireOwner(ctx.role, res)) return;

    const targetId = req.params.userId;
    await demoteToMember(ctx.householdId, targetId);

    const household = await getHousehold(req.user!.userId);
    await createNotification(
      targetId,
      'household_owner_status_revoked',
      'Owner status removed',
      'Your owner status in the household has been removed',
      { householdId: ctx.householdId },
      household?.isTestData ?? false
    );

    res.json({ success: true });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── DELETE /members/:userId (forced removal) ──────────────────────────────────

router.delete('/members/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await resolveHouseholdAndMembership(req, res);
    if (!ctx) return;
    if (!requireOwner(ctx.role, res)) return;

    const targetId = req.params.userId;
    const { grantScope } = req.body as { grantScope?: CopyScope };

    const scope = grantScope ?? defaultCopyScope();
    const household = await getHousehold(req.user!.userId);
    const isTestData = household?.isTestData ?? false;

    const { autoDeleted } = await removeMember(ctx.householdId, targetId);

    // Record copy grant for the removed member
    await recordCopyGrant({
      householdId: ctx.householdId,
      recipientUserId: targetId,
      grantedByUserId: req.user!.userId,
      copyScope: scope,
      isTestData,
    });

    // Notify removed member
    await createNotification(
      targetId,
      'household_member_removed',
      'Removed from household',
      'You have been removed from the household',
      { householdId: ctx.householdId, grantScope: scope },
      isTestData
    );

    if (autoDeleted) {
      await cancelAllInvitations(ctx.householdId);
      const memberIds = household!.members.map((m) => m.userId).filter((id) => id !== targetId);
      await notifyMany(
        memberIds,
        'household_deleted',
        'Household deleted',
        'The household has been deleted as you were the last member',
        { householdId: ctx.householdId },
        isTestData
      );
    }

    res.json({ autoDeleted });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

// ── POST /exit ────────────────────────────────────────────────────────────────

router.post('/exit', async (req: Request, res: Response): Promise<void> => {
  try {
    const household = await getHousehold(req.user!.userId);
    if (!household) {
      res.status(404).json({ error: 'You are not in a household', errorCode: 'SQIRL-HH-MEMBER-003' });
      return;
    }

    const isTestData = household.isTestData;
    const memberIds = household.members.map((m) => m.userId).filter((id) => id !== req.user!.userId);

    const { autoDeleted, householdId } = await exitHousehold(req.user!.userId);

    if (autoDeleted) {
      // Last member — household auto-deleted, record auto copy grant
      await recordCopyGrant({
        householdId,
        recipientUserId: req.user!.userId,
        grantedByUserId: null,
        copyScope: defaultCopyScope(),
        isTestData,
      });
      await cancelAllInvitations(householdId);
    } else {
      // Notify remaining members
      await notifyMany(
        memberIds,
        'household_member_exited',
        'Member left',
        `A member has left the household`,
        { householdId },
        isTestData
      );
    }

    res.json({ autoDeleted, householdId });
  } catch (err) {
    serviceErrorResponse(err, res);
  }
});

export default router;
