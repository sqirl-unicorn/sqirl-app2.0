/**
 * Unit tests for auth middleware (authenticate + requireAdmin).
 *
 * Tests run in isolation — no DB required.
 * Error codes verified on every rejection path.
 */

import { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { authenticate, requireAdmin, type JwtPayload } from '../../src/middleware/auth';

const SECRET = 'test-secret';

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  process.env.ADMIN_EMAILS = 'admin@sqirl.net';
});

// ── Helper builders ──────────────────────────────────────────────────────────

function mockRes(): Response {
  const res = { status: jest.fn(), json: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

function mockNext(): NextFunction {
  return jest.fn();
}

function makeToken(payload: JwtPayload, expiresIn: SignOptions['expiresIn'] = '1h'): string {
  return jwt.sign(payload, SECRET, { expiresIn });
}

// ── authenticate ─────────────────────────────────────────────────────────────

describe('authenticate', () => {
  it('calls next() and sets req.user for a valid token', () => {
    const payload: JwtPayload = { userId: 'u1', email: 'alice@sqirl.net' };
    const req = {
      headers: { authorization: `Bearer ${makeToken(payload)}` },
    } as Request;
    const res = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.userId).toBe('u1');
    expect(req.user?.email).toBe('alice@sqirl.net');
  });

  it('returns 401 SQIRL-AUTH-MW-001 when Authorization header is missing', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SQIRL-AUTH-MW-001' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 SQIRL-AUTH-MW-001 when Authorization header has wrong format', () => {
    const req = { headers: { authorization: 'Basic abc' } } as Request;
    const res = mockRes();
    authenticate(req, res, mockNext());
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SQIRL-AUTH-MW-001' })
    );
  });

  it('returns 401 SQIRL-AUTH-MW-002 for an invalid token', () => {
    const req = {
      headers: { authorization: 'Bearer not.a.valid.token' },
    } as Request;
    const res = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SQIRL-AUTH-MW-002' })
    );
  });

  it('returns 401 SQIRL-AUTH-MW-002 for an expired token', () => {
    const token = makeToken({ userId: 'u1', email: 'x@y.com' }, '-1s');
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();

    authenticate(req, res, mockNext());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SQIRL-AUTH-MW-002' })
    );
  });

  it('returns 500 SQIRL-SYS-CFG-001 when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    const req = {
      headers: { authorization: 'Bearer sometoken' },
    } as Request;
    const res = mockRes();

    authenticate(req, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SQIRL-SYS-CFG-001' })
    );
  });
});

// ── requireAdmin ─────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('calls next() when user email is in ADMIN_EMAILS', () => {
    const req = { user: { userId: 'u1', email: 'admin@sqirl.net' } } as Request;
    const res = mockRes();
    const next = mockNext();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 SQIRL-AUTH-MW-003 when user email is not admin', () => {
    const req = { user: { userId: 'u1', email: 'alice@sqirl.net' } } as Request;
    const res = mockRes();
    const next = mockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SQIRL-AUTH-MW-003' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 SQIRL-AUTH-MW-003 when req.user is undefined', () => {
    const req = {} as Request;
    const res = mockRes();

    requireAdmin(req, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SQIRL-AUTH-MW-003' })
    );
  });
});
