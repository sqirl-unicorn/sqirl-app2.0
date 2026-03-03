/**
 * Mobile auth store — persists tokens to AsyncStorage.
 * masterKey is in-memory only (zero-knowledge).
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '../lib/api';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  masterKey: Uint8Array | null;

  setAuth(user: AuthUser, accessToken: string, masterKey?: Uint8Array): Promise<void>;
  clearAuth(): Promise<void>;
  loadStoredAuth(): Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  masterKey: null,

  setAuth: async (user, accessToken, masterKey) => {
    await AsyncStorage.setItem('accessToken', accessToken);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user, accessToken, masterKey: masterKey ?? null });
  },

  clearAuth: async () => {
    await AsyncStorage.multiRemove(['accessToken', 'user']);
    set({ user: null, accessToken: null, masterKey: null });
  },

  loadStoredAuth: async () => {
    try {
      const [token, userJson] = await AsyncStorage.multiGet(['accessToken', 'user']);
      const accessToken = token[1];
      const user = userJson[1] ? JSON.parse(userJson[1]) as AuthUser : null;
      if (accessToken && user) {
        set({ accessToken, user });
      }
    } catch {
      // Ignore storage errors on load
    }
  },
}));
