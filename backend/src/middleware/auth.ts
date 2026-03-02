/**
 * JWT authentication middleware.
 *
 * Verifies the Bearer token from the Authorization header and attaches
 * the decoded payload to req.user. Rejects with a structured error
 * (including errorCode) if the token is missing, malformed, or expired.
 *
 * Error codes:
 *   SQIRL-AUTH-MW-001 — Missing or malformed Authorization header
 *   SQIRL-AUTH-MW-002 — Invalid or expired JWT
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  email: string;
}

// Extend Express Request to carry the decoded JWT payload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware that verifies the JWT in `Authorization: Bearer <token>`.
 * Sets req.user on success; returns 401 with errorCode on failure.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required',
      errorCode: 'SQIRL-AUTH-MW-001',
    });
    return;
  }

  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({
      error: 'Server misconfiguration',
      errorCode: 'SQIRL-SYS-CFG-001',
    });
    return;
  }

  try {
    req.user = jwt.verify(token, secret) as JwtPayload;
    next();
  } catch {
    res.status(401).json({
      error: 'Invalid or expired token',
      errorCode: 'SQIRL-AUTH-MW-002',
    });
  }
}

/**
 * Middleware that checks if the authenticated user is an admin.
 * Must be used after `authenticate`.
 *
 * Error codes:
 *   SQIRL-AUTH-MW-003 — User is not in the admin whitelist
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim());

  if (!req.user || !adminEmails.includes(req.user.email)) {
    res.status(403).json({
      error: 'Admin access required',
      errorCode: 'SQIRL-AUTH-MW-003',
    });
    return;
  }

  next();
}
