-- Migration 001: Users table
-- Zero-knowledge auth: server stores encrypted blobs only.
-- Recovery: 5 independent slots, each encrypts masterKey with a different recovery key.
-- Offline-sync fields: updated_at, client_id, is_deleted on all sync-capable tables.

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identity: at least one of email / phone required (enforced by CHECK constraint)
  email                 TEXT UNIQUE,
  phone                 TEXT UNIQUE,
  first_name            TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  -- Zero-knowledge encryption fields (server never decrypts these)
  public_key            TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  salt                  TEXT NOT NULL,
  -- Profile
  country               CHAR(2) NOT NULL DEFAULT 'AU',
  -- Recovery: array of 5 encrypted masterKey blobs, null until user sets up recovery
  -- Each slot: encrypt(masterKey, recoveryKey[i]) so any key independently recovers
  recovery_key_slots    JSONB DEFAULT NULL,
  -- Admin
  is_admin              BOOLEAN NOT NULL DEFAULT FALSE,
  -- Test data isolation (analytics MUST filter is_test_user = true)
  is_test_user          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Offline sync fields
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_id             TEXT,
  is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  -- At least one of email or phone must be provided
  CONSTRAINT users_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_test   ON users(is_test_user) WHERE is_test_user = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_updated ON users(updated_at);
