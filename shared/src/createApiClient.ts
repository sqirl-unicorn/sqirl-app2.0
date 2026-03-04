/**
 * createApiClient — platform-agnostic API factory.
 *
 * The only platform-specific concerns are:
 *   - How the auth token is retrieved  (AsyncStorage on mobile, zustand on web)
 *   - What the base URL is             (relative '/api/v1' on web, absolute env var on mobile)
 *
 * Everything else — endpoint paths, request shapes, response shapes — is
 * identical across all platforms and lives here as the single source of truth.
 *
 * @param getToken - Async fn returning the current Bearer token or null.
 * @param baseUrl  - Base URL for the API (no trailing slash).
 * @returns Fully-typed API client object.
 */

import type {
  RegisterPayload,
  RegisterResponse,
  LoginPayload,
  LoginResponse,
  AuthUser,
  Country,
  HouseholdResponse,
  InvitationResponse,
  CopyScope,
  CopyRequestResponse,
  NotificationResponse,
  ShoppingList,
  ListItem,
  TodoTask,
  TodoSubtask,
  CreateListPayload,
  CreateListItemPayload,
  UpdateListItemPayload,
  CreateTodoTaskPayload,
  UpdateTodoTaskPayload,
  CreateTodoSubtaskPayload,
  UpdateTodoSubtaskPayload,
  ScanListResponse,
  LoyaltyCard,
  CreateLoyaltyCardPayload,
  UpdateLoyaltyCardPayload,
  GiftCard,
  GiftCardTransaction,
  CreateGiftCardPayload,
  UpdateGiftCardPayload,
  UpdateGiftCardBalancePayload,
  AddGiftCardTransactionPayload,
  ExpenseCategory,
  ExpenseBudget,
  Expense,
  ExpenseScope,
  CreateExpensePayload,
  UpdateExpensePayload,
  MoveExpensePayload,
  MoveCheckResult,
  SetBudgetPayload,
  CreateExpenseCategoryPayload,
  UpdateExpenseCategoryPayload,
} from './types';

export function createApiClient(
  getToken: () => Promise<string | null>,
  baseUrl: string
) {
  /**
   * Core HTTP helper. Attaches Authorization header, throws on non-2xx
   * using the server's errorCode field so callers can match specific codes.
   */
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    };

    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string; errorCode?: string };
      throw new Error(body.errorCode ?? `HTTP_${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  return {
    // ── Auth ────────────────────────────────────────────────────────────────

    register(payload: RegisterPayload): Promise<RegisterResponse> {
      return request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    },

    login(payload: LoginPayload): Promise<LoginResponse> {
      return request('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    },

    verifyToken(): Promise<{ user: AuthUser }> {
      return request('/auth/verify');
    },

    // ── Profile ─────────────────────────────────────────────────────────────

    getProfile(): Promise<AuthUser & { createdAt: string }> {
      return request('/profile');
    },

    updateProfile(fields: { firstName?: string; country?: string }): Promise<AuthUser> {
      return request('/profile', { method: 'PUT', body: JSON.stringify(fields) });
    },

    getCountries(): Promise<{ countries: Country[] }> {
      return request('/profile/countries');
    },

    // ── Recovery keys ────────────────────────────────────────────────────────

    getRecoveryStatus(): Promise<{ hasRecoveryKeys: boolean }> {
      return request('/profile/recovery-keys');
    },

    saveRecoveryKeys(slots: string[]): Promise<{ hasRecoveryKeys: boolean }> {
      return request('/profile/recovery-keys', {
        method: 'PUT',
        body: JSON.stringify({ slots }),
      });
    },

    // ── Household ────────────────────────────────────────────────────────────

    getHousehold(): Promise<{ household: HouseholdResponse | null }> {
      return request('/household');
    },

    renameHousehold(name: string): Promise<{ household: HouseholdResponse }> {
      return request('/household', { method: 'PUT', body: JSON.stringify({ name }) });
    },

    sendInvite(payload: {
      inviteeEmail?: string;
      inviteePhone?: string;
      householdId?: string;
      expiryDays?: number;
    }): Promise<{ invitation: InvitationResponse }> {
      return request('/household/invite', { method: 'POST', body: JSON.stringify(payload) });
    },

    getSentInvitations(): Promise<{ invitations: InvitationResponse[] }> {
      return request('/household/invitations');
    },

    promoteMember(userId: string): Promise<{ success: boolean }> {
      return request(`/household/members/${userId}/promote`, { method: 'POST' });
    },

    demoteMember(userId: string): Promise<{ success: boolean }> {
      return request(`/household/members/${userId}/demote`, { method: 'POST' });
    },

    removeMember(userId: string, grantScope?: CopyScope): Promise<{ autoDeleted: boolean }> {
      return request(`/household/members/${userId}`, {
        method: 'DELETE',
        body: JSON.stringify({ grantScope }),
      });
    },

    exitHousehold(): Promise<{ autoDeleted: boolean; householdId: string }> {
      return request('/household/exit', { method: 'POST' });
    },

    getCopyRequests(): Promise<{ copyRequests: CopyRequestResponse[] }> {
      return request('/household/copy-requests');
    },

    createCopyRequest(requestedScope: CopyScope): Promise<{ copyRequest: CopyRequestResponse }> {
      return request('/household/copy-requests', {
        method: 'POST',
        body: JSON.stringify({ requestedScope }),
      });
    },

    reviewCopyRequest(
      id: string,
      approved: boolean,
      approvedScope?: CopyScope
    ): Promise<{ copyRequest: CopyRequestResponse }> {
      return request(`/household/copy-requests/${id}/review`, {
        method: 'PUT',
        body: JSON.stringify({ approved, approvedScope }),
      });
    },

    // ── Invitations (received) ───────────────────────────────────────────────

    getMyInvitations(): Promise<{ invitations: InvitationResponse[] }> {
      return request('/invitations');
    },

    acceptInvitation(token: string): Promise<{ household: HouseholdResponse; created: boolean }> {
      return request(`/invitations/${token}/accept`, { method: 'POST' });
    },

    declineInvitation(id: string): Promise<{ success: boolean }> {
      return request(`/invitations/${id}/decline`, { method: 'POST' });
    },

    // ── Lists ────────────────────────────────────────────────────────────────

    getLists(): Promise<{ lists: ShoppingList[] }> {
      return request('/lists');
    },

    createList(payload: CreateListPayload): Promise<{ list: ShoppingList }> {
      return request('/lists', { method: 'POST', body: JSON.stringify(payload) });
    },

    renameList(id: string, name: string): Promise<{ list: ShoppingList }> {
      return request(`/lists/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    },

    deleteList(id: string): Promise<{ success: boolean }> {
      return request(`/lists/${id}`, { method: 'DELETE' });
    },

    // ── List items (General + Grocery) ───────────────────────────────────────

    getListItems(listId: string): Promise<{ items: ListItem[] }> {
      return request(`/lists/${listId}/items`);
    },

    addListItem(listId: string, payload: CreateListItemPayload): Promise<{ item: ListItem }> {
      return request(`/lists/${listId}/items`, { method: 'POST', body: JSON.stringify(payload) });
    },

    updateListItem(listId: string, itemId: string, payload: UpdateListItemPayload): Promise<{ item: ListItem }> {
      return request(`/lists/${listId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    deleteListItem(listId: string, itemId: string): Promise<{ success: boolean }> {
      return request(`/lists/${listId}/items/${itemId}`, { method: 'DELETE' });
    },

    moveListItem(itemId: string, targetListId: string): Promise<{ item: ListItem }> {
      return request(`/lists/items/${itemId}/move`, { method: 'PUT', body: JSON.stringify({ targetListId }) });
    },

    /** Upload an image and get back parsed item descriptions. */
    scanList(formData: FormData): Promise<ScanListResponse> {
      return request('/lists/scan', { method: 'POST', body: formData, headers: {} });
    },

    // ── Todo tasks ───────────────────────────────────────────────────────────

    getTasks(listId: string): Promise<{ tasks: TodoTask[] }> {
      return request(`/lists/${listId}/tasks`);
    },

    addTask(listId: string, payload: CreateTodoTaskPayload): Promise<{ task: TodoTask }> {
      return request(`/lists/${listId}/tasks`, { method: 'POST', body: JSON.stringify(payload) });
    },

    updateTask(listId: string, taskId: string, payload: UpdateTodoTaskPayload): Promise<{ task: TodoTask }> {
      return request(`/lists/${listId}/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    deleteTask(listId: string, taskId: string): Promise<{ success: boolean }> {
      return request(`/lists/${listId}/tasks/${taskId}`, { method: 'DELETE' });
    },

    // ── Todo subtasks ────────────────────────────────────────────────────────

    addSubtask(listId: string, taskId: string, payload: CreateTodoSubtaskPayload): Promise<{ subtask: TodoSubtask }> {
      return request(`/lists/${listId}/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify(payload) });
    },

    updateSubtask(listId: string, taskId: string, subtaskId: string, payload: UpdateTodoSubtaskPayload): Promise<{ subtask: TodoSubtask }> {
      return request(`/lists/${listId}/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    deleteSubtask(listId: string, taskId: string, subtaskId: string): Promise<{ success: boolean }> {
      return request(`/lists/${listId}/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });
    },

    // ── Notifications ────────────────────────────────────────────────────────

    getNotifications(unreadOnly?: boolean): Promise<{ notifications: NotificationResponse[] }> {
      return request(`/notifications${unreadOnly ? '?unread=true' : ''}`);
    },

    getUnreadCount(): Promise<{ unreadCount: number }> {
      return request('/notifications/unread-count');
    },

    markNotificationRead(id: string): Promise<{ success: boolean }> {
      return request(`/notifications/${id}/read`, { method: 'PUT' });
    },

    markAllNotificationsRead(): Promise<{ success: boolean }> {
      return request('/notifications/read-all', { method: 'PUT' });
    },

    // ── Loyalty Cards ────────────────────────────────────────────────────────

    getLoyaltyCards(): Promise<{ cards: LoyaltyCard[] }> {
      return request('/loyalty-cards');
    },

    addLoyaltyCard(payload: CreateLoyaltyCardPayload): Promise<{ card: LoyaltyCard }> {
      return request('/loyalty-cards', { method: 'POST', body: JSON.stringify(payload) });
    },

    updateLoyaltyCard(cardId: string, payload: UpdateLoyaltyCardPayload): Promise<{ card: LoyaltyCard }> {
      return request(`/loyalty-cards/${cardId}`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    deleteLoyaltyCard(cardId: string): Promise<{ success: boolean }> {
      return request(`/loyalty-cards/${cardId}`, { method: 'DELETE' });
    },

    // ── Gift Cards ────────────────────────────────────────────────────────────

    getGiftCards(): Promise<{ cards: GiftCard[] }> {
      return request('/gift-cards');
    },

    addGiftCard(payload: CreateGiftCardPayload): Promise<{ card: GiftCard }> {
      return request('/gift-cards', { method: 'POST', body: JSON.stringify(payload) });
    },

    updateGiftCard(cardId: string, payload: UpdateGiftCardPayload): Promise<{ card: GiftCard }> {
      return request(`/gift-cards/${cardId}`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    updateGiftCardBalance(cardId: string, payload: UpdateGiftCardBalancePayload): Promise<{ card: GiftCard; transaction: GiftCardTransaction }> {
      return request(`/gift-cards/${cardId}/balance`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    addGiftCardTransaction(cardId: string, payload: AddGiftCardTransactionPayload): Promise<{ card: GiftCard; transaction: GiftCardTransaction; expenseId?: string }> {
      return request(`/gift-cards/${cardId}/transactions`, { method: 'POST', body: JSON.stringify(payload) });
    },

    getGiftCardTransactions(cardId: string): Promise<{ transactions: GiftCardTransaction[] }> {
      return request(`/gift-cards/${cardId}/transactions`);
    },

    archiveGiftCard(cardId: string): Promise<{ card: GiftCard }> {
      return request(`/gift-cards/${cardId}/archive`, { method: 'PUT' });
    },

    deleteGiftCard(cardId: string): Promise<{ success: boolean }> {
      return request(`/gift-cards/${cardId}`, { method: 'DELETE' });
    },

    // ── Expenses — Categories ────────────────────────────────────────────────

    getExpenseCategories(scope: ExpenseScope, householdId?: string): Promise<{ categories: ExpenseCategory[] }> {
      const qs = householdId ? `?scope=${scope}&householdId=${householdId}` : `?scope=${scope}`;
      return request(`/expenses/categories${qs}`);
    },

    createExpenseCategory(payload: CreateExpenseCategoryPayload): Promise<{ category: ExpenseCategory }> {
      return request('/expenses/categories', { method: 'POST', body: JSON.stringify(payload) });
    },

    updateExpenseCategory(id: string, payload: UpdateExpenseCategoryPayload): Promise<{ category: ExpenseCategory }> {
      return request(`/expenses/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    deleteExpenseCategory(id: string): Promise<{ success: boolean }> {
      return request(`/expenses/categories/${id}`, { method: 'DELETE' });
    },

    // ── Expenses — Budgets ───────────────────────────────────────────────────

    getExpenseBudgets(scope: ExpenseScope, month: string, householdId?: string): Promise<{ budgets: ExpenseBudget[] }> {
      const params = new URLSearchParams({ scope, month });
      if (householdId) params.append('householdId', householdId);
      return request(`/expenses/budgets?${params.toString()}`);
    },

    setExpenseBudget(categoryId: string, payload: SetBudgetPayload): Promise<{ budget: ExpenseBudget }> {
      return request(`/expenses/budgets/${categoryId}`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    carryForwardExpenseBudgets(payload: { scope: ExpenseScope; fromMonth: string; toMonth: string }): Promise<{ count: number }> {
      return request('/expenses/budgets/carry-forward', { method: 'POST', body: JSON.stringify(payload) });
    },

    // ── Expenses — CRUD ──────────────────────────────────────────────────────

    getExpenses(scope: ExpenseScope, month: string, householdId?: string): Promise<{ expenses: Expense[] }> {
      const params = new URLSearchParams({ scope, month });
      if (householdId) params.append('householdId', householdId);
      return request(`/expenses?${params.toString()}`);
    },

    addExpense(payload: CreateExpensePayload): Promise<{ expense: Expense }> {
      return request('/expenses', { method: 'POST', body: JSON.stringify(payload) });
    },

    updateExpense(id: string, payload: UpdateExpensePayload): Promise<{ expense: Expense }> {
      return request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    },

    deleteExpense(id: string): Promise<{ success: boolean }> {
      return request(`/expenses/${id}`, { method: 'DELETE' });
    },

    checkExpenseMove(id: string, targetScope: ExpenseScope): Promise<MoveCheckResult> {
      return request(`/expenses/${id}/move-check?targetScope=${targetScope}`);
    },

    moveExpense(id: string, payload: MoveExpensePayload): Promise<{ expense: Expense }> {
      return request(`/expenses/${id}/move`, { method: 'POST', body: JSON.stringify(payload) });
    },

  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
