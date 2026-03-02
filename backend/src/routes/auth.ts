/**
 * Auth routes — zero-knowledge registration and login.
 *
 * POST /register  — create account (email OR phone + firstName + ZK keys)
 * POST /login     — authenticate, return encrypted blobs for client-side decryption
 * GET  /verify    — validate Bearer token, return current user
 *
 * Error codes:
 *   SQIRL-AUTH-REG-001   Missing required fields
 *   SQIRL-AUTH-REG-002   Duplicate email
 *   SQIRL-AUTH-REG-003   Duplicate phone
 *   SQIRL-AUTH-LOGIN-001 Missing identifier or password
 *   SQIRL-AUTH-LOGIN-002 Invalid credentials (user not found or wrong password)
 *   SQIRL-AUTH-SERVER-001 Unexpected server error
 */

import { Router, Request, Response } from 'express';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  createUser,
  findUserForLogin,
  findUserById,
} from '../services/authService';
import { detectCountry, isValidCountry } from '../services/geoService';
import { authenticate } from '../middleware/auth';

const router = Router();

// ── POST /register ────────────────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      email,
      phone,
      firstName,
      password,
      publicKey,
      encryptedPrivateKey,
      salt,
      country,
      recoveryKeySlots,
    } = req.body as Record<string, unknown>;

    // Validate required ZK fields
    if (
      !firstName ||
      !password ||
      !publicKey ||
      !encryptedPrivateKey ||
      !salt ||
      (!email && !phone)
    ) {
      res.status(400).json({
        error: 'firstName, password, publicKey, encryptedPrivateKey, salt and email or phone are required',
        errorCode: 'SQIRL-AUTH-REG-001',
      });
      return;
    }

    // Resolve country: client-provided → header-detected → default AU
    let resolvedCountry = 'AU';
    if (typeof country === 'string' && country && isValidCountry(country)) {
      resolvedCountry = country.toUpperCase();
    } else {
      resolvedCountry = detectCountry(req) ?? 'AU';
    }

    const passwordHash = await hashPassword(password as string);

    const user = await createUser({
      email: typeof email === 'string' ? email.toLowerCase() : undefined,
      phone: typeof phone === 'string' ? phone : undefined,
      firstName: firstName as string,
      passwordHash,
      publicKey: publicKey as string,
      encryptedPrivateKey: encryptedPrivateKey as string,
      salt: salt as string,
      country: resolvedCountry,
      recoveryKeySlots: Array.isArray(recoveryKeySlots)
        ? (recoveryKeySlots as string[])
        : undefined,
    });

    const token = generateToken(user.id, user.email);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        country: user.country,
        isAdmin: user.isAdmin,
        hasRecoveryKeys: user.recoveryKeySlots !== null,
      },
      tokens: { accessToken: token },
    });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      // Determine which unique constraint was violated
      const detail = (err as { detail?: string }).detail ?? '';
      if (detail.includes('email')) {
        res.status(409).json({ error: 'Email already registered', errorCode: 'SQIRL-AUTH-REG-002' });
      } else {
        res.status(409).json({ error: 'Phone already registered', errorCode: 'SQIRL-AUTH-REG-003' });
      }
      return;
    }
    console.error('SQIRL-AUTH-SERVER-001: registration error', err);
    res.status(500).json({ error: 'Registration failed', errorCode: 'SQIRL-AUTH-SERVER-001' });
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, phone, password } = req.body as Record<string, unknown>;

    if (!password || (!email && !phone)) {
      res.status(400).json({
        error: 'email or phone, and password are required',
        errorCode: 'SQIRL-AUTH-LOGIN-001',
      });
      return;
    }

    const user = await findUserForLogin(
      typeof email === 'string' ? email.toLowerCase() : undefined,
      typeof phone === 'string' ? phone : undefined
    );

    // Constant-time: always run bcrypt even on miss to prevent timing attacks
    const passwordMatch = user
      ? await verifyPassword(password as string, user.passwordHash)
      : await verifyPassword(password as string, '$2b$10$invalidhashpadding000000000000000000000000000000000000');

    if (!user || !passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials', errorCode: 'SQIRL-AUTH-LOGIN-002' });
      return;
    }

    const token = generateToken(user.id, user.email);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        country: user.country,
        isAdmin: user.isAdmin,
        hasRecoveryKeys: user.recoveryKeySlots !== null,
      },
      tokens: { accessToken: token },
      // Return encrypted blobs so client can unlock the private key
      encryptedPrivateKey: user.encryptedPrivateKey,
      salt: user.salt,
    });
  } catch (err) {
    console.error('SQIRL-AUTH-SERVER-001: login error', err);
    res.status(500).json({ error: 'Login failed', errorCode: 'SQIRL-AUTH-SERVER-001' });
  }
});

// ── GET /verify ───────────────────────────────────────────────────────────────

router.get('/verify', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found', errorCode: 'SQIRL-AUTH-MW-002' });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        country: user.country,
        isAdmin: user.isAdmin,
        hasRecoveryKeys: user.recoveryKeySlots !== null,
      },
    });
  } catch (err) {
    console.error('SQIRL-AUTH-SERVER-001: verify error', err);
    res.status(500).json({ error: 'Verification failed', errorCode: 'SQIRL-AUTH-SERVER-001' });
  }
});

export default router;
