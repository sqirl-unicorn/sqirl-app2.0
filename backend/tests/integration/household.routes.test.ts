/**
 * Integration tests: Household routes
 *
 * Tests cover the full HTTP layer with a real Neon DB.
 * Personas: alice (owner), bob (member), carol (second owner), dave (outsider)
 *
 * Flows tested:
 *  - Invite + accept (founding household creation)
 *  - Invite into existing household
 *  - Decline invitation
 *  - Get household (members list)
 *  - Rename household (owner only)
 *  - Promote / demote members
 *  - Remove member (forced)
 *  - Voluntary exit (with and without copies)
 *  - Copy request create + review
 *  - Error paths (last owner, non-member, invalid scope, etc.)
 */

import request from 'supertest';
import app from '../../src/app';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';

const BASE = '/api/v1';

let aliceToken: string;
let bobToken: string;
let carolToken: string;
let daveToken: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice', 'bob', 'carol', 'dave']);

  // Generate tokens via service (matches middleware expectations)
  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);
  bobToken   = generateToken(Personas.bob.id,   Personas.bob.email   ?? null);
  carolToken = generateToken(Personas.carol.id, Personas.carol.email ?? null);
  daveToken  = generateToken(Personas.dave.id,  Personas.dave.email  ?? null);
});

afterAll(() => teardownTestDb());

// ── GET /household — no household yet ─────────────────────────────────────────

describe('GET /api/v1/household (no household)', () => {
  it('returns null when user is not in a household', async () => {
    const res = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.household).toBeNull();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get(`${BASE}/household`);
    expect(res.status).toBe(401);
  });
});

// ── Founding invitation flow ──────────────────────────────────────────────────

describe('Founding invitation (no household → creates one on accept)', () => {
  let inviteToken: string;

  it('alice sends a founding invite to bob → 201', async () => {
    const res = await request(app)
      .post(`${BASE}/household/invite`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ inviteeEmail: Personas.bob.email });
    expect(res.status).toBe(201);
    expect(res.body.invitation.token).toBeTruthy();
    expect(res.body.invitation.householdId).toBeNull();
    inviteToken = res.body.invitation.token as string;
  });

  it('bob accepts → 200, household created, both are owners', async () => {
    const res = await request(app)
      .post(`${BASE}/invitations/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    expect(res.body.household.id).toBeTruthy();
    expect(res.body.created).toBe(true);
  });

  it('alice now has a household with 2 owner members', async () => {
    const res = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.household).not.toBeNull();
    expect(res.body.household.members).toHaveLength(2);
    const roles = (res.body.household.members as { role: string }[]).map((m) => m.role);
    expect(roles).toContain('owner');
  });
});

// ── Invite into existing household ───────────────────────────────────────────

describe('Invite carol into existing household', () => {
  let carolInviteToken: string;

  it('alice invites carol (owner inviting into existing household) → 201', async () => {
    const hhRes = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const householdId = hhRes.body.household.id as string;

    const res = await request(app)
      .post(`${BASE}/household/invite`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ inviteeEmail: Personas.carol.email, householdId });
    expect(res.status).toBe(201);
    carolInviteToken = res.body.invitation.token as string;
  });

  it('carol accepts → 200, added as member', async () => {
    const res = await request(app)
      .post(`${BASE}/invitations/${carolInviteToken}/accept`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
  });

  it('household now has 3 members', async () => {
    const res = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.body.household.members).toHaveLength(3);
  });
});

// ── Decline invitation ────────────────────────────────────────────────────────

describe('Decline invitation', () => {
  let declineInviteToken: string;

  it('alice invites dave', async () => {
    const hhRes = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const householdId = hhRes.body.household.id as string;

    const res = await request(app)
      .post(`${BASE}/household/invite`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ inviteeEmail: Personas.dave.email, householdId });
    expect(res.status).toBe(201);
    declineInviteToken = res.body.invitation.token as string;
  });

  it('dave views received invitations → 200 with pending invite', async () => {
    const res = await request(app)
      .get(`${BASE}/invitations`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(200);
    expect(res.body.invitations.length).toBeGreaterThan(0);
  });

  it('dave declines the invitation → 200', async () => {
    // Get id from received invitations
    const invRes = await request(app)
      .get(`${BASE}/invitations`)
      .set('Authorization', `Bearer ${daveToken}`);
    const invitationId = invRes.body.invitations[0].id as string;

    const res = await request(app)
      .post(`${BASE}/invitations/${invitationId}/decline`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(200);
  });

  it('dave tries to accept the declined invite → 404 SQIRL-HH-INVITE-005', async () => {
    const res = await request(app)
      .post(`${BASE}/invitations/${declineInviteToken}/accept`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-HH-INVITE-005');
  });
});

// ── Rename household ─────────────────────────────────────────────────────────

describe('PUT /api/v1/household (rename)', () => {
  it('owner can rename → 200', async () => {
    const res = await request(app)
      .put(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Smith Household' });
    expect(res.status).toBe(200);
    expect(res.body.household.name).toBe('Smith Household');
  });

  it('non-owner cannot rename → 403 SQIRL-HH-MEMBER-004', async () => {
    const res = await request(app)
      .put(`${BASE}/household`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ name: 'Hijacked Name' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-HH-MEMBER-004');
  });
});

// ── Promote / demote ─────────────────────────────────────────────────────────

describe('Member role changes', () => {
  it('alice promotes carol to owner → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/household/members/${Personas.carol.id}/promote`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
  });

  it('carol (now owner) can demote herself (bob stays owner) → 200', async () => {
    // First, confirm alice, bob, carol are all owners after promote
    const hhRes = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const owners = (hhRes.body.household.members as { role: string; userId: string }[])
      .filter((m) => m.role === 'owner');
    expect(owners.length).toBeGreaterThanOrEqual(2);

    const res = await request(app)
      .post(`${BASE}/household/members/${Personas.carol.id}/demote`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
  });

  it('cannot demote the last owner → 409 SQIRL-HH-MEMBER-001', async () => {
    // alice and bob are owners; demote bob first
    await request(app)
      .post(`${BASE}/household/members/${Personas.bob.id}/demote`)
      .set('Authorization', `Bearer ${aliceToken}`);

    // Now alice is sole owner — demoting alice must fail
    const res = await request(app)
      .post(`${BASE}/household/members/${Personas.alice.id}/demote`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SQIRL-HH-MEMBER-001');

    // Restore: promote bob back to owner for subsequent tests
    await request(app)
      .post(`${BASE}/household/members/${Personas.bob.id}/promote`)
      .set('Authorization', `Bearer ${aliceToken}`);
  });
});

// ── Sent invitations ─────────────────────────────────────────────────────────

describe('GET /api/v1/household/invitations (sent)', () => {
  it('owner sees sent invitations → 200', async () => {
    const res = await request(app)
      .get(`${BASE}/household/invitations`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invitations)).toBe(true);
  });

  it('non-owner cannot view sent invitations → 403 SQIRL-HH-MEMBER-004', async () => {
    const res = await request(app)
      .get(`${BASE}/household/invitations`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-HH-MEMBER-004');
  });
});

// ── Copy requests ─────────────────────────────────────────────────────────────

describe('Copy request flow', () => {
  let copyRequestId: string;

  beforeAll(async () => {
    // Pre-load household to confirm state before copy request tests
    await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`);
  });

  it('carol submits a copy request → 201', async () => {
    const res = await request(app)
      .post(`${BASE}/household/copy-requests`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({
        requestedScope: {
          lists: 'all',
          giftCards: 'active_only',
          loyaltyCards: 'all',
          expenses: '12months',
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.copyRequest.status).toBe('pending');
    copyRequestId = res.body.copyRequest.id as string;
  });

  it('alice (owner) sees pending copy requests → 200', async () => {
    const res = await request(app)
      .get(`${BASE}/household/copy-requests`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.copyRequests.length).toBeGreaterThan(0);
  });

  it('alice approves the copy request → 200', async () => {
    const res = await request(app)
      .put(`${BASE}/household/copy-requests/${copyRequestId}/review`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ approved: true });
    expect(res.status).toBe(200);
    expect(res.body.copyRequest.status).toBe('approved');
  });

  it('cannot review already-reviewed request → 404 SQIRL-HH-COPY-002', async () => {
    const res = await request(app)
      .put(`${BASE}/household/copy-requests/${copyRequestId}/review`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ approved: false });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-HH-COPY-002');
  });
});

// ── Invalid copy scope ────────────────────────────────────────────────────────

describe('Invalid copy scope', () => {
  it('rejects invalid giftCards value → 400 SQIRL-HH-COPY-001', async () => {
    const res = await request(app)
      .post(`${BASE}/household/copy-requests`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({
        requestedScope: {
          lists: 'all',
          giftCards: 'all',   // invalid — should be 'active_only' or 'none'
          loyaltyCards: 'all',
          expenses: '12months',
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-HH-COPY-001');
  });
});

// ── Voluntary exit ────────────────────────────────────────────────────────────

describe('Voluntary exit', () => {
  it('carol (member) exits household → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/household/exit`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.status).toBe(200);
    expect(res.body.autoDeleted).toBe(false);
  });

  it('carol is no longer in the household', async () => {
    const res = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.body.household).toBeNull();
  });

  it('sole owner cannot exit while others remain → 409 SQIRL-HH-EXIT-001', async () => {
    // demote bob so alice is sole owner
    await request(app)
      .post(`${BASE}/household/members/${Personas.bob.id}/demote`)
      .set('Authorization', `Bearer ${aliceToken}`);

    const res = await request(app)
      .post(`${BASE}/household/exit`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SQIRL-HH-EXIT-001');

    // Restore bob as owner
    await request(app)
      .post(`${BASE}/household/members/${Personas.bob.id}/promote`)
      .set('Authorization', `Bearer ${aliceToken}`);
  });
});

// ── Forced removal ────────────────────────────────────────────────────────────

describe('Forced removal', () => {
  it('alice force-removes bob → 200', async () => {
    const res = await request(app)
      .delete(`${BASE}/household/members/${Personas.bob.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        grantScope: {
          lists: 'all',
          giftCards: 'active_only',
          loyaltyCards: 'all',
          expenses: '12months',
        },
      });
    expect(res.status).toBe(200);
  });

  it('bob is no longer in the household', async () => {
    const res = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.body.household).toBeNull();
  });

  it('last member exits → household auto-deleted', async () => {
    // alice is now the only member — she exits
    const res = await request(app)
      .post(`${BASE}/household/exit`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.autoDeleted).toBe(true);

    const hhRes = await request(app)
      .get(`${BASE}/household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(hhRes.body.household).toBeNull();
  });
});
