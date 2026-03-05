/**
 * WebSocket server — real-time invalidation broadcast.
 *
 * Architecture:
 *   - Uses the `ws` package attached to the existing HTTP server.
 *   - Auth: JWT passed as `?token=<jwt>` query param on the WS upgrade request.
 *   - Rooms: `userConnections` (per-user) + `hhConnections` (per-household).
 *   - Messages: invalidation-only `{ type: WsEventType }` — clients re-fetch via REST.
 *   - Heartbeat: server pings every 30 s; connections that don't pong within 10 s are terminated.
 *
 * Exports:
 *   `init(server)`       — attach to http.Server; call once in server.ts
 *   `broadcast(...)`     — send to userId room + optional householdId room
 *   `broadcastToUser()`  — send to userId room only (e.g. notifications)
 *   `_testHooks`         — internal helpers exposed for unit tests only
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type * as http from 'http';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import type { WsEventType } from './wsEvents';
import type { JwtPayload } from '../middleware/auth';

// ── Room maps ─────────────────────────────────────────────────────────────────

/** userId → set of open WebSocket connections for that user. */
const userConnections = new Map<string, Set<WebSocket>>();

/** householdId → set of open WebSocket connections for household members. */
const hhConnections = new Map<string, Set<WebSocket>>();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verify a JWT token string and return its payload, or null on failure.
 * Used during the WebSocket upgrade handshake.
 *
 * @param token - Raw JWT string from the `?token=` query param
 * @returns Decoded payload or null if invalid/expired/missing secret
 */
export function verifyWsToken(token: string): JwtPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret || !token) return null;
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Look up the householdId for a given user from the DB.
 * Returns null if the user has no household.
 *
 * @param userId - Authenticated user's ID
 */
async function getHouseholdId(userId: string): Promise<string | null> {
  const res = await pool.query<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return res.rows[0]?.household_id ?? null;
}

/**
 * Send a message to every OPEN socket in a Set.
 * Skips sockets that are not in OPEN state (readyState === 1).
 *
 * @param sockets - Set of WebSocket connections to send to
 * @param payload - Already-serialised JSON string
 * @param seen    - Deduplicate: skip sockets already in this set (pass by ref)
 */
function sendToSet(sockets: Set<WebSocket>, payload: string, seen: Set<WebSocket>): void {
  for (const ws of sockets) {
    if (seen.has(ws)) continue;
    seen.add(ws);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ── Public broadcast API ──────────────────────────────────────────────────────

/**
 * Broadcast an invalidation event to the actor's userId room and, if provided,
 * to all sockets in the household room (so other household members update too).
 * Deduplicates: a socket in both rooms receives the message only once.
 *
 * @param type        - WsEventType to broadcast
 * @param userId      - The acting user's ID
 * @param householdId - Optional household to also broadcast to
 */
export function broadcast(
  type: WsEventType,
  userId: string,
  householdId?: string | null
): void {
  const payload = JSON.stringify({ type });
  const seen = new Set<WebSocket>();

  const userSockets = userConnections.get(userId);
  if (userSockets) sendToSet(userSockets, payload, seen);

  if (householdId) {
    const hhSockets = hhConnections.get(householdId);
    if (hhSockets) sendToSet(hhSockets, payload, seen);
  }
}

/**
 * Broadcast an invalidation event to a single user's room only.
 * Used for per-user events like notifications.
 *
 * @param type   - WsEventType to broadcast
 * @param userId - Recipient user's ID
 */
export function broadcastToUser(type: WsEventType, userId: string): void {
  const payload = JSON.stringify({ type });
  const seen = new Set<WebSocket>();
  const userSockets = userConnections.get(userId);
  if (userSockets) sendToSet(userSockets, payload, seen);
}

// ── WebSocket server init ─────────────────────────────────────────────────────

/**
 * Attach the WebSocket server to an existing http.Server.
 * Must be called once after Express has started listening.
 *
 * Connection flow:
 *   1. Upgrade request arrives at `/ws?token=<jwt>`
 *   2. JWT validated; reject with 401 if invalid
 *   3. User's householdId fetched from DB
 *   4. Socket registered in userConnections + hhConnections
 *   5. On close: socket removed from both maps
 *   6. Heartbeat: ping every 30 s; terminate if no pong within 10 s
 *
 * @param server - The http.Server instance from server.ts
 */
export function init(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP → WebSocket upgrade
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token') ?? '';
    const payload = verifyWsToken(token);

    if (!payload) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, payload);
    });
  });

  // New authenticated connection
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, userPayload: JwtPayload) => {
    const { userId } = userPayload;

    // Initialise heartbeat flag
    (ws as WebSocket & { isAlive: boolean }).isAlive = true;

    // Register in userId room
    if (!userConnections.has(userId)) userConnections.set(userId, new Set());
    userConnections.get(userId)!.add(ws);

    // Fetch householdId and register in hh room
    let householdId: string | null = null;
    void getHouseholdId(userId).then((hhId) => {
      householdId = hhId;
      if (hhId) {
        if (!hhConnections.has(hhId)) hhConnections.set(hhId, new Set());
        hhConnections.get(hhId)!.add(ws);
      }
    });

    // Pong handler — marks connection alive
    ws.on('pong', () => {
      (ws as WebSocket & { isAlive: boolean }).isAlive = true;
    });

    // Cleanup on close
    ws.on('close', () => {
      const userSockets = userConnections.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) userConnections.delete(userId);
      }
      if (householdId) {
        const hhSockets = hhConnections.get(householdId);
        if (hhSockets) {
          hhSockets.delete(ws);
          if (hhSockets.size === 0) hhConnections.delete(householdId);
        }
      }
    });
  });

  // Heartbeat interval — ping all connections every 30 s
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const tracked = ws as WebSocket & { isAlive: boolean };
      if (!tracked.isAlive) {
        tracked.terminate();
        return;
      }
      tracked.isAlive = false;
      tracked.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log('WebSocket server initialised');
}

// ── Test hooks (never used in production) ────────────────────────────────────

/**
 * Internal helpers exposed only for unit tests.
 * Allow tests to populate room maps and verify broadcast logic
 * without spinning up a real HTTP server.
 */
export const _testHooks = {
  /** Add a socket to the userId room (for test setup). */
  addUserSocket: (userId: string, ws: WebSocket): void => {
    if (!userConnections.has(userId)) userConnections.set(userId, new Set());
    userConnections.get(userId)!.add(ws);
  },
  /** Add a socket to the householdId room (for test setup). */
  addHouseholdSocket: (hhId: string, ws: WebSocket): void => {
    if (!hhConnections.has(hhId)) hhConnections.set(hhId, new Set());
    hhConnections.get(hhId)!.add(ws);
  },
  /** Remove a socket from the userId room (for test cleanup). */
  removeUserSocket: (userId: string, ws: WebSocket): void => {
    userConnections.get(userId)?.delete(ws);
  },
  /** Remove a socket from the householdId room (for test cleanup). */
  removeHouseholdSocket: (hhId: string, ws: WebSocket): void => {
    hhConnections.get(hhId)?.delete(ws);
  },
  /** Clear all rooms (call in beforeEach to isolate tests). */
  clearRooms: (): void => {
    userConnections.clear();
    hhConnections.clear();
  },
  /** Expose verifyWsToken for unit testing. */
  verifyWsToken,
};
