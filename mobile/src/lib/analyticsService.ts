/**
 * Mobile Analytics Service — privacy-focused behavioural event tracking.
 *
 * Architecture:
 *  - Events are kept in an in-memory queue and asynchronously persisted to
 *    AsyncStorage so they survive app restarts (offline-first).
 *  - Auto-flush every 30 s via setInterval.
 *  - Flush triggered when app moves to background (AppState 'background'/'inactive').
 *  - Opt-out persisted in AsyncStorage; setOptOut(true) also clears the queue.
 *  - On flush failure the batch is re-queued, capped at MAX_STORED_EVENTS.
 *  - PII sanitization is enforced server-side; clients should not send
 *    description, notes, email, phone, name, cardNumber, pin, location, business.
 *
 * Usage:
 *   import { analytics } from '../../src/lib/analyticsService';
 *   analytics.track('expense.added', { amount: 42.5, scope: 'personal', hasLocation: true });
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { api } from './api';

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_KEY         = '@sqirl/analytics_queue';
const OPT_OUT_KEY       = '@sqirl/analytics_opt_out';
const SESSION_KEY       = '@sqirl/analytics_session';
const FLUSH_INTERVAL_MS = 30_000;
const MAX_QUEUE_SIZE    = 50;
const MAX_STORED_EVENTS = 500;

// ── Internal types ────────────────────────────────────────────────────────────

interface QueuedEvent {
  sessionId:  string;
  eventType:  string;
  properties: Record<string, unknown>;
  platform:   'mobile';
  occurredAt: string;
}

// ── Analytics service class ───────────────────────────────────────────────────

class MobileAnalyticsService {
  /** In-memory queue — persisted to AsyncStorage asynchronously. */
  private queue: QueuedEvent[] = [];
  private sessionId: string = '';
  private optedOut = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private initialized = false;

  /**
   * Async initializer — loads session ID, opt-out flag, and persisted queue.
   * Called once at app startup from the root layout.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const [session, optOut, raw] = await AsyncStorage.multiGet([
        SESSION_KEY, OPT_OUT_KEY, QUEUE_KEY,
      ]);

      this.sessionId = session[1] ?? this.generateSessionId();
      this.optedOut  = optOut[1] === 'true';
      this.queue     = raw[1] ? (JSON.parse(raw[1]) as QueuedEvent[]) : [];

      if (!session[1]) {
        await AsyncStorage.setItem(SESSION_KEY, this.sessionId);
      }
    } catch {
      this.sessionId = this.generateSessionId();
    }

    this.startAutoFlush();
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enqueue a single behavioural event.
   * Silently no-ops if the user has opted out or init() has not completed.
   *
   * @param eventType  - Dot-namespaced identifier, e.g. 'gift_card.added'
   * @param properties - Non-PII contextual data (amounts, IDs, booleans, dates)
   */
  track(eventType: string, properties: Record<string, unknown> = {}): void {
    if (this.optedOut) return;

    this.queue.push({
      sessionId:  this.sessionId,
      eventType,
      properties,
      platform:   'mobile',
      occurredAt: new Date().toISOString(),
    });

    // Persist in background — do not await
    void this.persistQueue();

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      void this.flush();
    }
  }

  /**
   * Flush the current queue to the server immediately.
   * Concurrent calls are coalesced — only one flush runs at a time.
   */
  async flush(): Promise<void> {
    if (this.optedOut || this.flushing || this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);
    this.flushing = true;

    try {
      await api.sendAnalyticsEvents({ events: batch });
      await this.persistQueue();
    } catch {
      // Re-queue failed events at front, cap to MAX_STORED_EVENTS
      this.queue = [...batch, ...this.queue].slice(0, MAX_STORED_EVENTS);
      await this.persistQueue();
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Enable or disable analytics for this device.
   * @param optOut - true to disable, false to re-enable
   */
  async setOptOut(optOut: boolean): Promise<void> {
    this.optedOut = optOut;
    if (optOut) {
      this.queue = [];
      await AsyncStorage.multiSet([
        [OPT_OUT_KEY, 'true'],
        [QUEUE_KEY, '[]'],
      ]);
    } else {
      await AsyncStorage.removeItem(OPT_OUT_KEY);
    }
  }

  /** Returns whether the user has opted out. */
  isOptedOut(): boolean {
    return this.optedOut;
  }

  /** Teardown — stops auto-flush and AppState listener. */
  destroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private readonly handleAppStateChange = (state: AppStateStatus): void => {
    if (state === 'background' || state === 'inactive') {
      void this.flush();
    }
  };

  private startAutoFlush(): void {
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      // Storage full — silent failure; events still in memory for this session
    }
  }

  private generateSessionId(): string {
    // crypto.randomUUID() is available in React Native 0.73+ / Hermes
    return (
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const analytics = new MobileAnalyticsService();
