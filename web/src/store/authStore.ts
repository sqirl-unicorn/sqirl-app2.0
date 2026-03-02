/**
 * Auth store — persisted to localStorage.
 *
 * masterKey is in-memory only (NOT persisted) — lost on page refresh.
 * On refresh, UnlockScreen prompts for password to re-derive masterKey.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, AuthTokens } from '../lib/api';

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  encryptedPrivateKey: string | null;
  salt: string | null;
  /** In-memory only. Never persisted. Re-derived on unlock. */
  masterKey: string | null;

  setAuth: (
    user: AuthUser,
    tokens: AuthTokens,
    encryptedPrivateKey: string,
    salt: string
  ) => void;
  setMasterKey: (key: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      encryptedPrivateKey: null,
      salt: null,
      masterKey: null,

      setAuth: (user, tokens, encryptedPrivateKey, salt) =>
        set({ user, tokens, encryptedPrivateKey, salt }),

      setMasterKey: (masterKey) => set({ masterKey }),

      clearAuth: () =>
        set({
          user: null,
          tokens: null,
          encryptedPrivateKey: null,
          salt: null,
          masterKey: null,
        }),
    }),
    {
      name: 'sqirl-auth',
      // masterKey is never persisted — only hydrate the safe fields
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        encryptedPrivateKey: state.encryptedPrivateKey,
        salt: state.salt,
      }),
    }
  )
);
