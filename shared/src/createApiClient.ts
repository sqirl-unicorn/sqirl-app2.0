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

  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
