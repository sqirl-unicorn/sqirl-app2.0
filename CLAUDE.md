# Claude Code Instructions for Sqirl App 2.0

---

## ⚠️ CRITICAL WORKFLOW RULES ⚠️

### Efficiency
- Ruthlessly optimise token usage — concise responses throughout
- Max **5-bullet plan** for any new functionality; always one short sentence for high-level change
- Don't build apps — user builds manually
- No subagents, no explore agents, no planning agents. Main agent only. Direct file edits after 5-bullet plan.

---

## ⚠️ TEST-DRIVEN DEVELOPMENT (TDD) — NON-NEGOTIABLE ⚠️

**WRITE TESTS FIRST. CODE SECOND. ALWAYS.**

1. Write failing tests before implementing any feature or fix
2. Tests must cover: **unit → integration → end-to-end** for every feature
3. **100% coverage** required for all new code
4. Tests evolve with every addition or change — update tests before updating code
5. Tests are the feature. Not an afterthought. Not optional.

### Test Types Required
| Type | What | Location |
|------|------|----------|
| Unit | Pure functions, services, utilities | `backend/tests/unit/` |
| Integration | Route handlers + DB interactions | `backend/tests/integration/` |
| E2E | Full user flows, multi-step workflows | `backend/tests/e2e/` |
| Regression | Prevent re-breaking fixed bugs | `backend/tests/regression/` |

### Test Factory Pattern
- Maintain **named user personas** in `backend/tests/fixtures/personas.ts`
  - e.g., `alice` (owner), `bob` (member), `carol` (admin), `dave` (guest), `household` (multi-user)
- Use factory functions in `backend/tests/fixtures/factory.ts` to generate typed test data
- Factories cover: single user, multi-user household, groups, shared resources
- Each persona has deterministic IDs and consistent encrypted keys for reproducibility

### Error Code Tracking in Tests
- Every error assertion must check the `errorCode` field
- Tests document which error code maps to which flow

---

## ⚠️ MANDATORY COMMIT WORKFLOW ⚠️

```
Step 1: cd backend && npm run test:precommit   (timeout: 300000)
Step 2: Read output. Look for "Tests: N failed" or "Test Suites: N failed". None = passed.
Step 3: git commit --no-verify -m "..."
Step 4: git push
```

- **NEVER** commit without all tests passing (Step 1 must be clean)
- **NEVER** `git commit` without `--no-verify` after explicit test run
- **NEVER** retry a commit without checking `git log --oneline -1` first
- **ALWAYS** `git push` immediately after commit

---

## ⚠️ MANDATORY PRE-COMMIT CHECKLIST ⚠️

- [ ] Tests written first, then code
- [ ] 100% coverage for new/modified code
- [ ] All test types present (unit + integration + E2E)
- [ ] JSDoc on all new/modified functions
- [ ] Unique error codes on all new error paths
- [ ] Naming convention conversions verified across layers
- [ ] Index files updated (`.claude/rules/`)
- [ ] `npm run test:precommit` passes

---

## Universal API

- **One API** serves web, mobile, tablet, and home automation — no platform-specific endpoints
- Unless explicitly specified, **functionality is identical across all platforms**
- All screens and UI components must be **responsive** across web, mobile, tablet, and home automation displays
- API versioned at `/api/v1/` — never break existing contracts, version new breaking changes

---

## TypeScript Standards

- **Strict TypeScript** — `strict: true` in tsconfig, zero `any`, zero syntax errors
- No implicit `any`, no `@ts-ignore` without an explicit comment explaining why
- All function signatures fully typed (params + return types)
- Interfaces over type aliases for object shapes; type aliases for unions/primitives

---

## Error Handling

- **Graceful degradation** — every failure path has a fallback or meaningful user message
- **Unique error codes** on every error: format `SQIRL-[LAYER]-[MODULE]-[NNN]`
  - Layers: `AUTH`, `LIST`, `GROUP`, `GIFT`, `LOYAL`, `EXP`, `NOTIFY`, `ADMIN`, `SYS`
  - e.g., `SQIRL-AUTH-LOGIN-001`, `SQIRL-LIST-CREATE-003`
- Error responses always include: `{ error: string, errorCode: string, details?: unknown }`
- Log errors server-side with the same `errorCode` for easy log tracing
- Never expose internal stack traces or DB errors to clients

---

## Naming Conventions & Casing

**CRITICAL**: Mixing conventions causes bugs. Always convert at layer boundaries.

### Code (TypeScript)
- Variables & functions: `camelCase`
- Types, interfaces, classes, components: `PascalCase`
- True constants: `UPPER_SNAKE_CASE`
- Enums: `PascalCase` name + `PascalCase` members

### Database (PostgreSQL)
- Tables & columns: `snake_case`
- Indexes: `snake_case` with suffix (e.g., `idx_users_email`)

### API Layer
- Request body: `camelCase` (frontend sends camelCase)
- Response body: `camelCase` (backend ALWAYS returns camelCase — convert from snake_case)
- URL paths: `kebab-case` (e.g., `/api/v1/gift-cards`)
- Query params: `camelCase`

### File Names
- React components: `PascalCase.tsx`
- Services/utils: `camelCase.ts`
- Routes: `camelCase.ts`
- Tests: `<source>.test.ts`

### Layer Boundary Conversion Rules
- **DB → API response**: Convert all `snake_case` columns to `camelCase` before returning
- **API request → DB**: Convert all `camelCase` to `snake_case` for SQL
- Use a utility `toSnake()` / `toCamel()` for objects at every boundary — never convert manually inline

---

## Code Quality Standards

- JSDoc on **all** functions: what it does, params, return, why the logic works
- Module-level comment at top of every new file
- Comments explain **why**, not **what**
- No dead code, no commented-out code blocks in commits
- `Number()` wrap all PostgreSQL `DECIMAL` columns before `.toFixed()` — DECIMAL returns string

---

## Design System — Golden Ratio

- **Typographic scale** based on golden ratio `φ = 1.618`
  - Base: `16px (1rem)` → `×φ` at each step: `10px, 16px, 26px, 42px, 68px`
  - Line heights follow φ: base `1.618`, tight `1.0`, loose `2.618`
- **Spacing scale** mirrors typographic scale: `4px, 6px, 10px, 16px, 26px, 42px, 68px`
- **Font choice**: Use fonts with proportions at or close to golden ratio
  - Recommended: **Inter** (body), **Playfair Display** (headings) — both exhibit near-φ stroke contrast
  - Fallback: **Lato**, **Nunito**
- **Border radius scale**: `3px, 5px, 8px, 13px, 21px` (Fibonacci approximating φ)
- Design tokens live in `constants/designTokens.ts` (shared across web + mobile)

---

## Index Maintenance

After any code change, update `.claude/rules/` to reflect:
- New/modified files + exported functions (one line per function)
- New/modified API routes with request/response shapes
- New/modified DB tables or columns
- New/modified test files

Keep indexes to bare minimum lines — enough to locate the right file/function without reading the source. No full code blocks in indexes.

For bug fixes: do NOT update Resolved Issues until user explicitly confirms the fix works.

---

## Legal Compliance

- All generated code must be infringement-free
- No copyrighted assets without proper licensing
- Use open-source alternatives (e.g., Google Favicon Service for brand logos)

---

## Git Workflow

- `timeout: 300000` on any Bash call running tests or git commit
- `--no-verify` on `git commit` after an explicit test run
- `git push` immediately after every commit
- Commit messages: descriptive but brief

---

## Offline-First Data

- **All data is offline-first by default** unless explicitly specified otherwise
- Every client (mobile, tablet, web, home automation, smart home) must function fully without network access
- Data is stored locally on-device and **synced back to server when online**
- Sync strategy: optimistic local writes → background sync queue → conflict resolution on reconnect
- Conflict resolution default: **last-write-wins with server timestamp**; document deviations explicitly
- Sync state must be visible to the user (syncing indicator, last-synced timestamp, error state)
- Offline capability applies to: reads, writes, deletes, and reorders — all mutating operations queue locally
- Local storage layers:
  - Mobile/tablet: `AsyncStorage` (small KV) + `SQLite` (structured data via `expo-sqlite`)
  - Web: `IndexedDB` (structured) + `localStorage` (auth tokens only)
  - Home automation / smart home: `SQLite` or embedded key-value store as appropriate for the platform
- Every sync-capable entity in the DB has: `updated_at`, `synced_at`, `client_id`, `is_deleted` (soft delete for sync)
- Tests must cover: offline reads, offline writes, sync-on-reconnect, conflict scenarios

---

## Test Data Isolation

- **All test users must have `is_test_user: true`** in the `users` table
- **All test-generated data must have `is_test_data: true`** on every applicable table
- Analytics, metrics, and reporting queries **always filter out** `is_test_user = true` and `is_test_data = true`
- Test personas in `backend/tests/fixtures/personas.ts` always set these flags — never omit them
- Seed scripts and factory functions must propagate `is_test_data: true` to all child records
- Admin dashboard must display test-data counts separately (visible but excluded from real metrics)

---

## Architecture

### Tech Stack
- **Backend**: Node.js + Express + PostgreSQL (Neon hosted), TypeScript strict
- **Web**: React 18 + Vite 7 + TailwindCSS 3, react-router-dom v6, zustand v4
- **Mobile**: React Native 0.79+ + Expo 53, expo-router v5, zustand v4, expo-sqlite
- **Encryption**: TweetNaCl (secretbox symmetric, box asymmetric) — zero-knowledge server; masterKey derived from password+salt
- **Analytics**: Privacy-focused, offline queue with batch sending, opt-out support
- **API**: Unified `/api/v1/` versioned REST, camelCase I/O, one API for all platforms

### Key Patterns
- Backend returns `camelCase` for all API responses
- PostgreSQL `DECIMAL` columns return strings — always wrap with `Number()` before `.toFixed()`
- JWT in `Authorization: Bearer <token>` header
- Route middleware: `authenticate` for protected routes; admin routes check whitelisted emails
- All routes mounted at `/api/v1/*` in `backend/src/app.ts`
- Mobile navigation: Expo Router file-based routing with Stack navigator
- Web navigation: react-router-dom with Layout wrapper
- State management: zustand stores (in-memory; authStore persists to AsyncStorage/localStorage)
- E2E encryption: masterKey derived from password+salt; server stores encrypted blobs only (zero-knowledge)

---

## Known Issues
_(None — add as discovered)_

## Resolved Issues
_(None yet)_
