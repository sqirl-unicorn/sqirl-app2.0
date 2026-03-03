/**
 * Mobile API client — mirrors web/src/lib/api.ts but reads token from AsyncStorage
 * via the authStore. All endpoints match the unified /api/v1/ backend.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// ── Types (shared with web) ───────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  country: string;
  isAdmin: boolean;
  hasRecoveryKeys: boolean;
}

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

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { errorCode?: string };
    throw new Error(body.errorCode ?? `HTTP_${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  // Auth
  login(payload: { email?: string; phone?: string; password: string }) {
    return request<{ user: AuthUser; tokens: { accessToken: string }; encryptedPrivateKey: string; salt: string }>(
      '/auth/login', { method: 'POST', body: JSON.stringify(payload) }
    );
  },

  verifyToken() {
    return request<{ user: AuthUser }>('/auth/verify');
  },

  // Household
  getHousehold() {
    return request<{ household: HouseholdResponse | null }>('/household');
  },

  renameHousehold(name: string) {
    return request<{ household: HouseholdResponse }>('/household', { method: 'PUT', body: JSON.stringify({ name }) });
  },

  sendInvite(payload: { inviteeEmail?: string; inviteePhone?: string; householdId?: string; expiryDays?: number }) {
    return request<{ invitation: InvitationResponse }>('/household/invite', { method: 'POST', body: JSON.stringify(payload) });
  },

  getSentInvitations() {
    return request<{ invitations: InvitationResponse[] }>('/household/invitations');
  },

  promoteMember(userId: string) {
    return request<{ success: boolean }>(`/household/members/${userId}/promote`, { method: 'POST' });
  },

  demoteMember(userId: string) {
    return request<{ success: boolean }>(`/household/members/${userId}/demote`, { method: 'POST' });
  },

  removeMember(userId: string, grantScope?: CopyScope) {
    return request<{ autoDeleted: boolean }>(`/household/members/${userId}`, { method: 'DELETE', body: JSON.stringify({ grantScope }) });
  },

  exitHousehold() {
    return request<{ autoDeleted: boolean; householdId: string }>('/household/exit', { method: 'POST' });
  },

  getCopyRequests() {
    return request<{ copyRequests: CopyRequestResponse[] }>('/household/copy-requests');
  },

  createCopyRequest(requestedScope: CopyScope) {
    return request<{ copyRequest: CopyRequestResponse }>('/household/copy-requests', { method: 'POST', body: JSON.stringify({ requestedScope }) });
  },

  reviewCopyRequest(id: string, approved: boolean, approvedScope?: CopyScope) {
    return request<{ copyRequest: CopyRequestResponse }>(`/household/copy-requests/${id}/review`, { method: 'PUT', body: JSON.stringify({ approved, approvedScope }) });
  },

  // Invitations (received)
  getMyInvitations() {
    return request<{ invitations: InvitationResponse[] }>('/invitations');
  },

  acceptInvitation(token: string) {
    return request<{ household: HouseholdResponse; created: boolean }>(`/invitations/${token}/accept`, { method: 'POST' });
  },

  declineInvitation(id: string) {
    return request<{ success: boolean }>(`/invitations/${id}/decline`, { method: 'POST' });
  },

  // Notifications
  getNotifications(unreadOnly?: boolean) {
    return request<{ notifications: NotificationResponse[] }>(`/notifications${unreadOnly ? '?unread=true' : ''}`);
  },

  getUnreadCount() {
    return request<{ unreadCount: number }>('/notifications/unread-count');
  },

  markNotificationRead(id: string) {
    return request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PUT' });
  },

  markAllNotificationsRead() {
    return request<{ success: boolean }>('/notifications/read-all', { method: 'PUT' });
  },
};
