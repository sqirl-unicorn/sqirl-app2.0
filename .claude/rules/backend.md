# Backend Index — sqirl-app2

## Core Files
- `src/db.ts` — `pool` (pg Pool, Neon, SSL). Errors: SQIRL-SYS-DB-001/002
- `src/app.ts` — Express app. Routes: GET /health, /api/v1/auth/*, /api/v1/profile/*
- `src/server.ts` — Entry point, DB check on startup

## Middleware
- `src/middleware/auth.ts`
  - `authenticate` — Bearer JWT → req.user {userId, email|null}. Errors: MW-001/002, SYS-CFG-001
  - `requireAdmin` — ADMIN_EMAILS whitelist. Error: MW-003

## Routes
- `src/routes/auth.ts` — POST /register, POST /login, GET /verify
- `src/routes/profile.ts` — GET /, PUT /, GET /countries, GET /recovery-keys, PUT /recovery-keys

## Services
- `src/services/authService.ts`
  - `hashPassword(plain)` → hash
  - `verifyPassword(plain, hash)` → bool
  - `generateToken(userId, email|null)` → JWT
  - `decodeToken(token)` → JwtPayload|null
  - `createUser(params)` → UserRow (camelCase)
  - `findUserForLogin(email?, phone?)` → UserRow+passwordHash|null
  - `findUserById(id)` → UserRow|null
  - `saveRecoveryKeySlots(userId, slots[5])` → void
  - `updateUserProfile(userId, {firstName?,country?})` → UserRow|null
- `src/services/geoService.ts`
  - `detectCountry(req)` → code|null (CF-IPCountry > X-Country > null)
  - `isValidCountry(code)` → bool
  - `getCountryName(code)` → name|null
  - `getAllCountries()` → {code,name}[] sorted by name

## Migrations
- `001-users.sql` — users table: id(UUID), email, phone, first_name, password_hash, public_key, encrypted_private_key, salt, country(default AU), recovery_key_slots(JSONB), is_admin, is_test_user, created_at, updated_at, client_id, is_deleted. CHECK email OR phone NOT NULL.

## Test Files
- `tests/unit/auth.middleware.test.ts` — 9 tests
- `tests/unit/auth.service.test.ts`   — 8 tests
- `tests/unit/geo.service.test.ts`    — 10 tests
- `tests/integration/health.test.ts`          — 1 test
- `tests/integration/auth.routes.test.ts`     — 14 tests
- `tests/integration/profile.routes.test.ts`  — 7 tests (14 when pool shared)
Total: **56 tests passing**

## Test Infrastructure
- `tests/fixtures/personas.ts` — 6 personas (alice/bob/carol/dave/eve/frank). All is_test_user:true. frank is phone-only.
- `tests/fixtures/factory.ts` — `createTestUser(persona)`, `createTestUsers(keys[])`, `cleanTestData()` (is_test_user=true)
- `tests/helpers/testSetup.ts` — `connectTestDb()`, `teardownTestDb()` (domain+factory clean+close), `cleanTestDomain()` (%@test.sqirl.net + +61412000%), `closeTestDb()`

## Error Code Registry
| Code | Location | Meaning |
|------|----------|---------|
| SQIRL-SYS-DB-001 | db.ts / testSetup | DATABASE_URL missing or DB unreachable |
| SQIRL-SYS-DB-002 | db.ts | Unexpected pool error |
| SQIRL-SYS-CFG-001 | auth.ts / authService | JWT_SECRET not set |
| SQIRL-SYS-START-001 | server.ts | Unexpected startup error |
| SQIRL-AUTH-MW-001 | auth.ts | Missing/malformed Authorization header |
| SQIRL-AUTH-MW-002 | auth.ts | Invalid or expired JWT |
| SQIRL-AUTH-MW-003 | auth.ts | Not an admin |
| SQIRL-AUTH-REG-001 | auth route | Missing required registration fields |
| SQIRL-AUTH-REG-002 | auth route | Duplicate email |
| SQIRL-AUTH-REG-003 | auth route | Duplicate phone |
| SQIRL-AUTH-LOGIN-001 | auth route | Missing identifier or password |
| SQIRL-AUTH-LOGIN-002 | auth route | Invalid credentials |
| SQIRL-AUTH-CRYPTO-001 | web cryptoService | Wrong password (decryption failed) |
| SQIRL-AUTH-SERVER-001 | auth route | Unexpected server error |
| SQIRL-PROFILE-001 | profile route | Invalid country code |
| SQIRL-PROFILE-002 | profile route | User not found |
| SQIRL-PROFILE-SERVER-001 | profile route | Unexpected server error |
| SQIRL-RECOVERY-001 | profile route | slots must be exactly 5 non-empty strings |
