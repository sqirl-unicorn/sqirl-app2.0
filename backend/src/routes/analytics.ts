/**
 * Analytics routes — behavioural event ingestion.
 *
 * POST /events  — Authenticated batch insert. Clients flush their local queue here.
 *
 * Design:
 *  - Invalid events in a mixed batch are silently skipped (partial success).
 *  - PII sanitization happens in the service layer, not here.
 *  - is_test_data is derived from the authenticated user's email domain.
 *
 * Error codes:
 *   SQIRL-ANALYTIC-001   events missing or not an array
 *   SQIRL-ANALYTIC-002   batch exceeds MAX_BATCH_SIZE
 *   SQIRL-ANALYTIC-003   no valid events remain after filtering
 *   SQIRL-ANALYTIC-SERVER-001   unexpected server error
 */

import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  batchInsertEvents,
  isValidPlatform,
  isValidEventType,
  MAX_BATCH_SIZE,
  type AnalyticsEventInput,
} from '../services/analyticsService';

const router = Router();

// ── POST /events ──────────────────────────────────────────────────────────────

/**
 * Batch-ingest analytics events from a client.
 *
 * Accepts up to MAX_BATCH_SIZE events per request.
 * Events with missing/invalid fields are silently skipped.
 * Returns the number of successfully inserted events.
 */
router.post('/events', authenticate, async (req: Request, res: Response) => {
  try {
    const { events } = req.body as { events?: unknown };

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        error: 'events must be a non-empty array',
        errorCode: 'SQIRL-ANALYTIC-001',
      });
    }

    if (events.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        error: `Batch size ${events.length} exceeds maximum of ${MAX_BATCH_SIZE}`,
        errorCode: 'SQIRL-ANALYTIC-002',
      });
    }

    // Validate and coerce each event; skip malformed ones
    const valid: AnalyticsEventInput[] = [];
    for (const e of events) {
      if (typeof e !== 'object' || e === null) continue;
      const ev = e as Record<string, unknown>;

      if (!isValidEventType(String(ev.eventType ?? ''))) continue;
      if (typeof ev.sessionId !== 'string' || !ev.sessionId) continue;
      if (typeof ev.platform !== 'string' || !isValidPlatform(ev.platform)) continue;
      if (typeof ev.occurredAt !== 'string' || !ev.occurredAt) continue;

      valid.push({
        sessionId:  ev.sessionId,
        eventType:  String(ev.eventType),
        properties: (typeof ev.properties === 'object' && ev.properties !== null)
          ? (ev.properties as Record<string, unknown>)
          : {},
        platform:   ev.platform as 'web' | 'mobile' | 'tablet',
        appVersion: typeof ev.appVersion === 'string' ? ev.appVersion : undefined,
        occurredAt: ev.occurredAt,
      });
    }

    if (valid.length === 0) {
      return res.status(400).json({
        error: 'No valid events in batch',
        errorCode: 'SQIRL-ANALYTIC-003',
      });
    }

    // Determine test-data flag from authenticated user's email domain
    const email = req.user?.email ?? '';
    const isTestData = email.endsWith('@test.sqirl.net');

    const count = await batchInsertEvents(req.user!.userId, valid, isTestData);
    return res.json({ count });

  } catch (err) {
    console.error('SQIRL-ANALYTIC-SERVER-001', err);
    return res.status(500).json({
      error: 'Internal server error',
      errorCode: 'SQIRL-ANALYTIC-SERVER-001',
    });
  }
});

export default router;
