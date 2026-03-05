/**
 * Shared API types — single source of truth for all platforms (web, mobile, tablet).
 *
 * These interfaces mirror the backend's camelCase JSON contract exactly.
 * Import from '@sqirl/shared' in every platform — never redefine locally.
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  country: string;
  isAdmin: boolean;
  hasRecoveryKeys: boolean;
}

export interface AuthTokens {
  accessToken: string;
}

export interface RegisterPayload {
  email?: string;
  phone?: string;
  firstName: string;
  password: string;
  publicKey: string;
  encryptedPrivateKey: string;
  salt: string;
  country?: string;
  recoveryKeySlots?: string[];
}

export interface RegisterResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface LoginPayload {
  email?: string;
  phone?: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
  encryptedPrivateKey: string;
  salt: string;
}

export interface Country {
  code: string;
  name: string;
}

// ── Household ─────────────────────────────────────────────────────────────────

export interface HouseholdMember {
  id: string;
  householdId: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  firstName: string;
  email: string | null;
  phone: string | null;
}

export interface HouseholdResponse {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: HouseholdMember[];
}

export interface InvitationResponse {
  id: string;
  householdId: string | null;
  inviterId: string;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  token: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  expiresAt: string;
  createdAt: string;
}

export interface CopyScope {
  lists: 'all' | 'none';
  giftCards: 'active_only' | 'none';
  loyaltyCards: 'all' | 'none';
  expenses: '12months' | 'none';
}

export interface CopyRequestResponse {
  id: string;
  householdId: string;
  requesterUserId: string;
  requestedScope: CopyScope;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reviewedByUserId: string | null;
  approvedScope: CopyScope | null;
  reviewedAt: string | null;
  createdAt: string;
}

// ── Lists ─────────────────────────────────────────────────────────────────────

export type ListType = 'general' | 'grocery' | 'todo';

export interface ShoppingList {
  id: string;
  householdId: string | null;
  ownerUserId: string;
  name: string;
  listType: ListType;
  updatedAt: string;
  isDeleted: boolean;
  clientId: string | null;
}

export interface ListItem {
  id: string;
  listId: string;
  description: string;
  packSize: string | null;
  unit: string | null;
  quantity: number | null;
  isPurchased: boolean;
  position: number;
  addedByUserId: string | null;
  updatedAt: string;
  isDeleted: boolean;
  clientId: string | null;
}

export interface TodoTask {
  id: string;
  listId: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  manualProgress: number | null;
  useManualProgress: boolean;
  /** Computed by server: completed subtasks / total subtasks * 100 (when useManualProgress=false) */
  progress: number;
  position: number;
  addedByUserId: string | null;
  updatedAt: string;
  isDeleted: boolean;
  clientId: string | null;
  subtasks: TodoSubtask[];
}

export interface TodoSubtask {
  id: string;
  taskId: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  position: number;
  addedByUserId: string | null;
  updatedAt: string;
  isDeleted: boolean;
  clientId: string | null;
}

export interface CreateListPayload {
  name: string;
  listType: ListType;
  clientId?: string;
}

export interface CreateListItemPayload {
  description: string;
  packSize?: string;
  unit?: string;
  quantity?: number;
  position?: number;
  clientId?: string;
}

export interface UpdateListItemPayload {
  description?: string;
  packSize?: string | null;
  unit?: string | null;
  quantity?: number | null;
  isPurchased?: boolean;
  position?: number;
}

export interface CreateTodoTaskPayload {
  title: string;
  dueDate?: string;
  position?: number;
  clientId?: string;
}

export interface UpdateTodoTaskPayload {
  title?: string;
  dueDate?: string | null;
  isCompleted?: boolean;
  manualProgress?: number | null;
  useManualProgress?: boolean;
  position?: number;
}

export interface CreateTodoSubtaskPayload {
  title: string;
  dueDate?: string;
  position?: number;
  clientId?: string;
}

export interface UpdateTodoSubtaskPayload {
  title?: string;
  dueDate?: string | null;
  isCompleted?: boolean;
  position?: number;
}

/** Response from the scan endpoint: items parsed from an uploaded image */
export interface ScanListResponse {
  items: string[];
}

// ── Loyalty Cards ──────────────────────────────────────────────────────────────

export type BarcodeFormat =
  | 'CODE128' | 'EAN13' | 'EAN8' | 'QR' | 'CODABAR'
  | 'ITF' | 'CODE39' | 'UPC_A' | 'UPC_E' | 'PDF417'
  | 'AZTEC' | 'DATA_MATRIX';

export interface LoyaltyCard {
  id: string;
  householdId: string | null;
  addedByUserId: string | null;
  brandId: string;
  cardNumber: string;
  barcodeFormat: BarcodeFormat;
  notes: string | null;
  updatedAt: string;
  syncedAt: string | null;
  clientId: string | null;
  isDeleted: boolean;
}

export interface CreateLoyaltyCardPayload {
  brandId: string;
  cardNumber: string;
  barcodeFormat?: BarcodeFormat;
  notes?: string;
  clientId?: string;
}

export interface UpdateLoyaltyCardPayload {
  cardNumber?: string;
  barcodeFormat?: BarcodeFormat;
  notes?: string | null;
}

// ── Gift Cards ────────────────────────────────────────────────────────────────

export interface GiftCard {
  id: string;
  householdId: string | null;
  addedByUserId: string | null;
  brandId: string;
  cardNumber: string;
  barcodeFormat: BarcodeFormat;
  pin: string | null;
  balance: number;
  expiryDate: string | null;
  notes: string | null;
  isArchived: boolean;
  updatedAt: string;
  syncedAt: string | null;
  clientId: string | null;
  isDeleted: boolean;
}

export interface GiftCardTransaction {
  id: string;
  giftCardId: string;
  userId: string;
  type: 'balance_update' | 'spend' | 'reload';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionDate: string;
  location: string | null;
  description: string | null;
  expenseId: string | null;
  createdAt: string;
}

export interface CreateGiftCardPayload {
  brandId: string;
  cardNumber: string;
  barcodeFormat?: BarcodeFormat;
  pin?: string;
  balance: number;
  expiryDate?: string;
  notes?: string;
  clientId?: string;
}

export interface UpdateGiftCardPayload {
  cardNumber?: string;
  barcodeFormat?: BarcodeFormat;
  pin?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}

export interface UpdateGiftCardBalancePayload {
  newBalance: number;
  note?: string;
}

export interface AddGiftCardTransactionPayload {
  amount: number;
  transactionDate: string;
  location?: string;
  description?: string;
  addAsExpense?: boolean;
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export type ExpenseScope = 'personal' | 'household';

export interface ExpenseCategory {
  id: string;
  parentId: string | null;
  householdId: string | null;
  ownerUserId: string | null;
  scope: 'system' | 'household' | 'personal';
  name: string;
  level: 1 | 2 | 3;
  iconName: string | null;
  position: number;
  isDeleted: boolean;
  children?: ExpenseCategory[];
}

export interface ExpenseBudget {
  id: string;
  categoryId: string;
  householdId: string | null;
  ownerUserId: string | null;
  scope: ExpenseScope;
  budgetMonth: string;
  amount: number;
}

export interface Expense {
  id: string;
  householdId: string | null;
  ownerUserId: string | null;
  categoryId: string | null;
  amount: number;
  description: string;
  expenseDate: string;
  packSize: number | null;
  unit: string | null;
  quantity: number | null;
  business: string | null;
  location: string | null;
  notes: string | null;
  isDeleted: boolean;
  updatedAt: string;
  syncedAt: string | null;
  clientId: string | null;
}

export interface CreateExpensePayload {
  scope: ExpenseScope;
  categoryId: string;
  amount: number;
  description: string;
  expenseDate: string;
  packSize?: number;
  unit?: string;
  quantity?: number;
  business?: string;
  location?: string;
  notes?: string;
  clientId?: string;
}

export interface UpdateExpensePayload {
  categoryId?: string | null;
  amount?: number;
  description?: string;
  expenseDate?: string;
  packSize?: number | null;
  unit?: string | null;
  quantity?: number | null;
  business?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface MoveExpensePayload {
  targetScope: ExpenseScope;
  targetCategoryId?: string;
}

export interface MoveCheckResult {
  needsRemap: boolean;
  suggestedCategories: ExpenseCategory[];
}

export interface SetBudgetPayload {
  scope: ExpenseScope;
  budgetMonth: string;
  amount: number;
}

export interface CreateExpenseCategoryPayload {
  parentId: string;
  name: string;
  iconName?: string;
  scope: ExpenseScope;
  clientId?: string;
}

export interface UpdateExpenseCategoryPayload {
  name?: string;
  iconName?: string | null;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/** A single behavioural event emitted by a client. No PII should be included. */
export interface AnalyticsEventPayload {
  /** Client-generated anonymous session UUID (not tied to user identity). */
  sessionId: string;
  /** Dot-namespaced action name, e.g. 'expense.added', 'auth.login'. */
  eventType: string;
  /**
   * Non-PII contextual properties.
   * Safe: amounts, dates, brand IDs, scopes, boolean flags, category IDs.
   * Never include: email, phone, name, description, notes, cardNumber, pin, location text.
   */
  properties: Record<string, unknown>;
  /** Originating platform. */
  platform: 'web' | 'mobile' | 'tablet';
  /** Optional semver app version for cohort analysis. */
  appVersion?: string;
  /** Client-side ISO 8601 timestamp of when the event occurred. */
  occurredAt: string;
}

/** Request body for the batch analytics ingestion endpoint. */
export interface AnalyticsBatchPayload {
  events: AnalyticsEventPayload[];
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationResponse {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}
