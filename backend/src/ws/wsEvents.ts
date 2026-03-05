/**
 * WebSocket event type definitions.
 *
 * All server → client messages are invalidation signals only (no data payload).
 * Clients re-fetch the relevant REST endpoint on receipt.
 */

/** Union of all event types the server broadcasts to clients. */
export type WsEventType =
  | 'lists:changed'
  | 'loyaltyCards:changed'
  | 'giftCards:changed'
  | 'expenses:changed'
  | 'notifications:changed'
  | 'household:changed'
  | 'ping';

/** Shape of every message sent over the WebSocket connection. */
export interface WsMessage {
  type: WsEventType;
}
