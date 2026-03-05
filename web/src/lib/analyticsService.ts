/**
 * Web Analytics Service — privacy-focused behavioural event tracking.
 *
 * Architecture:
 *  - Events are queued in memory and persisted to localStorage (offline-first).
 *  - Auto-flush every 30 s or when queue reaches MAX_QUEUE_SIZE.
 *  - Flushed on page unload via beforeunload event.
 *  - Opt-out stored in localStorage; calling setOptOut(true) also clears queue.
 *  - On flush failure the batch is re-queued (prepended) to avoid data loss,
 *    capped at MAX_STORED_EVENTS to prevent unbounded growth.
 *  - PII sanitization is enforced server-side; clients should still avoid sending
 *    description, notes, email, phone, name, cardNumber, pin, location, business.
 *
 * Usage:
 *   import { analytics } from './analyticsService';
 *   analytics.track('expense.added', { amount: 42.5, scope: 'personal', categoryId: 'cat-1', hasLocation: true });
 */

import { api } from './api';

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_KEY         = 'sqirl:analytics:queue';
const OPT_OUT_KEY       = 'sqirl:analytics:opt_out';
const SESSION_KEY       = 'sqirl:analytics:session';
const FLUSH_INTERVAL_MS = 30_000;
const MAX_QUEUE_SIZE    = 50;   // auto-flush when queue reaches this length
const MAX_STORED_EVENTS = 500;  // hard cap on localStorage queue size

// ── Internal types ────────────────────────────────────────────────────────────

interface QueuedEvent {
  sessionId:   string;
  eventType:   string;
  properties:  Record<string, unknown>;
  platform:    'web';
  occurredAt:  string;
}

// ── Analytics service class ───────────────────────────────────────────────────

class WebAnalyticsService {
  private sessionId: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor() {
    // Restore or generate a session ID that lasts for the browser session.
    this.sessionId = (
      sessionStorage.getItem(SESSION_KEY) ?? crypto.randomUUID()
    );
    sessionStorage.setItem(SESSION_KEY, this.sessionId);

    this.startAutoFlush();

    // Best-effort flush on tab close / navigation away.
    window.addEventListener('beforeunload', () => {
      void this.flush();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enqueue a single behavioural event.
   * Silently no-ops if the user has opted out.
   *
   * @param eventType  - Dot-namespaced identifier, e.g. 'expense.added'
   * @param properties - Non-PII contextual data (amounts, IDs, booleans, dates)
   */
  track(eventType: string, properties: Record<string, unknown> = {}): void {
    if (this.isOptedOut()) return;

    const queue = this.loadQueue();
    queue.push({
      sessionId:  this.sessionId,
      eventType,
      properties,
      platform:   'web',
      occurredAt: new Date().toISOString(),
    });
    this.saveQueue(queue);

    if (queue.length >= MAX_QUEUE_SIZE) {
      void this.flush();
    }
  }

  /**
   * Flush the current queue to the server immediately.
   * Safe to call multiple times concurrently — subsequent calls no-op while
   * a flush is already in progress.
   */
  async flush(): Promise<void> {
    if (this.isOptedOut() || this.flushing) return;

    const queue = this.loadQueue();
    if (queue.length === 0) return;

    // Optimistically clear queue before the network call.
    this.saveQueue([]);
    this.flushing = true;

    try {
      await api.sendAnalyticsEvents({ events: queue });
    } catch {
      // Re-queue failed events (cap to prevent unbounded growth).
      const current = this.loadQueue();
      this.saveQueue([...queue, ...current].slice(0, MAX_STORED_EVENTS));
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Enable or disable analytics collection for this user.
   * Clearing opt-out re-enables tracking for future events.
   *
   * @param optOut - true to disable, false to re-enable
   */
  setOptOut(optOut: boolean): void {
    if (optOut) {
      localStorage.setItem(OPT_OUT_KEY, 'true');
      this.saveQueue([]); // clear any queued data immediately
    } else {
      localStorage.removeItem(OPT_OUT_KEY);
    }
  }

  /** Returns true if the user has opted out of analytics. */
  isOptedOut(): boolean {
    return localStorage.getItem(OPT_OUT_KEY) === 'true';
  }

  /** Clean up the auto-flush interval (call on app teardown / tests). */
  destroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private startAutoFlush(): void {
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private loadQueue(): QueuedEvent[] {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: QueuedEvent[]): void {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // localStorage may be full — drop oldest events silently.
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const analytics = new WebAnalyticsService();
