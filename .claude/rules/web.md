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

### Pages
- `src/pages/Login.tsx` — email/phone toggle + password. Split-screen design.
- `src/pages/Register.tsx` — step1=identity (firstName, email|phone, password, country auto-detect), step2=5 recovery keys (sage/teal palette, copy buttons, acknowledge checkbox, skip with warning)
- `src/pages/household/HouseholdPage.tsx` — members list, role badges, inline rename (owner only), promote/demote/remove actions; no-household state with invite/invitations CTAs
- `src/pages/household/InvitePage.tsx` — email/phone toggle, expiry slider 1–30 days, founding vs. existing household detection; sent confirmation state
- `src/pages/household/InvitationsPage.tsx` — pending received invitations list, accept/decline; warning if already in a household
- `src/pages/household/ExitPage.tsx` — step flow: choose→scope→pending→done; must-promote-first guard; copy scope selectors for lists/giftCards/loyaltyCards/expenses

### Components
- `src/components/Layout.tsx` — mobile header with `NotificationsBell`; `SideNav` for lg+
- `src/components/SideNav.tsx` — icon-only floating pill (lg+), hover tooltip+submenu flyout, `NotificationsBell` + logout at bottom
- `src/components/MobileNav.tsx` — bottom tab bar for mobile
- `src/components/NotificationsBell.tsx` — bell icon, red badge (unread count), click dropdown with mark-one/mark-all; closes on outside click

### App
- `src/App.tsx` — Routes: /login, /register, /dashboard, /household, /household/invite, /invitations, /household/exit (all household routes under PrivateRoute)

## Design System
- Fonts: Inter (body), Playfair Display (display) — Google Fonts
- Colors: primary-400=#60a5fa (brand), recovery-50→900 (teal/sage, milder palette for recovery)
- Golden ratio scale: φ-xs…φ-xl font sizes, φ-1…φ-7 spacing, φ-xs…φ-xl border-radius
- Layout: white left panel (logo) + gray-50 right card (lg:w-[380-460px], rounded-l-3xl, shadow-xl)

## Recovery key UX
- 5 independent keys; any one restores the account
- Displayed as XXXXX-XXXXX-… in `bg-recovery-50 border-recovery-200` cards
- Copy button per card; "I've saved all 5 keys" checkbox gates Continue
- Skip → warning → "I understand — skip anyway"
- Keys re-viewable at Profile → Recovery (GET /api/v1/profile/recovery-keys returns status only)
