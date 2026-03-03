/**
 * Household Service — all business rules for the household lifecycle.
 *
 * Enforces:
 *  - At least one owner always remains (demote/remove are atomic checks)
 *  - Household auto-deletes when last member exits (sole member gets full copies)
 *  - Invitation expiry is 1–30 days, default 7
 *  - Pending invites to same household cannot be re-sent until prior one expires
 *  - Copy scope validated against allowed values per spec
 *
 * Error codes:
 *   SQIRL-HH-INVITE-001   Missing invitee contact
 *   SQIRL-HH-INVITE-002   Invalid expiry days (must be 1–30)
 *   SQIRL-HH-INVITE-003   Inviter is not a member / not an owner
 *   SQIRL-HH-INVITE-004   Pending invite already exists for invitee+household
 *   SQIRL-HH-INVITE-005   Invitation not found or already acted on
 *   SQIRL-HH-INVITE-006   Invitee already in a household (cannot accept)
 *   SQIRL-HH-MEMBER-001   Cannot demote last owner
 *   SQIRL-HH-MEMBER-002   Cannot remove last owner
 *   SQIRL-HH-MEMBER-003   Target user not a member of this household
 *   SQIRL-HH-MEMBER-004   Actor not authorised (not an owner)
 *   SQIRL-HH-EXIT-001     Cannot exit — must promote another owner first
 *   SQIRL-HH-COPY-001     Invalid copy scope
 *   SQIRL-HH-COPY-002     Copy request not found or already reviewed
 *   SQIRL-HH-SERVER-001   Unexpected server error
 */

import { pool } from '../db';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HouseholdRow {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isTestData: boolean;
}

export interface MemberRow {
  id: string;
  householdId: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  isTestData: boolean;
}

export interface InvitationRow {
  id: string;
  householdId: string | null;
  inviterId: string;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  token: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  isTestData: boolean;
}

export interface CopyScope {
  lists: 'all' | 'none';
  giftCards: 'active_only' | 'none';
  loyaltyCards: 'all' | 'none';
  expenses: '12months' | 'none';
}

export interface CopyRequestRow {
  id: string;
  householdId: string;
  requesterUserId: string;
  requestedScope: CopyScope;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reviewedByUserId: string | null;
  approvedScope: CopyScope | null;
  reviewedAt: string | null;
  createdAt: string;
  isTestData: boolean;
}

// ── Pure validation helpers (exported for unit tests) ─────────────────────────

/**
 * Returns true if the expiry value is a valid integer in [1, 30].
 * @param days - Number of days until invite expires
 */
export function validateInviteExpiry(days: number): boolean {
  return Number.isInteger(days) && days >= 1 && days <= 30;
}

/**
 * Returns the spec-mandated default copy scope for exit-with-copies.
 */
export function defaultCopyScope(): CopyScope {
  return {
    lists: 'all',
    giftCards: 'active_only',
    loyaltyCards: 'all',
    expenses: '12months',
  };
}

/**
 * Returns true if the given scope object has only valid values per the spec.
 * @param scope - Object to validate
 */
export function validateCopyScope(scope: unknown): scope is CopyScope {
  if (!scope || typeof scope !== 'object') return false;
  const s = scope as Record<string, unknown>;
  return (
    (s.lists === 'all' || s.lists === 'none') &&
    (s.giftCards === 'active_only' || s.giftCards === 'none') &&
    (s.loyaltyCards === 'all' || s.loyaltyCards === 'none') &&
    (s.expenses === '12months' || s.expenses === 'none')
  );
}

/**
 * Returns true if demotion is safe (at least 2 owners, so one remains after).
 * @param ownerCount - Current number of owners in the household
 */
export function canDemote(ownerCount: number): boolean {
  return ownerCount >= 2;
}

/**
 * Returns true if the removal is safe given the target's role and owner count.
 * For owners: at least 2 owners must exist so one remains after removal.
 * For members: always safe.
 *
 * @param targetRole  - Role of the user being removed
 * @param ownerCount  - Current number of owners
 */
export function canRemove(targetRole: 'owner' | 'member', ownerCount: number): boolean {
  if (targetRole === 'owner') return ownerCount >= 2;
  return true;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToHousehold(row: Record<string, unknown>): HouseholdRow {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    isTestData: row.is_test_data as boolean,
  };
}

function rowToMember(row: Record<string, unknown>): MemberRow {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    userId: row.user_id as string,
    role: row.role as 'owner' | 'member',
    joinedAt: row.joined_at as string,
    isTestData: row.is_test_data as boolean,
  };
}

function rowToInvitation(row: Record<string, unknown>): InvitationRow {
  return {
    id: row.id as string,
    householdId: (row.household_id as string | null) ?? null,
    inviterId: row.inviter_id as string,
    inviteeEmail: (row.invitee_email as string | null) ?? null,
    inviteePhone: (row.invitee_phone as string | null) ?? null,
    token: row.token as string,
    status: row.status as InvitationRow['status'],
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    isTestData: row.is_test_data as boolean,
  };
}

function rowToCopyRequest(row: Record<string, unknown>): CopyRequestRow {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    requesterUserId: row.requester_user_id as string,
    requestedScope: row.requested_scope as CopyScope,
    status: row.status as CopyRequestRow['status'],
    reviewedByUserId: (row.reviewed_by_user_id as string | null) ?? null,
    approvedScope: (row.approved_scope as CopyScope | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    isTestData: row.is_test_data as boolean,
  };
}

// ── Household queries ─────────────────────────────────────────────────────────

/**
 * Fetch the household a user belongs to, including all members.
 * Returns null if the user is not in any household.
 *
 * @param userId - Authenticated user's ID
 */
export async function getHousehold(
  userId: string
): Promise<(HouseholdRow & { members: (MemberRow & { firstName: string; email: string | null; phone: string | null })[] }) | null> {
  const memberRes = await pool.query(
    `SELECT hm.*, u.first_name, u.email, u.phone
     FROM household_members hm
     JOIN users u ON u.id = hm.user_id
     WHERE hm.household_id = (
       SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1
     )
     ORDER BY hm.joined_at ASC`,
    [userId]
  );
  if (memberRes.rows.length === 0) return null;

  const householdId = memberRes.rows[0].household_id as string;
  const hhRes = await pool.query(`SELECT * FROM households WHERE id = $1`, [householdId]);
  if (hhRes.rows.length === 0) return null;

  const members = memberRes.rows.map((r) => ({
    ...rowToMember(r),
    firstName: r.first_name as string,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
  }));

  return { ...rowToHousehold(hhRes.rows[0]), members };
}

/**
 * Create a new household row.
 * @param name       - Display name for the household
 * @param isTestData - Must be true for test-created data
 */
export async function createHousehold(name: string, isTestData: boolean): Promise<HouseholdRow> {
  const res = await pool.query(
    `INSERT INTO households (name, is_test_data) VALUES ($1, $2) RETURNING *`,
    [name, isTestData]
  );
  return rowToHousehold(res.rows[0]);
}

/**
 * Add a user as owner or member of a household.
 * @param householdId - Target household UUID
 * @param userId      - User to add
 * @param role        - 'owner' or 'member'
 * @param isTestData  - Propagated from parent test context
 */
export async function addMember(
  householdId: string,
  userId: string,
  role: 'owner' | 'member',
  isTestData: boolean
): Promise<MemberRow> {
  const res = await pool.query(
    `INSERT INTO household_members (household_id, user_id, role, is_test_data)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [householdId, userId, role, isTestData]
  );
  return rowToMember(res.rows[0]);
}

/**
 * Fetch a single membership row for user+household.
 * Returns null if the user is not a member.
 */
export async function getMembership(householdId: string, userId: string): Promise<MemberRow | null> {
  const res = await pool.query(
    `SELECT * FROM household_members WHERE household_id = $1 AND user_id = $2`,
    [householdId, userId]
  );
  return res.rows.length ? rowToMember(res.rows[0]) : null;
}

/**
 * Returns the total number of members in a household.
 */
export async function getMemberCount(householdId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) FROM household_members WHERE household_id = $1`,
    [householdId]
  );
  return Number(res.rows[0].count);
}

/**
 * Returns the number of owners in a household.
 */
export async function getOwnerCount(householdId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) FROM household_members WHERE household_id = $1 AND role = 'owner'`,
    [householdId]
  );
  return Number(res.rows[0].count);
}

/**
 * Rename the household. Only owners may call the route that invokes this.
 * @param householdId - Target household
 * @param name        - New display name
 */
export async function renameHousehold(householdId: string, name: string): Promise<HouseholdRow> {
  const res = await pool.query(
    `UPDATE households SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [name, householdId]
  );
  return rowToHousehold(res.rows[0]);
}

/**
 * Promote a member to owner.
 * No guard needed here — any additional owner is always safe.
 *
 * @param householdId    - Target household
 * @param targetUserId   - User to promote
 */
export async function promoteToOwner(householdId: string, targetUserId: string): Promise<void> {
  await pool.query(
    `UPDATE household_members SET role = 'owner'
     WHERE household_id = $1 AND user_id = $2`,
    [householdId, targetUserId]
  );
}

/**
 * Demote an owner to member. Throws SQIRL-HH-MEMBER-001 if they are the last owner.
 *
 * @param householdId   - Target household
 * @param targetUserId  - Owner to demote
 */
export async function demoteToMember(householdId: string, targetUserId: string): Promise<void> {
  const ownerCount = await getOwnerCount(householdId);
  if (!canDemote(ownerCount)) {
    throw Object.assign(new Error('Cannot demote the last owner'), {
      errorCode: 'SQIRL-HH-MEMBER-001',
    });
  }
  await pool.query(
    `UPDATE household_members SET role = 'member'
     WHERE household_id = $1 AND user_id = $2`,
    [householdId, targetUserId]
  );
}

/**
 * Remove a member or owner from a household.
 * Throws SQIRL-HH-MEMBER-002 if removing the last owner.
 * Auto-deletes the household if the removed user was the last member.
 *
 * @param householdId   - Target household
 * @param targetUserId  - User to remove
 * @returns { autoDeleted } — true if household was auto-deleted
 */
export async function removeMember(
  householdId: string,
  targetUserId: string
): Promise<{ autoDeleted: boolean }> {
  const membership = await getMembership(householdId, targetUserId);
  if (!membership) {
    throw Object.assign(new Error('User is not a member of this household'), {
      errorCode: 'SQIRL-HH-MEMBER-003',
    });
  }

  if (membership.role === 'owner') {
    const ownerCount = await getOwnerCount(householdId);
    if (!canRemove('owner', ownerCount)) {
      throw Object.assign(new Error('Cannot remove the last owner'), {
        errorCode: 'SQIRL-HH-MEMBER-002',
      });
    }
  }

  await pool.query(
    `DELETE FROM household_members WHERE household_id = $1 AND user_id = $2`,
    [householdId, targetUserId]
  );

  const remaining = await getMemberCount(householdId);
  if (remaining === 0) {
    await pool.query(`DELETE FROM households WHERE id = $1`, [householdId]);
    return { autoDeleted: true };
  }
  return { autoDeleted: false };
}

/**
 * Voluntary exit: remove the authenticated user from their household.
 * If they are the last owner, they must promote someone else first (SQIRL-HH-EXIT-001).
 * If they are the last member, household auto-deletes (no copy request needed — handled by caller).
 *
 * @param userId - User who wants to exit
 */
export async function exitHousehold(
  userId: string
): Promise<{ autoDeleted: boolean; householdId: string }> {
  const household = await getHousehold(userId);
  if (!household) {
    throw Object.assign(new Error('User is not in a household'), {
      errorCode: 'SQIRL-HH-MEMBER-003',
    });
  }

  const membership = household.members.find((m) => m.userId === userId);
  if (!membership) {
    throw Object.assign(new Error('User is not in a household'), {
      errorCode: 'SQIRL-HH-MEMBER-003',
    });
  }

  const memberCount = household.members.length;
  const isLastMember = memberCount === 1;

  // Owner exit guard: must promote another owner first unless they are the last member
  if (membership.role === 'owner' && !isLastMember) {
    const ownerCount = await getOwnerCount(household.id);
    if (ownerCount === 1) {
      throw Object.assign(
        new Error('You are the only owner. Promote another member to owner before exiting.'),
        { errorCode: 'SQIRL-HH-EXIT-001' }
      );
    }
  }

  if (isLastMember) {
    // Last member: delete membership then household directly (bypass owner-count guard)
    await pool.query(
      `DELETE FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [household.id, userId]
    );
    await pool.query(`DELETE FROM households WHERE id = $1`, [household.id]);
    return { autoDeleted: true, householdId: household.id };
  }

  const { autoDeleted } = await removeMember(household.id, userId);
  return { autoDeleted, householdId: household.id };
}

// ── Invitations ───────────────────────────────────────────────────────────────

/**
 * Send an invitation to a user (by email or phone).
 * For "founding" invitations (inviter has no household), householdId is null.
 * For existing household invitations, only owners may invite.
 *
 * @param inviterId    - Authenticated user sending the invite
 * @param inviteeEmail - Invitee's email (at least one of email/phone required)
 * @param inviteePhone - Invitee's phone (at least one of email/phone required)
 * @param expiryDays   - Default 7; must be integer 1–30
 * @param householdId  - Null for founding invite; existing household otherwise
 * @param isTestData   - Propagated from test context
 */
export async function createInvitation(params: {
  inviterId: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  expiryDays?: number;
  householdId: string | null;
  isTestData: boolean;
}): Promise<InvitationRow> {
  const { inviterId, inviteeEmail, inviteePhone, householdId, isTestData } = params;
  const expiryDays = params.expiryDays ?? 7;

  if (!inviteeEmail && !inviteePhone) {
    throw Object.assign(new Error('Invitee email or phone is required'), {
      errorCode: 'SQIRL-HH-INVITE-001',
    });
  }

  if (!validateInviteExpiry(expiryDays)) {
    throw Object.assign(new Error('expiryDays must be an integer between 1 and 30'), {
      errorCode: 'SQIRL-HH-INVITE-002',
    });
  }

  // Check for existing pending invite to the same household+invitee
  if (householdId) {
    const existingRes = await pool.query(
      `SELECT id FROM household_invitations
       WHERE household_id = $1
         AND status = 'pending'
         AND (
           ($2::text IS NOT NULL AND invitee_email = $2)
           OR ($3::text IS NOT NULL AND invitee_phone = $3)
         )`,
      [householdId, inviteeEmail ?? null, inviteePhone ?? null]
    );
    if (existingRes.rows.length > 0) {
      throw Object.assign(new Error('A pending invitation already exists for this invitee'), {
        errorCode: 'SQIRL-HH-INVITE-004',
      });
    }
  }

  const res = await pool.query(
    `INSERT INTO household_invitations
       (household_id, inviter_id, invitee_email, invitee_phone, expires_at, is_test_data)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval, $6)
     RETURNING *`,
    [
      householdId,
      inviterId,
      inviteeEmail ?? null,
      inviteePhone ?? null,
      String(expiryDays),
      isTestData,
    ]
  );
  return rowToInvitation(res.rows[0]);
}

/**
 * Fetch an invitation by its token. Returns null if not found.
 * @param token - Unique invite token (from deep-link or UI)
 */
export async function getInvitationByToken(token: string): Promise<InvitationRow | null> {
  const res = await pool.query(
    `SELECT * FROM household_invitations WHERE token = $1`,
    [token]
  );
  return res.rows.length ? rowToInvitation(res.rows[0]) : null;
}

/**
 * Fetch an invitation by ID.
 * @param invitationId - UUID of the invitation
 */
export async function getInvitationById(invitationId: string): Promise<InvitationRow | null> {
  const res = await pool.query(
    `SELECT * FROM household_invitations WHERE id = $1`,
    [invitationId]
  );
  return res.rows.length ? rowToInvitation(res.rows[0]) : null;
}

/**
 * Accept an invitation.
 *  - If householdId is null (founding): create household, add inviter as owner, add acceptor as owner.
 *  - If householdId is set: add acceptor as member.
 * Throws if: invite not found/expired, acceptor already in a household.
 *
 * @param token           - Invite token from deep-link or UI
 * @param acceptingUserId - User accepting the invite
 * @param acceptorIsTest  - Whether acceptor is a test user
 */
export async function acceptInvitation(
  token: string,
  acceptingUserId: string,
  acceptorIsTest: boolean
): Promise<{ household: HouseholdRow; created: boolean }> {
  const invite = await getInvitationByToken(token);

  if (!invite || invite.status !== 'pending') {
    throw Object.assign(new Error('Invitation not found or already acted on'), {
      errorCode: 'SQIRL-HH-INVITE-005',
    });
  }

  // Check expiry
  if (new Date(invite.expiresAt) < new Date()) {
    await pool.query(
      `UPDATE household_invitations SET status = 'expired', updated_at = NOW() WHERE id = $1`,
      [invite.id]
    );
    throw Object.assign(new Error('Invitation has expired'), {
      errorCode: 'SQIRL-HH-INVITE-005',
    });
  }

  // Check accepting user is not already in a household
  const existingHousehold = await getHousehold(acceptingUserId);
  if (existingHousehold) {
    throw Object.assign(new Error('You are already in a household. Exit your current household first.'), {
      errorCode: 'SQIRL-HH-INVITE-006',
    });
  }

  const isTestData = invite.isTestData || acceptorIsTest;

  let household: HouseholdRow;
  let created = false;

  if (!invite.householdId) {
    // Founding invite: create household
    // Name = inviter's last name if available, else inviter's first name
    const inviterRes = await pool.query(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [invite.inviterId]
    );
    const inviter = inviterRes.rows[0];
    const householdName = inviter?.last_name
      ? `${String(inviter.last_name)} Household`
      : `${String(inviter?.first_name ?? 'Our')} Household`;

    household = await createHousehold(householdName, isTestData);
    await addMember(household.id, invite.inviterId, 'owner', isTestData);
    await addMember(household.id, acceptingUserId, 'owner', isTestData);
    created = true;
  } else {
    // Existing household invite
    const hhRes = await pool.query(`SELECT * FROM households WHERE id = $1`, [invite.householdId]);
    household = rowToHousehold(hhRes.rows[0]);
    await addMember(household.id, acceptingUserId, 'member', isTestData);
  }

  await pool.query(
    `UPDATE household_invitations SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
    [invite.id]
  );

  return { household, created };
}

/**
 * Decline an invitation.
 * Throws SQIRL-HH-INVITE-005 if not found or already acted on.
 *
 * @param invitationId - UUID of the invitation
 */
export async function declineInvitation(invitationId: string): Promise<void> {
  const res = await pool.query(
    `UPDATE household_invitations
     SET status = 'declined', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [invitationId]
  );
  if (res.rowCount === 0) {
    throw Object.assign(new Error('Invitation not found or already acted on'), {
      errorCode: 'SQIRL-HH-INVITE-005',
    });
  }
}

/**
 * Get all pending invitations received by a user (matched by email or phone).
 * @param userId - The authenticated user
 */
export async function getMyInvitations(userId: string): Promise<InvitationRow[]> {
  const res = await pool.query(
    `SELECT hi.*
     FROM household_invitations hi
     JOIN users u ON u.id = $1
     WHERE hi.status = 'pending'
       AND hi.expires_at > NOW()
       AND (
         (u.email IS NOT NULL AND hi.invitee_email = u.email)
         OR (u.phone IS NOT NULL AND hi.invitee_phone = u.phone)
       )
     ORDER BY hi.created_at DESC`,
    [userId]
  );
  return res.rows.map(rowToInvitation);
}

/**
 * Get all invitations sent from a household (all statuses for audit).
 * @param householdId - The household to query
 */
export async function getSentInvitations(householdId: string): Promise<InvitationRow[]> {
  const res = await pool.query(
    `SELECT * FROM household_invitations
     WHERE household_id = $1
     ORDER BY created_at DESC`,
    [householdId]
  );
  return res.rows.map(rowToInvitation);
}

/**
 * Cancel all pending invitations for a household (called on household deletion).
 * @param householdId - The household being deleted
 */
export async function cancelAllInvitations(householdId: string): Promise<void> {
  await pool.query(
    `UPDATE household_invitations
     SET status = 'cancelled', updated_at = NOW()
     WHERE household_id = $1 AND status = 'pending'`,
    [householdId]
  );
}

// ── Copy requests ─────────────────────────────────────────────────────────────

/**
 * Submit a copy request when exiting with copies.
 * @param householdId    - The user's current household
 * @param requesterId    - Requesting user's ID
 * @param requestedScope - Which objects to copy (validated)
 * @param isTestData     - Propagated from test context
 */
export async function createCopyRequest(
  householdId: string,
  requesterId: string,
  requestedScope: CopyScope,
  isTestData: boolean
): Promise<CopyRequestRow> {
  if (!validateCopyScope(requestedScope)) {
    throw Object.assign(new Error('Invalid copy scope'), { errorCode: 'SQIRL-HH-COPY-001' });
  }

  const res = await pool.query(
    `INSERT INTO household_copy_requests
       (household_id, requester_user_id, requested_scope, is_test_data)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [householdId, requesterId, JSON.stringify(requestedScope), isTestData]
  );
  return rowToCopyRequest(res.rows[0]);
}

/**
 * Approve or deny a copy request. First approval wins.
 * @param requestId    - Copy request UUID
 * @param reviewerId   - Owner reviewing the request
 * @param approved     - true = approve, false = deny
 * @param approvedScope - Subset scope if approving; null to use default
 */
export async function reviewCopyRequest(
  requestId: string,
  reviewerId: string,
  approved: boolean,
  approvedScope?: CopyScope
): Promise<CopyRequestRow> {
  const req = await pool.query(
    `SELECT * FROM household_copy_requests WHERE id = $1 AND status = 'pending'`,
    [requestId]
  );
  if (req.rows.length === 0) {
    throw Object.assign(new Error('Copy request not found or already reviewed'), {
      errorCode: 'SQIRL-HH-COPY-002',
    });
  }

  const scope = approved ? (approvedScope ?? defaultCopyScope()) : null;
  if (approved && !validateCopyScope(scope)) {
    throw Object.assign(new Error('Invalid approved scope'), { errorCode: 'SQIRL-HH-COPY-001' });
  }

  const status = approved ? 'approved' : 'denied';
  const res = await pool.query(
    `UPDATE household_copy_requests
     SET status = $1, reviewed_by_user_id = $2, approved_scope = $3, reviewed_at = NOW()
     WHERE id = $4 RETURNING *`,
    [status, reviewerId, scope ? JSON.stringify(scope) : null, requestId]
  );
  return rowToCopyRequest(res.rows[0]);
}

/**
 * Fetch all pending copy requests for a household.
 * @param householdId - Target household
 */
export async function getPendingCopyRequests(householdId: string): Promise<CopyRequestRow[]> {
  const res = await pool.query(
    `SELECT * FROM household_copy_requests
     WHERE household_id = $1 AND status = 'pending'
     ORDER BY created_at ASC`,
    [householdId]
  );
  return res.rows.map(rowToCopyRequest);
}

/**
 * Record a copy grant (audit trail of what was given to a departing member).
 * Household ID stored as plain UUID (no FK) to survive household deletion.
 *
 * @param householdId       - Source household
 * @param recipientUserId   - User receiving copies
 * @param grantedByUserId   - Null = auto-grant (last-member scenario)
 * @param copyScope         - What was granted
 * @param isTestData        - Test data flag
 */
export async function recordCopyGrant(params: {
  householdId: string;
  recipientUserId: string;
  grantedByUserId: string | null;
  copyScope: CopyScope;
  isTestData: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO household_copy_grants
       (household_id, recipient_user_id, granted_by_user_id, copy_scope, is_test_data)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.householdId,
      params.recipientUserId,
      params.grantedByUserId,
      JSON.stringify(params.copyScope),
      params.isTestData,
    ]
  );
}
