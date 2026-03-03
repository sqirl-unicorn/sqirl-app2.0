# Web Index — sqirl-app2

## Stack
Vite 5 + React 18 + TailwindCSS 3 + react-router-dom v6 + zustand v4 + TweetNaCl

## Files

### Lib
- `src/lib/cryptoService.ts` — `generateUserKeys(pw)`, `unlockPrivateKey(pw,epk,salt)`, `generateRecoveryKeys(masterKey)→{keys[5],slots[5]}`, `formatRecoveryKey(raw)`, `recoverMasterKey(key,slot)`, `encrypt/decrypt`
- `src/lib/api.ts` — thin wrapper: calls `createApiClient` from `@sqirl/shared` with zustand token getter + `/api/v1` base. Re-exports all types from `@sqirl/shared`.

### Stores
- `src/store/authStore.ts` — `user, tokens, encryptedPrivateKey, salt` (persisted to localStorage). `masterKey` (in-memory only, never persisted).
- `src/store/householdStore.ts` — `household, receivedInvitations, notifications, unreadCount` + setters. In-memory only (no persistence).
- `src/store/listsStore.ts` — `lists, activeListId, items, tasks` + setters. In-memory; polls 30 s for household updates.

### Pages
- `src/pages/Login.tsx` — email/phone toggle + password. Split-screen design.
- `src/pages/Register.tsx` — step1=identity (firstName, email|phone, password, country auto-detect), step2=5 recovery keys (sage/teal palette, copy buttons, acknowledge checkbox, skip with warning)
- `src/pages/household/HouseholdPage.tsx` — members list, role badges, inline rename (owner only), promote/demote/remove actions; no-household state with invite/invitations CTAs
- `src/pages/household/InvitePage.tsx` — email/phone toggle, expiry slider 1–30 days, founding vs. existing household detection; sent confirmation state
- `src/pages/household/InvitationsPage.tsx` — pending received invitations list, accept/decline; warning if already in a household
- `src/pages/household/ExitPage.tsx` — step flow: choose→scope→pending→done; must-promote-first guard; copy scope selectors for lists/giftCards/loyaltyCards/expenses
- `src/pages/lists/ListsPage.tsx` — 3-tab (General/Grocery/To Do) list dashboard; create/rename/delete lists; navigates to detail
- `src/pages/lists/ListDetailPage.tsx` — items for General+Grocery lists; unpurchased + purchased sections; add/edit/delete/mark-purchased/move items; camera scan via file input
- `src/pages/loyalty-cards/LoyaltyCardsPage.tsx` — inline barcode/QR grid; brand picker with search; JsBarcode (linear) + qrcode.react (QR); camera scan via BarcodeDetector API + file input; edit/delete per card; polls 30 s
- `src/pages/lists/TodoDetailPage.tsx` — tasks + subtasks; progress bar (auto or manual); add/edit/delete tasks + subtasks; due date enforcement
- `src/pages/gift-cards/GiftCardsPage.tsx` — Active/Archived tabs; card tiles (logo+balance); add modal (brand picker with search, card number+scan, balance, conditional PIN+expiry per brand rules, barcode format); polls 30 s
- `src/pages/gift-cards/GiftCardDetailPage.tsx` — top half: logo, balance, expiry, masked/unmasked PIN; barcode/QR centred in second half; Update Balance modal; Add Transaction modal (amount,date,location,desc,addAsExpense); transaction history list; Archive + Delete actions

### Components
- `src/components/Layout.tsx` — mobile header with `NotificationsBell`; `SideNav` for lg+
- `src/components/SideNav.tsx` — icon-only floating pill (lg+), hover tooltip+submenu flyout, `NotificationsBell` + logout at bottom
- `src/components/MobileNav.tsx` — bottom tab bar for mobile
- `src/components/NotificationsBell.tsx` — bell icon, red badge (unread count), click dropdown with mark-one/mark-all; closes on outside click

### App
- `src/App.tsx` — Routes: /login, /register, /dashboard (ListsPage), /list/:listId (ListRouter→ListDetailPage|TodoDetailPage), /household/*, /invitations, /expenses, /loyalty-cards (LoyaltyCardsPage), /gift-cards (GiftCardsPage), /gift-cards/:cardId (GiftCardDetailPage)
- `src/store/giftCardsStore.ts` — `cards, activeCardId, transactions` + setters. In-memory only (no persistence).

## Design System
- Fonts: Inter (body), Playfair Display (display) — Google Fonts
- Colors: primary-400=#60a5fa (brand), recovery-50→900 (teal/sage, milder palette for recovery)
- Golden ratio scale: φ-xs…φ-xl font sizes, φ-1…φ-7 spacing, φ-xs…φ-xl border-radius
- Layout: white left panel (logo) + gray-50 right card (lg:w-[380-460px], rounded-l-3xl, shadow-xl)

## E2E Tests (Playwright)
- Config: `playwright.config.ts` — 3 projects: `setup`, `auth`, `app`; Chromium only; webServer auto-starts Vite
- `e2e/auth.setup.ts` — login-or-register test user (`playwright.e2e@test.sqirl.net`), saves `e2e/.auth/user.json`
- `e2e/auth.e2e.ts` — register flow (both steps), login error, phone toggle, duplicate email, skip recovery keys (9 tests)
- `e2e/lists.e2e.ts` — create/rename/delete across all 3 tabs, cancel, navigate to detail (8 tests)
- `e2e/gift-cards.e2e.ts` — add card, navigate to detail, update balance, add transaction, archive, archived tab, PIN masking, delete (8 tests)
- `e2e/.gitignore` — ignores `.auth/` (contains JWT tokens)
- Scripts: `test:e2e` (headless), `test:e2e:headed`, `test:e2e:ui`
- Prerequisites: backend on :3000 must be running; Vite auto-started by config

## Recovery key UX
- 5 independent keys; any one restores the account
- Displayed as XXXXX-XXXXX-… in `bg-recovery-50 border-recovery-200` cards
- Copy button per card; "I've saved all 5 keys" checkbox gates Continue
- Skip → warning → "I understand — skip anyway"
- Keys re-viewable at Profile → Recovery (GET /api/v1/profile/recovery-keys returns status only)
