# Mobile Index — sqirl-app2

## Stack
React Native 0.79+ + Expo 53 + expo-router v5 + zustand v4 + TweetNaCl + AsyncStorage + expo-sqlite + expo-camera + react-native-svg + qrcode

## Structure
```
mobile/
  app/
    _layout.tsx           — Root Stack navigator; loads stored auth on mount
    (tabs)/
      _layout.tsx         — Bottom tab bar: Lists, Household (with unread badge), Expenses, Loyalty, Gift Cards
      index.tsx           — Lists tab: 3 sections (General/Grocery/To Do), inline add, long-press rename/delete
      household.tsx       — Household screen
      expenses.tsx        — Expenses: scope tabs, month nav, summary bar, Date/Category view toggle, FAB add, long-press multi-select+move, ExpenseFormModal, MoveModal, ⚠ pending sync badge, WS real-time sync
      loyalty-cards.tsx   — Loyalty Cards: inline barcode/QR list; tap→fullscreen (barcode in bottom half); brand picker; expo-camera scan; edit/delete; WS real-time sync
      gift-cards.tsx      — Gift Cards: Active/Archived tabs; card tiles (logo+balance); add modal (brand picker, card number+expo-camera scan, balance, conditional PIN+expiry per brand rules); WS real-time sync
    gift-card/
      [cardId].tsx        — Gift Card Detail: top half (logo,balance,expiry,masked PIN); barcode/QR SVG centred in second half; Update Balance modal; Add Transaction modal (amount,date,location,desc,addAsExpense Switch); transaction history; Archive + Delete actions
    household/
      invite.tsx          — Send invite modal (Stack screen)
      invitations.tsx     — Received invitations screen (Stack screen)
      exit.tsx            — Exit household modal (Stack screen)
    expenses/
      [expenseId].tsx     — Expense detail/edit: full form, delete action; updates store on save
      categories.tsx      — Category tree management; system cats read-only; add/edit/delete custom sub-cats; household owner guard
      budget.tsx          — Month selector, scope tabs, flat category budget table; inline edit + save; Carry Forward button
    list/
      items/[listId].tsx  — General/Grocery items; purchased section; camera scan via expo-image-picker; pull-to-refresh
      todo/[listId].tsx   — Todo tasks+subtasks; progress bar (auto/manual); due date enforcement; pull-to-refresh
  src/
    lib/
      api.ts              — thin wrapper around @sqirl/shared createApiClient; AsyncStorage token getter
      barcodeRenderer.ts  — `encodeCode128(value)→binaryString`; `generateQrMatrix(value)→Promise<bool[][]>` (uses qrcode)
    store/
      authStore.ts        — user, tokens, encryptedPrivateKey, salt (persisted to AsyncStorage); masterKey in-memory only
      householdStore.ts   — household, receivedInvitations, notifications, unreadCount + setters
      listsStore.ts       — lists, activeListId, items, tasks + setters. In-memory only.
      expensesStore.ts    — personalCategories, householdCategories, personalBudgets, householdBudgets, personalExpenses, householdExpenses, pendingSyncIds: Set<string> + setters. In-memory only.
```

## Key Files
- `app/_layout.tsx` — Root Stack with household + expense sub-screens; loads auth from AsyncStorage on mount
- `app/(tabs)/_layout.tsx` — Tab bar; Household tab shows unread notification badge
- `app/(tabs)/household.tsx` — Members list with role badges, promote/demote/remove (Alert confirm), inline rename, pull-to-refresh
- `app/household/invite.tsx` — Email/phone toggle, quick-select expiry (1/3/7/14/30 days), Alert on send
- `app/household/invitations.tsx` — FlatList, accept/decline, household warning banner, pull-to-refresh
- `app/household/exit.tsx` — Step flow: choose→scope→pending; `ScopeToggle` sub-component per copy category
- `src/lib/api.ts` — thin wrapper: calls `createApiClient` from `@sqirl/shared` with AsyncStorage token getter + `EXPO_PUBLIC_API_URL` base. Re-exports all types from `@sqirl/shared`.
- `src/lib/analyticsService.ts` — `analytics` singleton; `init()` (loads queue+opt-out from AsyncStorage), `track(eventType, props)`, `flush()`, `setOptOut(bool)`, `destroy()`; AppState 'background' triggers flush; 30 s auto-flush; in-memory queue + AsyncStorage persistence; no PII in props
- `src/lib/wsClient.ts` — singleton WS client; `connect(token)`, `disconnect()`, `on(type, cb)→unsub`; exponential backoff (1s→30s); EXPO_PUBLIC_API_URL
- `src/store/authStore.ts` — `setAuth(user,tokens,epk,salt)`, `setMasterKey(key)`, `clearAuth()`, `loadStoredAuth()`
- `src/store/householdStore.ts` — mirrors web householdStore

## Navigation
- Expo Router file-based routing with Stack navigator (root) + Tab navigator (main)
- Household sub-screens (invite, invitations, exit) are Stack screens rendered as modals/push
- Auth guard: `_layout.tsx` redirects to `/login` if no stored auth

## E2E Tests (Maestro)
- Run manually: `maestro test mobile/e2e/<flow>.yaml` (requires WSL2 + Android or macOS)
- `mobile/e2e/_login_helper.yaml` — reusable login flow (included via `runFlow`)
- `mobile/e2e/auth.yaml` — login success, login error
- `mobile/e2e/register.yaml` — full two-step register flow
- `mobile/e2e/lists.yaml` — create/delete across General, Grocery, To Do tabs
- `mobile/e2e/loyalty-cards.yaml` — add card via brand picker, view barcode, delete
- `mobile/e2e/gift-cards.yaml` — add card, view detail+barcode, update balance, add spend transaction, archive, verify archived tab
- `mobile/e2e/household.yaml` — household tab, invite screen, invitations screen
- `mobile/e2e/expenses.yaml` — expenses tab, date/category view, add expense FAB, categories screen, budget screen
- Test user: `playwright.e2e@test.sqirl.net` / `E2eTestPass99!` (same as web setup)
