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
      expenses.tsx        — Expenses placeholder
      loyalty-cards.tsx   — Loyalty Cards: inline barcode/QR list; tap→fullscreen (barcode in bottom half); brand picker; expo-camera scan; edit/delete; polls 30 s
      gift-cards.tsx      — Gift Cards placeholder
    household/
      invite.tsx          — Send invite modal (Stack screen)
      invitations.tsx     — Received invitations screen (Stack screen)
      exit.tsx            — Exit household modal (Stack screen)
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
```

## Key Files
- `app/_layout.tsx` — Root Stack with household sub-screens; loads auth from AsyncStorage on mount
- `app/(tabs)/_layout.tsx` — Tab bar; Household tab shows unread notification badge
- `app/(tabs)/household.tsx` — Members list with role badges, promote/demote/remove (Alert confirm), inline rename, pull-to-refresh
- `app/household/invite.tsx` — Email/phone toggle, quick-select expiry (1/3/7/14/30 days), Alert on send
- `app/household/invitations.tsx` — FlatList, accept/decline, household warning banner, pull-to-refresh
- `app/household/exit.tsx` — Step flow: choose→scope→pending; `ScopeToggle` sub-component per copy category
- `src/lib/api.ts` — thin wrapper: calls `createApiClient` from `@sqirl/shared` with AsyncStorage token getter + `EXPO_PUBLIC_API_URL` base. Re-exports all types from `@sqirl/shared`.
- `src/store/authStore.ts` — `setAuth(user,tokens,epk,salt)`, `setMasterKey(key)`, `clearAuth()`, `loadStoredAuth()`
- `src/store/householdStore.ts` — mirrors web householdStore

## Navigation
- Expo Router file-based routing with Stack navigator (root) + Tab navigator (main)
- Household sub-screens (invite, invitations, exit) are Stack screens rendered as modals/push
- Auth guard: `_layout.tsx` redirects to `/login` if no stored auth
