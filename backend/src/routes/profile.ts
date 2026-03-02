/**
 * Profile routes — user profile management and recovery key setup.
 *
 * GET  /profile              — fetch current user's profile
 * PUT  /profile              — update firstName / country
 * GET  /profile/countries    — list of countries for dropdown
 * GET  /profile/recovery-keys — check if recovery keys are set up
 * PUT  /profile/recovery-keys — save 5 encrypted recovery key slots
 *
 * Error codes:
 *   SQIRL-PROFILE-001    Invalid country code
 *   SQIRL-PROFILE-002    User not found
 *   SQIRL-RECOVERY-001   slots must be exactly 5 non-empty strings
 *   SQIRL-PROFILE-SERVER-001  Unexpected server error
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  findUserById,
  updateUserProfile,
  saveRecoveryKeySlots,
} from '../services/authService';
import {
  isValidCountry,
  getAllCountries,
} from '../services/geoService';

const router = Router();

// All profile routes require auth
router.use(authenticate);

// ── GET /profile ──────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found', errorCode: 'SQIRL-PROFILE-002' });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      country: user.country,
      isAdmin: user.isAdmin,
      hasRecoveryKeys: user.recoveryKeySlots !== null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('SQIRL-PROFILE-SERVER-001:', err);
    res.status(500).json({ error: 'Failed to fetch profile', errorCode: 'SQIRL-PROFILE-SERVER-001' });
  }
});

// ── PUT /profile ──────────────────────────────────────────────────────────────

router.put('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, country } = req.body as Record<string, unknown>;

    if (typeof country === 'string' && country && !isValidCountry(country)) {
      res.status(400).json({
        error: 'Invalid country code. Use ISO 3166-1 alpha-2 (e.g. AU, US, GB)',
        errorCode: 'SQIRL-PROFILE-001',
      });
      return;
    }

    const updated = await updateUserProfile(req.user!.userId, {
      firstName: typeof firstName === 'string' ? firstName : undefined,
      country: typeof country === 'string' ? country.toUpperCase() : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: 'User not found', errorCode: 'SQIRL-PROFILE-002' });
      return;
    }

    res.json({
      id: updated.id,
      email: updated.email,
      phone: updated.phone,
      firstName: updated.firstName,
      country: updated.country,
      isAdmin: updated.isAdmin,
      hasRecoveryKeys: updated.recoveryKeySlots !== null,
      createdAt: updated.createdAt,
    });
  } catch (err) {
    console.error('SQIRL-PROFILE-SERVER-001:', err);
    res.status(500).json({ error: 'Failed to update profile', errorCode: 'SQIRL-PROFILE-SERVER-001' });
  }
});

// ── GET /profile/countries ────────────────────────────────────────────────────

router.get('/countries', (_req: Request, res: Response): void => {
  res.json({ countries: getAllCountries() });
});

// ── GET /profile/recovery-keys ────────────────────────────────────────────────

router.get('/recovery-keys', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found', errorCode: 'SQIRL-PROFILE-002' });
      return;
    }
    // Only return status — never return the actual encrypted slots to the client
    res.json({ hasRecoveryKeys: user.recoveryKeySlots !== null });
  } catch (err) {
    console.error('SQIRL-PROFILE-SERVER-001:', err);
    res.status(500).json({ error: 'Failed to fetch recovery status', errorCode: 'SQIRL-PROFILE-SERVER-001' });
  }
});

// ── PUT /profile/recovery-keys ────────────────────────────────────────────────

router.put('/recovery-keys', async (req: Request, res: Response): Promise<void> => {
  try {
    const { slots } = req.body as Record<string, unknown>;

    if (
      !Array.isArray(slots) ||
      slots.length !== 5 ||
      slots.some((s) => typeof s !== 'string' || !s)
    ) {
      res.status(400).json({
        error: 'slots must be an array of exactly 5 non-empty strings',
        errorCode: 'SQIRL-RECOVERY-001',
      });
      return;
    }

    await saveRecoveryKeySlots(req.user!.userId, slots as string[]);
    res.json({ hasRecoveryKeys: true });
  } catch (err) {
    console.error('SQIRL-PROFILE-SERVER-001:', err);
    res.status(500).json({ error: 'Failed to save recovery keys', errorCode: 'SQIRL-PROFILE-SERVER-001' });
  }
});

export default router;
