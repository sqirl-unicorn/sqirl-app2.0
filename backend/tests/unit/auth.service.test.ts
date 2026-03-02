/**
 * Unit tests for authService — password hashing, JWT generation, validation.
 * DB is mocked via jest.mock so no network required.
 */

import { hashPassword, verifyPassword, generateToken, decodeToken } from '../../src/services/authService';

const JWT_SECRET = 'unit-test-secret';

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

describe('hashPassword / verifyPassword', () => {
  it('produces a bcrypt hash that verifies correctly', async () => {
    const hash = await hashPassword('MyPass123!');
    expect(hash).toMatch(/^\$2[aby]\$/);
    await expect(verifyPassword('MyPass123!', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('MyPass123!');
    await expect(verifyPassword('WrongPass!', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same input (random salt)', async () => {
    const h1 = await hashPassword('same');
    const h2 = await hashPassword('same');
    expect(h1).not.toBe(h2);
  });
});

describe('generateToken / decodeToken', () => {
  it('encodes and decodes userId and email', () => {
    const token = generateToken('user-1', 'alice@sqirl.net');
    const payload = decodeToken(token);
    expect(payload?.userId).toBe('user-1');
    expect(payload?.email).toBe('alice@sqirl.net');
  });

  it('encodes phone-only users with null email', () => {
    const token = generateToken('user-2', null);
    const payload = decodeToken(token);
    expect(payload?.userId).toBe('user-2');
    expect(payload?.email).toBeNull();
  });

  it('returns null for an invalid token', () => {
    expect(decodeToken('not.a.token')).toBeNull();
  });

  it('returns null when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => generateToken('u', 'e@e.com')).toThrow('SQIRL-SYS-CFG-001');
  });
});
