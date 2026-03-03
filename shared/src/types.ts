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
