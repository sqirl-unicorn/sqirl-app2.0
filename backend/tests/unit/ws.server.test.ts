/**
 * Unit tests: WebSocket server (wsServer)
 *
 * Tests cover the pure-logic parts of broadcast, room management,
 * and JWT auth validation without spinning up a real HTTP server.
 */

import jwt from 'jsonwebtoken';
import {
  broadcast,
  broadcastToUser,
  _testHooks,
} from '../../src/ws/wsServer';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a minimal mock WebSocket socket object. */
function makeMockSocket(readyState = 1 /* OPEN */): {
  send: jest.Mock;
  terminate: jest.Mock;
  ping: jest.Mock;
  isAlive: boolean;
  readyState: number;
} {
  return {
    send: jest.fn(),
    terminate: jest.fn(),
    ping: jest.fn(),
    isAlive: true,
    readyState,
  };
}

// ── broadcast ─────────────────────────────────────────────────────────────────

describe('broadcast', () => {
  beforeEach(() => {
    _testHooks.clearRooms();
  });

  it('sends to all sockets in the userId room', () => {
    const s1 = makeMockSocket();
    const s2 = makeMockSocket();
    _testHooks.addUserSocket('user-1', s1 as never);
    _testHooks.addUserSocket('user-1', s2 as never);

    broadcast('lists:changed', 'user-1');

    const expected = JSON.stringify({ type: 'lists:changed' });
    expect(s1.send).toHaveBeenCalledWith(expected);
    expect(s2.send).toHaveBeenCalledWith(expected);
  });

  it('also sends to all sockets in the householdId room', () => {
    const ownerSocket = makeMockSocket();
    const memberSocket = makeMockSocket();
    _testHooks.addUserSocket('user-1', ownerSocket as never);
    _testHooks.addHouseholdSocket('hh-1', memberSocket as never);

    broadcast('lists:changed', 'user-1', 'hh-1');

    const expected = JSON.stringify({ type: 'lists:changed' });
    expect(ownerSocket.send).toHaveBeenCalledWith(expected);
    expect(memberSocket.send).toHaveBeenCalledWith(expected);
  });

  it('does not error when userId has no connected sockets', () => {
    expect(() => broadcast('lists:changed', 'nobody')).not.toThrow();
  });

  it('does not error when householdId has no connected sockets', () => {
    const s = makeMockSocket();
    _testHooks.addUserSocket('user-1', s as never);
    expect(() => broadcast('lists:changed', 'user-1', 'empty-hh')).not.toThrow();
  });

  it('skips sockets that are not OPEN (readyState !== 1)', () => {
    const closedSocket = makeMockSocket(3 /* CLOSED */);
    _testHooks.addUserSocket('user-1', closedSocket as never);

    broadcast('lists:changed', 'user-1');
    expect(closedSocket.send).not.toHaveBeenCalled();
  });

  it('deduplicates when the same socket is in both userId and householdId rooms', () => {
    const ownerSocket = makeMockSocket();
    _testHooks.addUserSocket('user-1', ownerSocket as never);
    _testHooks.addHouseholdSocket('hh-1', ownerSocket as never);

    broadcast('lists:changed', 'user-1', 'hh-1');

    // Should only receive one message even though it's in both rooms
    expect(ownerSocket.send).toHaveBeenCalledTimes(1);
  });

  it('broadcasts to all supported event types without error', () => {
    const s = makeMockSocket();
    _testHooks.addUserSocket('user-1', s as never);

    const events = [
      'lists:changed',
      'loyaltyCards:changed',
      'giftCards:changed',
      'expenses:changed',
      'notifications:changed',
      'household:changed',
    ] as const;

    events.forEach((event) => broadcast(event, 'user-1'));
    expect(s.send).toHaveBeenCalledTimes(events.length);
  });
});

// ── broadcastToUser ───────────────────────────────────────────────────────────

describe('broadcastToUser', () => {
  beforeEach(() => {
    _testHooks.clearRooms();
  });

  it('sends only to the named userId room', () => {
    const userSocket = makeMockSocket();
    const hhSocket = makeMockSocket();
    _testHooks.addUserSocket('user-1', userSocket as never);
    _testHooks.addHouseholdSocket('hh-1', hhSocket as never);

    broadcastToUser('notifications:changed', 'user-1');

    expect(userSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'notifications:changed' })
    );
    expect(hhSocket.send).not.toHaveBeenCalled();
  });

  it('does not error when userId has no connected sockets', () => {
    expect(() => broadcastToUser('notifications:changed', 'nobody')).not.toThrow();
  });
});

// ── Room management ───────────────────────────────────────────────────────────

describe('room management', () => {
  beforeEach(() => {
    _testHooks.clearRooms();
  });

  it('removeUserSocket removes the socket from the user room', () => {
    const s = makeMockSocket();
    _testHooks.addUserSocket('user-1', s as never);
    _testHooks.removeUserSocket('user-1', s as never);

    broadcastToUser('lists:changed', 'user-1');
    expect(s.send).not.toHaveBeenCalled();
  });

  it('removeHouseholdSocket removes the socket from the household room', () => {
    const s = makeMockSocket();
    _testHooks.addHouseholdSocket('hh-1', s as never);
    _testHooks.removeHouseholdSocket('hh-1', s as never);

    broadcast('lists:changed', 'user-x', 'hh-1');
    expect(s.send).not.toHaveBeenCalled();
  });

  it('multiple sockets per room all receive the message', () => {
    const sockets = [makeMockSocket(), makeMockSocket(), makeMockSocket()];
    sockets.forEach((s) => _testHooks.addUserSocket('user-1', s as never));

    broadcastToUser('household:changed', 'user-1');

    const expected = JSON.stringify({ type: 'household:changed' });
    sockets.forEach((s) => expect(s.send).toHaveBeenCalledWith(expected));
  });

  it('clearRooms empties both maps', () => {
    const s = makeMockSocket();
    _testHooks.addUserSocket('user-1', s as never);
    _testHooks.addHouseholdSocket('hh-1', s as never);
    _testHooks.clearRooms();

    broadcast('lists:changed', 'user-1', 'hh-1');
    expect(s.send).not.toHaveBeenCalled();
  });
});

// ── JWT auth validation ───────────────────────────────────────────────────────

describe('verifyWsToken', () => {
  const { verifyWsToken } = _testHooks;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('returns decoded payload for a valid token', () => {
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com' }, 'test-secret', {
      expiresIn: '1h',
    });
    const result = verifyWsToken(token);
    expect(result).toMatchObject({ userId: 'u-1', email: 'a@b.com' });
  });

  it('returns null for an invalid token', () => {
    expect(verifyWsToken('bad-token')).toBeNull();
  });

  it('returns null for an empty token', () => {
    expect(verifyWsToken('')).toBeNull();
  });

  it('returns null when JWT_SECRET is not set', () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(verifyWsToken('anything')).toBeNull();
    process.env.JWT_SECRET = original;
  });

  it('returns null for an expired token', () => {
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com' }, 'test-secret', {
      expiresIn: -1, // immediately expired
    });
    expect(verifyWsToken(token)).toBeNull();
  });
});
