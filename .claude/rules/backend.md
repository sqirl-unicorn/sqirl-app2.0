# Backend Index — sqirl-app2

## Core Files
- `src/db.ts` — `pool` (pg Pool, Neon, SSL enforced). Errors: SQIRL-SYS-DB-001/002
- `src/app.ts` — Express app factory. Mounts: GET /health → {status,version}
- `src/server.ts` — Entry point. Verifies DB on startup, listens on PORT

## Middleware
- `src/middleware/auth.ts`
  - `authenticate(req,res,next)` — Verifies Bearer JWT → sets req.user {userId,email}. Errors: SQIRL-AUTH-MW-001 (missing), SQIRL-AUTH-MW-002 (invalid/expired), SQIRL-SYS-CFG-001 (no secret)
  - `requireAdmin(req,res,next)` — Checks email in ADMIN_EMAILS. Error: SQIRL-AUTH-MW-003

## Routes
_(none yet)_

## Services
_(none yet)_

## Migrations
_(none yet — users table not yet created)_

## Test Files
- `tests/unit/auth.middleware.test.ts` — 9 tests, authenticate + requireAdmin, no DB
- `tests/integration/health.test.ts` — 1 test, GET /health + DB connectivity

## Test Infrastructure
- `tests/fixtures/personas.ts` — 6 named personas (alice/bob/carol/dave/eve/frank), all is_test_user:true
- `tests/fixtures/factory.ts` — `createTestUser(persona)`, `createTestUsers(keys[])`, `cleanTestData()` — all rows carry is_test_data:true
- `tests/helpers/testSetup.ts` — `connectTestDb()`, `teardownTestDb()` (clean+close), `closeTestDb()` (close only)

## Error Code Registry
| Code | Location | Meaning |
|------|----------|---------|
| SQIRL-SYS-DB-001 | db.ts / testSetup.ts | DATABASE_URL missing or DB unreachable |
| SQIRL-SYS-DB-002 | db.ts | Unexpected pool error |
| SQIRL-SYS-CFG-001 | auth.ts | JWT_SECRET not set |
| SQIRL-SYS-START-001 | server.ts | Unexpected startup error |
| SQIRL-AUTH-MW-001 | auth.ts | Missing/malformed Authorization header |
| SQIRL-AUTH-MW-002 | auth.ts | Invalid or expired JWT |
| SQIRL-AUTH-MW-003 | auth.ts | Not an admin |
