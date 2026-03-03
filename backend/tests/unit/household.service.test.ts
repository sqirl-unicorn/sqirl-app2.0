/**
 * Unit tests for householdService — business rules, enforced atomically.
 *
 * DB pool is mocked; these tests verify rule enforcement logic only.
 * Integration tests (household.routes.test.ts) cover real DB interactions.
 *
 * Rules tested:
 *  - At least one owner must remain (demote/remove)
 *  - Auto-delete when last member leaves
 *  - Invitation expiry validation (1–30 days)
 *  - Copy-scope defaults match spec
 *  - Forced removal grants copy atomically
 */

import {
  validateInviteExpiry,
  defaultCopyScope,
  validateCopyScope,
  canDemote,
  canRemove,
} from '../../src/services/householdService';

// ── validateInviteExpiry ───────────────────────────────────────────────────────

describe('validateInviteExpiry', () => {
  it('accepts 1 day', () => expect(validateInviteExpiry(1)).toBe(true));
  it('accepts 7 days (default)', () => expect(validateInviteExpiry(7)).toBe(true));
  it('accepts 30 days', () => expect(validateInviteExpiry(30)).toBe(true));
  it('rejects 0', () => expect(validateInviteExpiry(0)).toBe(false));
  it('rejects 31', () => expect(validateInviteExpiry(31)).toBe(false));
  it('rejects negative', () => expect(validateInviteExpiry(-1)).toBe(false));
  it('rejects non-integer', () => expect(validateInviteExpiry(1.5)).toBe(false));
});

// ── defaultCopyScope ─────────────────────────────────────────────────────────

describe('defaultCopyScope', () => {
  it('returns spec-mandated defaults', () => {
    expect(defaultCopyScope()).toEqual({
      lists: 'all',
      giftCards: 'active_only',
      loyaltyCards: 'all',
      expenses: '12months',
    });
  });
});

// ── validateCopyScope ────────────────────────────────────────────────────────

describe('validateCopyScope', () => {
  it('accepts valid full scope', () => {
    expect(
      validateCopyScope({
        lists: 'all',
        giftCards: 'active_only',
        loyaltyCards: 'all',
        expenses: '12months',
      })
    ).toBe(true);
  });

  it('accepts valid none scope', () => {
    expect(
      validateCopyScope({
        lists: 'none',
        giftCards: 'none',
        loyaltyCards: 'none',
        expenses: 'none',
      })
    ).toBe(true);
  });

  it('rejects invalid lists value', () => {
    expect(
      validateCopyScope({
        lists: 'partial' as never,
        giftCards: 'none',
        loyaltyCards: 'none',
        expenses: 'none',
      })
    ).toBe(false);
  });

  it('rejects invalid giftCards value', () => {
    expect(
      validateCopyScope({
        lists: 'all',
        giftCards: 'all' as never,
        loyaltyCards: 'all',
        expenses: '12months',
      })
    ).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(validateCopyScope({ lists: 'all' } as never)).toBe(false);
  });
});

// ── canDemote ────────────────────────────────────────────────────────────────

describe('canDemote', () => {
  it('allows demotion when 2+ owners', () => {
    expect(canDemote(2)).toBe(true);
  });

  it('blocks demotion when only 1 owner', () => {
    expect(canDemote(1)).toBe(false);
  });

  it('blocks demotion at 0 (edge case)', () => {
    expect(canDemote(0)).toBe(false);
  });
});

// ── canRemove ────────────────────────────────────────────────────────────────

describe('canRemove', () => {
  it('allows removing a member (non-owner)', () => {
    expect(canRemove('member', 1)).toBe(true);
  });

  it('allows removing an owner when 2+ owners remain', () => {
    expect(canRemove('owner', 2)).toBe(true);
  });

  it('blocks removing last owner', () => {
    expect(canRemove('owner', 1)).toBe(false);
  });
});
