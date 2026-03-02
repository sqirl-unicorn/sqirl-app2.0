/**
 * Named test user personas for the Sqirl test suite.
 *
 * Rules (per CLAUDE.md):
 * - Every persona sets is_test_user: true — NEVER omit this
 * - Persona IDs are deterministic UUIDs so test data relationships are reproducible
 * - Passwords are plain-text here; hashed copies are produced by factory.ts at setup time
 *
 * Persona roles:
 *   alice   — household owner / primary account holder
 *   bob     — household member (full access)
 *   carol   — household admin (elevated role)
 *   dave    — guest / limited access member
 *   eve     — second household owner (for cross-household tests)
 *   frank   — unverified / pending invitation user
 */

export interface PersonaDefinition {
  id: string;
  email: string;
  password: string;
  name: string;
  country: string;
  isTestUser: true;
}

export const Personas = {
  alice: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@test.sqirl.net',
    password: 'AlicePass123!',
    name: 'Alice Owner',
    country: 'AU',
    isTestUser: true,
  },
  bob: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@test.sqirl.net',
    password: 'BobPass123!',
    name: 'Bob Member',
    country: 'AU',
    isTestUser: true,
  },
  carol: {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'carol@test.sqirl.net',
    password: 'CarolPass123!',
    name: 'Carol Admin',
    country: 'AU',
    isTestUser: true,
  },
  dave: {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'dave@test.sqirl.net',
    password: 'DavePass123!',
    name: 'Dave Guest',
    country: 'AU',
    isTestUser: true,
  },
  eve: {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'eve@test.sqirl.net',
    password: 'EvePass123!',
    name: 'Eve Owner2',
    country: 'AU',
    isTestUser: true,
  },
  frank: {
    id: '00000000-0000-0000-0000-000000000006',
    email: 'frank@test.sqirl.net',
    password: 'FrankPass123!',
    name: 'Frank Pending',
    country: 'AU',
    isTestUser: true,
  },
} as const satisfies Record<string, PersonaDefinition>;

export type PersonaKey = keyof typeof Personas;
