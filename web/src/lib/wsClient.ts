/**
 * WebSocket client — real-time invalidation subscription.
 *
 * Connects to the backend `/ws?token=<jwt>` endpoint.
 * When the server pushes `{ type: WsEventType }`, all registered callbacks
 * for that event are called so the relevant pages/stores refetch via REST.
 *
 * Usage:
 *   wsClient.connect(token)        — call after login / on app init
 *   wsClient.disconnect()          — call on logout
 *   wsClient.on('lists:changed', fetchLists)  — returns unsub fn
 *
 * Features:
 *   - Exponential backoff reconnect (1 s → 2 s → 4 s → … → 30 s max)
 *   - Pong heartbeat response (server sends 'ping', client responds)
 *   - On successful reconnect: fires all subscriptions once so pages refetch
 *   - Safe to call connect() multiple times (closes previous socket first)
 */

/** Union of all event types pushed by the server. */
export type WsEventType =
  | 'lists:changed'
  | 'loyaltyCards:changed'
  | 'giftCards:changed'
  | 'expenses:changed'
  | 'notifications:changed'
  | 'household:changed'
  | 'ping';

type Callback = () => void;

// ── Internal state ────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let currentToken: string | null = null;
let reconnectDelay = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isIntentionalClose = false;

const subscribers = new Map<WsEventType, Set<Callback>>();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve the WebSocket base URL from the Vite env variable.
 * Falls back to converting the current page's HTTP origin to WS.
 */
function getWsBase(): string {
  // Vite exposes env vars prefixed with VITE_
  const envBase = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL;
  if (envBase) {
    return envBase.replace(/^http/, 'ws');
  }
  return window.location.origin.replace(/^http/, 'ws');
}

/**
 * Fire all callbacks registered for a given event type.
 * Errors in callbacks are caught to prevent one bad subscriber from
 * disrupting others.
 */
function notify(type: WsEventType): void {
  const cbs = subscribers.get(type);
  if (!cbs) return;
  for (const cb of cbs) {
    try {
      cb();
    } catch (err) {
      console.error(`[wsClient] subscriber error for ${type}`, err);
    }
  }
}

/** Fire all subscriptions — used after reconnect to trigger refetch. */
function notifyAll(): void {
  for (const type of subscribers.keys()) {
    if (type !== 'ping') notify(type);
  }
}

// ── Core connection ───────────────────────────────────────────────────────────

/**
 * Open a WebSocket connection with the given JWT.
 * Closes any existing connection first.
 * Retries automatically on unexpected close using exponential backoff.
 *
 * @param token - JWT access token from authStore
 */
export function connect(token: string): void {
  isIntentionalClose = false;
  currentToken = token;

  if (ws) {
    isIntentionalClose = true;
    ws.close();
    ws = null;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const base = getWsBase();
  const url = `${base}/ws?token=${encodeURIComponent(token)}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectDelay = 1000; // Reset backoff on successful connect
    console.log('[wsClient] connected');
    // Trigger refetch so clients see any changes that happened while disconnected
    notifyAll();
  };

  ws.onmessage = (event: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(event.data) as { type: WsEventType };
      if (msg.type === 'ping') {
        ws?.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      notify(msg.type);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = (event: CloseEvent) => {
    ws = null;
    if (isIntentionalClose) return; // Logout — don't reconnect

    console.log(`[wsClient] disconnected (code ${event.code}), reconnecting in ${reconnectDelay}ms`);
    reconnectTimer = setTimeout(() => {
      if (currentToken && !isIntentionalClose) {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        connect(currentToken);
      }
    }, reconnectDelay);
  };

  ws.onerror = () => {
    // onclose will fire after onerror — let it handle reconnection
    console.error('[wsClient] connection error');
  };
}

/**
 * Close the WebSocket connection intentionally (e.g. on logout).
 * Prevents automatic reconnection.
 */
export function disconnect(): void {
  isIntentionalClose = true;
  currentToken = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

// ── Subscription API ──────────────────────────────────────────────────────────

/**
 * Subscribe to a WS event type. Returns an unsubscribe function.
 * Typical usage in a React component:
 *
 *   useEffect(() => {
 *     return wsClient.on('lists:changed', () => void fetchLists());
 *   }, [fetchLists]);
 *
 * @param type - The event type to subscribe to
 * @param cb   - Callback to invoke when the event is received
 * @returns Unsubscribe function — call in useEffect cleanup
 */
export function on(type: WsEventType, cb: Callback): () => void {
  if (!subscribers.has(type)) subscribers.set(type, new Set());
  subscribers.get(type)!.add(cb);
  return () => {
    subscribers.get(type)?.delete(cb);
  };
}
