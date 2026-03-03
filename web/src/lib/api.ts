/**
 * API client — all HTTP calls to the backend.
 *
 * Automatically attaches the Bearer token from authStore.
 * All methods return camelCase responses (backend contract).
 *
 * Error format from server: { error: string, errorCode: string }
 * Client throws with the errorCode so callers can handle specific codes.
 */

import { useAuthStore } from '../store/authStore';

const BASE = '/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── HTTP helper ───────────────────────────────────────────────────────────────

/**
 * Make an authenticated or unauthenticated HTTP request.
 * Throws an Error with message = errorCode if the server returns an error body.
 *
 * @param path    - API path relative to BASE (e.g. '/auth/register')
 * @param options - Fetch init options
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().tokens?.accessToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; errorCode?: string };
    const msg = body.errorCode ?? `HTTP_${res.status}`;
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const api = {
  register(payload: RegisterPayload): Promise<RegisterResponse> {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(payload: LoginPayload): Promise<LoginResponse> {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  verifyToken(): Promise<{ user: AuthUser }> {
    return request('/auth/verify');
  },

  // ── Profile ────────────────────────────────────────────────────────────────

  getProfile(): Promise<AuthUser & { createdAt: string }> {
    return request('/profile');
  },

  updateProfile(fields: { firstName?: string; country?: string }): Promise<AuthUser> {
    return request('/profile', { method: 'PUT', body: JSON.stringify(fields) });
  },

  getCountries(): Promise<{ countries: Country[] }> {
    return request('/profile/countries');
  },

  // ── Recovery keys ──────────────────────────────────────────────────────────

  getRecoveryStatus(): Promise<{ hasRecoveryKeys: boolean }> {
    return request('/profile/recovery-keys');
  },

  saveRecoveryKeys(slots: string[]): Promise<{ hasRecoveryKeys: boolean }> {
    return request('/profile/recovery-keys', {
      method: 'PUT',
      body: JSON.stringify({ slots }),
    });
  },

  // ── Household ──────────────────────────────────────────────────────────────

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

  // ── Invitations (received) ─────────────────────────────────────────────────

  getMyInvitations(): Promise<{ invitations: InvitationResponse[] }> {
    return request('/invitations');
  },

  acceptInvitation(token: string): Promise<{ household: HouseholdResponse; created: boolean }> {
    return request(`/invitations/${token}/accept`, { method: 'POST' });
  },

  declineInvitation(id: string): Promise<{ success: boolean }> {
    return request(`/invitations/${id}/decline`, { method: 'POST' });
  },

  // ── Notifications ──────────────────────────────────────────────────────────

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

// ── Household + notification types ───────────────────────────────────────────

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
