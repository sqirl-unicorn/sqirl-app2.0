/**
 * Unit tests: analyticsService pure helpers
 *
 * Tests cover:
 *  - isValidPlatform: accepts web/mobile/tablet, rejects others
 *  - sanitizeProperties: strips known PII keys, passes safe keys through
 *  - isValidEventType: rejects empty string or non-string
 *  - MAX_BATCH_SIZE constant
 */

import {
  isValidPlatform,
  sanitizeProperties,
  isValidEventType,
  MAX_BATCH_SIZE,
} from '../../src/services/analyticsService';

// ── isValidPlatform ───────────────────────────────────────────────────────────

describe('isValidPlatform', () => {
  it('accepts "web"', () => {
    expect(isValidPlatform('web')).toBe(true);
  });

  it('accepts "mobile"', () => {
    expect(isValidPlatform('mobile')).toBe(true);
  });

  it('accepts "tablet"', () => {
    expect(isValidPlatform('tablet')).toBe(true);
  });

  it('rejects unknown string', () => {
    expect(isValidPlatform('desktop')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPlatform('')).toBe(false);
  });
});

// ── isValidEventType ──────────────────────────────────────────────────────────

describe('isValidEventType', () => {
  it('accepts a dot-namespaced event type', () => {
    expect(isValidEventType('expense.added')).toBe(true);
  });

  it('accepts a simple event type', () => {
    expect(isValidEventType('auth.login')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidEventType('')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(isValidEventType('   ')).toBe(false);
  });
});

// ── sanitizeProperties ────────────────────────────────────────────────────────

describe('sanitizeProperties', () => {
  it('passes through safe properties', () => {
    const input = { amount: 42.5, categoryId: 'cat-1', scope: 'personal', hasLocation: true };
    expect(sanitizeProperties(input)).toEqual(input);
  });

  it('strips email', () => {
    const result = sanitizeProperties({ email: 'user@example.com', amount: 10 });
    expect(result).not.toHaveProperty('email');
    expect(result.amount).toBe(10);
  });

  it('strips phone', () => {
    const result = sanitizeProperties({ phone: '+61412000001', brandId: 'woolworths' });
    expect(result).not.toHaveProperty('phone');
    expect(result.brandId).toBe('woolworths');
  });

  it('strips firstName', () => {
    const result = sanitizeProperties({ firstName: 'Alice', amount: 5 });
    expect(result).not.toHaveProperty('firstName');
  });

  it('strips lastName', () => {
    const result = sanitizeProperties({ lastName: 'Smith', amount: 5 });
    expect(result).not.toHaveProperty('lastName');
  });

  it('strips cardNumber', () => {
    const result = sanitizeProperties({ cardNumber: '1234567890', brandId: 'coles' });
    expect(result).not.toHaveProperty('cardNumber');
    expect(result.brandId).toBe('coles');
  });

  it('strips pin', () => {
    const result = sanitizeProperties({ pin: '1234', balance: 50 });
    expect(result).not.toHaveProperty('pin');
    expect(result.balance).toBe(50);
  });

  it('strips token', () => {
    const result = sanitizeProperties({ token: 'jwt-abc', platform: 'web' });
    expect(result).not.toHaveProperty('token');
  });

  it('strips description (free-text that may contain PII)', () => {
    const result = sanitizeProperties({ description: 'Lunch with Alice', amount: 25 });
    expect(result).not.toHaveProperty('description');
    expect(result.amount).toBe(25);
  });

  it('strips notes', () => {
    const result = sanitizeProperties({ notes: 'For mum', amount: 15 });
    expect(result).not.toHaveProperty('notes');
  });

  it('does not mutate the original object', () => {
    const input = { email: 'a@b.com', amount: 1 };
    sanitizeProperties(input);
    expect(input.email).toBe('a@b.com');
  });
});

// ── MAX_BATCH_SIZE ────────────────────────────────────────────────────────────

describe('MAX_BATCH_SIZE', () => {
  it('is a positive number', () => {
    expect(MAX_BATCH_SIZE).toBeGreaterThan(0);
  });

  it('is at most 500', () => {
    expect(MAX_BATCH_SIZE).toBeLessThanOrEqual(500);
  });
});
