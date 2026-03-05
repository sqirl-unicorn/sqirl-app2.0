# Backend Index — sqirl-app2

## Shared Package (`shared/src/`)
- `types.ts` — all shared API interfaces: `AuthUser`, `AuthTokens`, `RegisterPayload`, `RegisterResponse`, `LoginPayload`, `LoginResponse`, `Country`, `HouseholdMember`, `HouseholdResponse`, `InvitationResponse`, `CopyScope`, `CopyRequestResponse`, `NotificationResponse`, `ShoppingList`, `ListItem`, `TodoTask`, `TodoSubtask`, `ListType`, `CreateListPayload`, `CreateListItemPayload`, `UpdateListItemPayload`, `CreateTodoTaskPayload`, `UpdateTodoTaskPayload`, `CreateTodoSubtaskPayload`, `UpdateTodoSubtaskPayload`, `ScanListResponse`, `BarcodeFormat`, `LoyaltyCard`, `CreateLoyaltyCardPayload`, `UpdateLoyaltyCardPayload`, `GiftCard`, `GiftCardTransaction`, `CreateGiftCardPayload`, `UpdateGiftCardPayload`, `UpdateGiftCardBalancePayload`, `AddGiftCardTransactionPayload`, `ExpenseScope`, `ExpenseCategory`, `ExpenseBudget`, `Expense`, `CreateExpensePayload`, `UpdateExpensePayload`, `MoveExpensePayload`, `MoveCheckResult`, `SetBudgetPayload`, `CreateExpenseCategoryPayload`, `UpdateExpenseCategoryPayload`, `AnalyticsEventPayload`, `AnalyticsBatchPayload`
- `createApiClient.ts` — `createApiClient(getToken, baseUrl)→ApiClient`; all API methods, platform-agnostic (pure fetch). Import via alias `@sqirl/shared`.
- `index.ts` — barrel re-export of types + `createApiClient` + `ApiClient` type + `LOYALTY_BRANDS`, `getBrandsForCountry`, `getBrandById`, `LoyaltyBrand` + `GIFT_BRANDS`, `getGiftBrandsForCountry`, `getGiftBrandById`, `GiftBrand`
- `loyaltyBrands.ts` — `LOYALTY_BRANDS[]` (150+ brands AU/CA/US/UK/EU); `getBrandsForCountry(code)→[]`; `getBrandById(id)→brand|undefined`
- `giftBrands.ts` — `GIFT_BRANDS[]` (120+ retailers AU/CA/US/UK/EU); each brand has `requiresPin` + `requiresExpiry` for mandatory-field rules; `getGiftBrandsForCountry(code)→[]`; `getGiftBrandById(id)→brand|undefined`
- Aliases: Vite→`vite.config.ts resolve.alias`; tsc→`paths` in each tsconfig; Metro→`metro.config.js extraNodeModules`

## Core Files
- `src/db.ts` — `pool` (pg Pool, Neon, SSL). Errors: SQIRL-SYS-DB-001/002
- `src/app.ts` — Express app. Routes: /health, /api/v1/auth/*, /api/v1/profile/*, /api/v1/household/*, /api/v1/invitations/*, /api/v1/notifications/*, /api/v1/lists/*, /api/v1/loyalty-cards/*, /api/v1/gift-cards/*, /api/v1/expenses/*, /api/v1/analytics/*
- `src/server.ts` — Entry point, DB check on startup; wraps Express in `http.createServer`; attaches WS server via `initWs(server)`

## WebSocket
- `src/ws/wsEvents.ts` — `WsEventType` union (`lists:changed`|`loyaltyCards:changed`|`giftCards:changed`|`expenses:changed`|`notifications:changed`|`household:changed`|`ping`); `WsMessage` interface
- `src/ws/wsServer.ts` — `init(server)`, `broadcast(type, userId, householdId?)`, `broadcastToUser(type, userId)`, `verifyWsToken(token)`, `_testHooks`; JWT auth on WS upgrade (`?token=<jwt>`); userId+householdId rooms; 30 s heartbeat

## Middleware
- `src/middleware/auth.ts`
  - `authenticate` — Bearer JWT → req.user {userId, email|null}. Errors: MW-001/002, SYS-CFG-001
  - `requireAdmin` — ADMIN_EMAILS whitelist. Error: MW-003

## Routes
- `src/routes/auth.ts` — POST /register, POST /login, GET /verify
- `src/routes/profile.ts` — GET /, PUT /, GET /countries, GET /recovery-keys, PUT /recovery-keys
- `src/routes/household.ts` — GET /, PUT / (rename), POST /invite, GET /invitations (sent), POST /members/:id/promote|demote, DELETE /members/:id, POST /exit, GET|POST /copy-requests, PUT /copy-requests/:id/review
- `src/routes/invitations.ts` — GET / (received), POST /:token/accept, POST /:id/decline
- `src/routes/notifications.ts` — GET /, GET /unread-count, PUT /read-all, PUT /:id/read
- `src/routes/lists.ts` — GET /, POST / (create), PUT /:listId (rename), DELETE /:listId; GET|POST /:listId/items, PUT|DELETE /:listId/items/:itemId, PUT /items/:itemId/move; GET|POST /:listId/tasks, PUT|DELETE /:listId/tasks/:taskId; POST|PUT|DELETE /:listId/tasks/:taskId/subtasks/:subtaskId
- `src/routes/loyaltyCards.ts` — GET /, POST / (add), PUT /:cardId (update), DELETE /:cardId (soft-delete)
- `src/routes/giftCards.ts` — GET /, POST / (add), PUT /:cardId (edit metadata), PUT /:cardId/balance (set balance+record txn), POST /:cardId/transactions (spend/reload), GET /:cardId/transactions, PUT /:cardId/archive, DELETE /:cardId (soft-delete)
- `src/routes/expenses.ts` — GET /categories, POST /categories, PUT /categories/:id, DELETE /categories/:id, GET /budgets, PUT /budgets/:categoryId, POST /budgets/carry-forward, GET /, POST /, PUT /:id, DELETE /:id, GET /:id/move-check, POST /:id/move
- `src/routes/analytics.ts` — POST /events (batch ingest, authenticated; max 200 events/call)

## Services
- `src/services/authService.ts` — hashPassword, verifyPassword, generateToken, decodeToken, createUser, findUserForLogin, findUserById, saveRecoveryKeySlots, updateUserProfile
- `src/services/geoService.ts` — detectCountry, isValidCountry, getCountryName, getAllCountries
- `src/services/listService.ts`
  - Pure helpers: `computeProgress(subtasks)→int`, `validateSubtaskDueDate(s,t)→bool`, `canAccessList(userId,hhId,list)→bool`
  - DB ops: `createList(userId,name,type,clientId,isTest)`, `getLists(userId)`, `renameList(id,userId,name)`, `deleteList(id,userId)`, `getItems(listId,userId)`, `addItem(...)`, `updateItem(listId,itemId,userId,fields)`, `deleteItem(listId,itemId,userId)`, `moveItem(itemId,targetListId,userId)`, `getTasks(listId,userId)`, `addTask(...)`, `updateTask(listId,taskId,userId,fields)`, `deleteTask(listId,taskId,userId)`, `addSubtask(...)`, `updateSubtask(listId,taskId,subtaskId,userId,fields)`, `deleteSubtask(...)`
- `src/services/householdService.ts`
  - Pure helpers (exported): `validateInviteExpiry(days)→bool`, `defaultCopyScope()→CopyScope`, `validateCopyScope(s)→bool`, `canDemote(ownerCount)→bool`, `canRemove(role,ownerCount)→bool`
  - DB ops: `getHousehold(userId)`, `createHousehold(name,isTest)`, `addMember(hhId,userId,role,isTest)`, `getMembership(hhId,userId)`, `getMemberCount(hhId)`, `getOwnerCount(hhId)`, `renameHousehold(hhId,name)`, `promoteToOwner(hhId,userId)`, `demoteToMember(hhId,userId)`, `removeMember(hhId,userId)→{autoDeleted}`, `exitHousehold(userId)→{autoDeleted,householdId}`, `createInvitation(params)`, `getInvitationByToken(token)`, `getInvitationById(id)`, `acceptInvitation(token,userId,isTest)→{household,created}`, `declineInvitation(id)`, `getMyInvitations(userId)`, `getSentInvitations(hhId)`, `cancelAllInvitations(hhId)`, `createCopyRequest(hhId,requesterId,scope,isTest)`, `reviewCopyRequest(id,reviewerId,approved,scope?)`, `getPendingCopyRequests(hhId)`, `recordCopyGrant(params)`
- `src/services/notificationService.ts`
  - `createNotification(userId,type,title,message,data?,isTest?)`, `notifyMany(userIds,...)`, `getNotifications(userId,unreadOnly?)`, `markRead(id,userId)`, `markAllRead(userId)`, `getUnreadCount(userId)`
- `src/services/analyticsService.ts`
  - Constants: `MAX_BATCH_SIZE=200`, `PII_KEYS` (set of keys always stripped)
  - Pure helpers: `isValidPlatform(p)→bool`, `isValidEventType(t)→bool`, `sanitizeProperties(props)→props` (strips PII keys)
  - DB ops: `batchInsertEvents(userId,events[],isTestData)→count` (unnest batch insert), `getRecentEvents(userId,limit?)→AnalyticsEventRow[]`
- `src/services/loyaltyCardService.ts`
  - Pure helpers: `isValidBarcodeFormat(format)→bool`, `canAccessCard(userId,hhId,card)→bool`
  - DB ops: `getCards(userId)`, `addCard(userId,brandId,cardNumber,format,notes?,clientId?,isTest?)`, `updateCard(cardId,userId,fields)`, `deleteCard(cardId,userId)`
- `src/services/expenseService.ts`
  - Constants: `SYSTEM_CATEGORY_IDS: ReadonlySet<string>` (7 deterministic UUIDs `00000000-0000-ec00-0000-00000000000{1-7}`)
  - Pure helpers (exported): `isCategorySystem(id)→bool`, `canManageHouseholdCategory(role)→bool`, `validateCategoryDepth(parentLevel)→bool`, `buildCategoryTree(rows)→ExpenseCategory[]`, `computeMonthFirstDay(yearMonth)→Date`
  - DB ops: `getCategories(userId,scope,hhId?)`, `createCategory(userId,parentId,name,iconName?,scope,hhId?,isTest?)`, `updateCategory(catId,userId,fields,scope,hhId?)`, `deleteCategory(catId,userId,scope,hhId?)`, `getBudgets(scope,userId,hhId?,yearMonth)` (lazy carry-forward on first GET), `setBudget(catId,scope,userId,hhId?,yearMonth,amount)`, `carryForwardBudgets(scope,userId,hhId?,fromMonth,toMonth)→count`, `getExpenses(userId,scope,hhId?,yearMonth)`, `addExpense(userId,scope,hhId?,payload,isTest?)`, `updateExpense(expId,userId,fields)`, `deleteExpense(expId,userId)`, `checkCategoryConflict(expId,targetScope,userId,hhId?)→MoveCheckResult`, `moveExpense(expId,userId,targetScope,targetCatId?)→Expense`
- `src/services/giftCardService.ts`
  - Pure helpers: `isValidGiftBarcodeFormat(format)→bool`, `canAccessGiftCard(userId,hhId,card)→bool`, `computeTransactionType(amount)→TransactionType`
  - DB ops: `getGiftCards(userId)`, `addGiftCard(userId,brandId,cardNumber,format,balance,pin?,expiry?,notes?,clientId?,isTest?)`, `updateGiftCard(cardId,userId,fields)`, `updateGiftCardBalance(cardId,userId,newBalance,note?)→{card,transaction}`, `addGiftCardTransaction(cardId,userId,amount,date,location?,desc?,addAsExpense?,isTest?)→{card,transaction,expenseId?}`, `getGiftCardTransactions(cardId,userId)`, `archiveGiftCard(cardId,userId)`, `deleteGiftCard(cardId,userId)`

## Migrations
- `001-users.sql` — users table (id,email,phone,first_name,last_name,password_hash,public_key,encrypted_private_key,salt,country,recovery_key_slots,is_admin,is_test_user,created_at,updated_at,client_id,is_deleted)
- `002-households.sql` — households table; adds last_name to users
- `003-household-members.sql` — household_members (household_id,user_id,role owner|member)
- `004-household-invitations.sql` — household_invitations (household_id nullable for founding invite)
- `005-notifications.sql` — notifications (user_id,type,title,message,data JSONB,read)
- `006-household-copy-requests-and-grants.sql` — household_copy_requests + household_copy_grants
- `007-lists.sql` — lists (id,household_id,owner_user_id,name,list_type,sync cols), list_items (description,pack_size,unit,quantity,is_purchased,position)
- `008-todo-tasks.sql` — todo_tasks (title,due_date,is_completed,manual_progress,use_manual_progress), todo_subtasks (title,due_date,is_completed)
- `009-loyalty-cards.sql` — loyalty_cards (household_id,added_by_user_id,brand_id,card_number,barcode_format CHECK,notes,sync cols)
- `010-gift-cards.sql` — gift_cards (household_id,added_by_user_id,brand_id,card_number,barcode_format CHECK,pin,balance NUMERIC,expiry_date,notes,is_archived,sync cols); gift_card_transactions (gift_card_id,user_id,type CHECK spend|reload|balance_update,amount,balance_before,balance_after,transaction_date,location,description,expense_id)
- `011-expense-categories.sql` — expense_categories (parent_id self-ref, household_id, owner_user_id, scope CHECK system|household|personal, name, level CHECK 1|2|3, icon_name, position, sync cols); seeds 7 system categories
- `012-expense-budgets.sql` — expense_budgets (category_id, household_id, owner_user_id, scope, budget_month DATE, amount NUMERIC); partial unique indexes per scope (personal/household)
- `013-expenses.sql` — expenses (household_id, owner_user_id, category_id, amount NUMERIC, description, expense_date DATE, pack_size, unit, quantity, business, location, notes, sync cols); adds FK constraint on gift_card_transactions.expense_id
- `014-analytics.sql` — analytics_events (user_id, session_id, event_type, properties JSONB, platform CHECK web|mobile|tablet, app_version, occurred_at, received_at, is_test_data); indexes on user_id, event_type, occurred_at DESC, session_id

## Test Files
- `tests/unit/ws.server.test.ts`                   — 18 tests (broadcast, broadcastToUser, auth, heartbeat cleanup)
- `tests/integration/ws.broadcast.test.ts`         — 14 tests (routes call broadcast after mutations)
- `tests/unit/auth.middleware.test.ts`     — 9 tests
- `tests/unit/auth.service.test.ts`        — 8 tests
- `tests/unit/geo.service.test.ts`         — 10 tests
- `tests/unit/household.service.test.ts`   — 15 tests
- `tests/integration/health.test.ts`               — 1 test
- `tests/integration/auth.routes.test.ts`          — 14 tests
- `tests/integration/profile.routes.test.ts`       — 7 tests
- `tests/integration/household.routes.test.ts`     — 30 tests
- `tests/integration/notifications.routes.test.ts` — 8 tests
- `tests/unit/list.service.test.ts`                — 13 tests
- `tests/integration/lists.routes.test.ts`         — 41 tests
- `tests/e2e/lists.e2e.test.ts`                    — 27 tests
- `tests/unit/loyaltyCard.service.test.ts`         — 17 tests
- `tests/integration/loyaltyCards.routes.test.ts`  — 17 tests
- `tests/e2e/loyaltyCards.e2e.test.ts`             — 18 tests
- `tests/unit/giftCard.service.test.ts`            — 17 tests
- `tests/integration/giftCards.routes.test.ts`     — 28 tests
- `tests/e2e/giftCards.e2e.test.ts`                — 24 tests
- `tests/unit/expense.service.test.ts`             — 20 tests
- `tests/integration/expenses.routes.test.ts`      — 28 tests
- `tests/e2e/expenses.e2e.test.ts`                 — 15 tests
- `tests/unit/analytics.service.test.ts`           — 15 tests (isValidPlatform, isValidEventType, sanitizeProperties, MAX_BATCH_SIZE)
- `tests/integration/analytics.routes.test.ts`     — 9 tests (auth, validation, batch insert, PII strip, test-data flag)
- `tests/e2e/analytics.e2e.test.ts`                — 5 tests (full flow, JSONB query, test-data isolation)
Total: **465 tests passing**

## Test Infrastructure
- `tests/fixtures/personas.ts` — 6 personas (alice/bob/carol/dave/eve/frank). All is_test_user:true.
- `tests/fixtures/factory.ts` — `createTestUser(persona)`, `createTestUsers(keys[])`, `cleanTestData()` (nullifies copy_request/grant FKs then deletes is_test_user=true)
- `tests/helpers/testSetup.ts` — `connectTestDb()`, `teardownTestDb()`, `cleanTestDomain()` (nullifies FKs then deletes @test.sqirl.net + +61412000%), `closeTestDb()`

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
| SQIRL-HH-INVITE-001 | householdService | Missing invitee contact |
| SQIRL-HH-INVITE-002 | householdService | Invalid expiry days (1–30) |
| SQIRL-HH-INVITE-003 | household route | Inviter not owner / already in household |
| SQIRL-HH-INVITE-004 | householdService | Pending invite already exists for invitee |
| SQIRL-HH-INVITE-005 | householdService | Invitation not found or already acted on |
| SQIRL-HH-INVITE-006 | householdService | Acceptor already in a household |
| SQIRL-HH-MEMBER-001 | householdService | Cannot demote last owner |
| SQIRL-HH-MEMBER-002 | householdService | Cannot remove last owner |
| SQIRL-HH-MEMBER-003 | householdService | User not a member of household |
| SQIRL-HH-MEMBER-004 | household route | Actor not an owner |
| SQIRL-HH-EXIT-001 | householdService | Sole owner must promote another before exiting |
| SQIRL-HH-COPY-001 | householdService | Invalid copy scope |
| SQIRL-HH-COPY-002 | householdService | Copy request not found or already reviewed |
| SQIRL-HH-SERVER-001 | household/invitations routes | Unexpected server error |
| SQIRL-NOTIFY-001 | notificationService | Failed to insert notification (logged only) |
| SQIRL-LIST-ACCESS-001 | listService | List not found or user lacks access |
| SQIRL-LIST-CREATE-001 | listService | Missing required name |
| SQIRL-LIST-CREATE-002 | listService | Invalid list type |
| SQIRL-LIST-ITEM-001 | listService | Item not found in list |
| SQIRL-LIST-ITEM-002 | listService | Missing item description |
| SQIRL-LIST-ITEM-003 | listService | Source and target list must be the same type |
| SQIRL-LIST-MOVE-001 | listService | Target list not found or inaccessible |
| SQIRL-LIST-TASK-001 | listService | Task not found in list |
| SQIRL-LIST-TASK-002 | listService | Missing task title |
| SQIRL-LIST-TASK-003 | listService | Progress must be 0–100 |
| SQIRL-LIST-SUB-001 | listService | Subtask not found |
| SQIRL-LIST-SUB-002 | listService | Missing subtask title |
| SQIRL-LIST-SUB-003 | listService | Subtask due date cannot exceed task due date |
| SQIRL-LIST-SERVER-001 | lists route | Unexpected server error |
| SQIRL-LOYAL-ACCESS-001 | loyaltyCardService | Card not found or user lacks access |
| SQIRL-LOYAL-CREATE-001 | loyaltyCards route | Missing required brandId or cardNumber |
| SQIRL-LOYAL-CREATE-002 | loyaltyCards route / service | Invalid barcode format |
| SQIRL-LOYAL-SERVER-001 | loyaltyCards route | Unexpected server error |
| SQIRL-GIFT-ACCESS-001 | giftCardService | Card not found or user lacks access |
| SQIRL-GIFT-CREATE-001 | giftCards route | Missing required brandId, cardNumber, or balance |
| SQIRL-GIFT-CREATE-002 | giftCards route / service | Invalid barcode format |
| SQIRL-GIFT-CREATE-003 | giftCards route | Balance must be a non-negative number |
| SQIRL-GIFT-BAL-001 | giftCards route | New balance must be non-negative |
| SQIRL-GIFT-TXN-001 | giftCards route | Transaction amount must be non-zero |
| SQIRL-GIFT-TXN-002 | giftCards route | transactionDate is required |
| SQIRL-GIFT-SERVER-001 | giftCards route | Unexpected server error |
| SQIRL-EXP-ACCESS-001 | expenseService | Expense not found or no access |
| SQIRL-EXP-CREATE-001 | expenses route | Missing required fields (description, date, amount, category) |
| SQIRL-EXP-CREATE-002 | expenses route | Amount must be a positive number |
| SQIRL-EXP-CAT-001 | expenseService | Category not found |
| SQIRL-EXP-CAT-002 | expenseService | Cannot modify or delete a system category |
| SQIRL-EXP-CAT-003 | expenseService | Category depth limit reached (max 3 levels) |
| SQIRL-EXP-CAT-004 | expenses route | Household owner required to manage household categories |
| SQIRL-EXP-BUDGET-001 | expenses route / expenseService | Budget month format invalid (use YYYY-MM) |
| SQIRL-EXP-BUDGET-002 | expenses route | Budget amount must be non-negative |
| SQIRL-EXP-MOVE-001 | expenseService | No household found — cannot move to household scope |
| SQIRL-EXP-MOVE-002 | expenseService | Category mismatch: targetCategoryId required |
| SQIRL-EXP-MOVE-003 | expenses route | Only household owners can push HH→personal |
| SQIRL-EXP-SERVER-001 | expenses route | Unexpected server error |
| SQIRL-ANALYTIC-001 | analytics route | events missing or not a non-empty array |
| SQIRL-ANALYTIC-002 | analytics route | batch size exceeds MAX_BATCH_SIZE (200) |
| SQIRL-ANALYTIC-003 | analytics route | no valid events remain after filtering |
| SQIRL-ANALYTIC-SERVER-001 | analytics route | Unexpected server error |
