/**
 * Named test user personas for the Sqirl test suite.
 *
 * Rules (per CLAUDE.md):
 * - Every persona sets isTestUser: true — NEVER omit this
 * - Persona IDs are deterministic UUIDs so relationships are reproducible
 * - Passwords are plain-text here; factory.ts hashes them at setup time
 *
 * Personas:
 *   alice  — household owner / primary account (email)
 *   bob    — household member (email)
 *   carol  — household admin (email)
 *   dave   — guest / limited access (email)
 *   eve    — second household owner, cross-household tests (email)
 *   frank  — phone-only user
 */

export interface PersonaDefinition {
  id: string;
  email?: string;
  phone?: string;
  firstName: string;
  password: string;
  country: string;
  isTestUser: true;
}

export const Personas = {
  alice: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@test.sqirl.net',
    firstName: 'Alice',
    password: 'AlicePass123!',
    country: 'AU',
    isTestUser: true,
  },
  bob: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@test.sqirl.net',
    firstName: 'Bob',
    password: 'BobPass123!',
    country: 'AU',
    isTestUser: true,
  },
  carol: {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'carol@test.sqirl.net',
    firstName: 'Carol',
    password: 'CarolPass123!',
    country: 'AU',
    isTestUser: true,
  },
  dave: {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'dave@test.sqirl.net',
    firstName: 'Dave',
    password: 'DavePass123!',
    country: 'AU',
    isTestUser: true,
  },
  eve: {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'eve@test.sqirl.net',
    firstName: 'Eve',
    password: 'EvePass123!',
    country: 'AU',
    isTestUser: true,
  },
  frank: {
    id: '00000000-0000-0000-0000-000000000006',
    phone: '+61412000006',
    firstName: 'Frank',
    password: 'FrankPass123!',
    country: 'AU',
    isTestUser: true,
  },
} as const satisfies Record<string, PersonaDefinition>;

export type PersonaKey = keyof typeof Personas;
