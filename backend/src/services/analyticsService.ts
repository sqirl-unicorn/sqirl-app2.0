/**
 * Analytics Service — behavioural event ingestion.
 *
 * Design principles:
 *  - Zero PII: sanitizeProperties() strips all sensitive fields before DB insert
 *  - Batch-first: single INSERT per client flush (unnest pattern for efficiency)
 *  - Offline-safe: clients queue events locally and flush in bulk
 *  - Test isolation: is_test_data flag mirrors user's test status
 *
 * PII fields stripped (always): email, phone, firstName, lastName, name,
 *   password, token, cardNumber, pin, description, notes, location, business
 *
 * Error codes:
 *   (none thrown — errors in this service are logged and surfaced via the route)
 */

import { pool } from '../db';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum events accepted in a single batch request. */
export const MAX_BATCH_SIZE = 200;

/** PII keys that must never appear in stored analytics properties. */
const PII_KEYS = new Set([
  'email', 'phone', 'firstName', 'lastName', 'name',
  'password', 'token', 'cardNumber', 'pin',
  'description',  // free-text expense/item descriptions may contain names
  'notes',        // arbitrary user notes
  'location',     // specific address strings
  'business',     // business name entered by user
]);

const VALID_PLATFORMS = new Set(['web', 'mobile', 'tablet']);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnalyticsEventInput {
  sessionId: string;
  eventType: string;
  properties: Record<string, unknown>;
  platform: 'web' | 'mobile' | 'tablet';
  appVersion?: string;
  occurredAt: string;
}

export interface AnalyticsEventRow {
  id: string;
  userId: string | null;
  sessionId: string;
  eventType: string;
  properties: Record<string, unknown>;
  platform: string;
  appVersion: string | null;
  occurredAt: string;
  receivedAt: string;
  isTestData: boolean;
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Returns true if the platform string is one of the accepted values.
 * @param p - Platform string from client
 */
export function isValidPlatform(p: string): p is 'web' | 'mobile' | 'tablet' {
  return VALID_PLATFORMS.has(p);
}

/**
 * Returns true if the event type is a non-empty, non-whitespace string.
 * @param t - Event type string from client
 */
export function isValidEventType(t: string): boolean {
  return typeof t === 'string' && t.trim().length > 0;
}

/**
 * Returns a shallow copy of props with all PII keys removed.
 * Does NOT mutate the input object.
 *
 * @param props - Raw properties from the client payload
 * @returns Sanitized copy safe for persistence
 */
export function sanitizeProperties(
  props: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!PII_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

// ── DB operations ─────────────────────────────────────────────────────────────

/**
 * Batch-insert analytics events for one authenticated user.
 * Uses PostgreSQL unnest() for a single round-trip regardless of batch size.
 *
 * @param userId     - Authenticated user's UUID
 * @param events     - Validated, non-empty array of event inputs
 * @param isTestData - True when the user is a test account (filters from metrics)
 * @returns Number of rows inserted
 */
export async function batchInsertEvents(
  userId: string,
  events: AnalyticsEventInput[],
  isTestData: boolean
): Promise<number> {
  if (events.length === 0) return 0;

  const userIds     = events.map(() => userId);
  const sessionIds  = events.map((e) => e.sessionId);
  const types       = events.map((e) => e.eventType);
  const props       = events.map((e) => JSON.stringify(sanitizeProperties(e.properties)));
  const platforms   = events.map((e) => e.platform);
  const versions    = events.map((e) => e.appVersion ?? null);
  const times       = events.map((e) => e.occurredAt);
  const testFlags   = events.map(() => isTestData);

  await pool.query(
    `INSERT INTO analytics_events
       (user_id, session_id, event_type, properties, platform, app_version, occurred_at, is_test_data)
     SELECT * FROM unnest(
       $1::uuid[], $2::text[], $3::text[], $4::jsonb[],
       $5::text[], $6::text[], $7::timestamptz[], $8::boolean[]
     )`,
    [userIds, sessionIds, types, props, platforms, versions, times, testFlags]
  );

  return events.length;
}

/**
 * Fetch the most recent analytics events for a user (admin / debug use only).
 * @param userId - User ID to query
 * @param limit  - Maximum rows to return (default 100)
 */
export async function getRecentEvents(
  userId: string,
  limit = 100
): Promise<AnalyticsEventRow[]> {
  const res = await pool.query(
    `SELECT * FROM analytics_events
     WHERE user_id = $1
     ORDER BY occurred_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows.map((r) => ({
    id:          r.id as string,
    userId:      r.user_id as string | null,
    sessionId:   r.session_id as string,
    eventType:   r.event_type as string,
    properties:  r.properties as Record<string, unknown>,
    platform:    r.platform as string,
    appVersion:  r.app_version as string | null,
    occurredAt:  r.occurred_at as string,
    receivedAt:  r.received_at as string,
    isTestData:  r.is_test_data as boolean,
  }));
}
