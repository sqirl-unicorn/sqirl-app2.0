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

## Architecture (To Be Defined)

> This section will be populated as the architecture is decided. Placeholder structure below.

### Tech Stack (Proposed)
- **Backend**: Node.js + Express + PostgreSQL (Neon), TypeScript strict
- **Web**: React 18 + Vite + TailwindCSS, react-router-dom v6, zustand
- **Mobile**: React Native + Expo, expo-router, zustand
- **Encryption**: TweetNaCl (secretbox symmetric, box asymmetric) — zero-knowledge server
- **API**: Unified `/api/v1/` versioned REST, camelCase I/O

### Key Patterns
- Backend returns `camelCase` for all API responses
- JWT in `Authorization: Bearer <token>` header
- Route middleware: `authenticate` for protected routes
- All routes mounted at `/api/v1/*` in `backend/src/app.ts`
- E2E encryption: masterKey derived from password+salt; server stores encrypted blobs only

---

## Known Issues
_(None — add as discovered)_

## Resolved Issues
_(None yet)_
