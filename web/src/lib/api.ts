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
};
