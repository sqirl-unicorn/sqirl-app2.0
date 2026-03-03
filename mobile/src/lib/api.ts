/**
 * Mobile API client — thin platform wrapper around the shared createApiClient factory.
 *
 * The only mobile-specific concerns here:
 *   - Token is read from AsyncStorage (async, React Native's persistence layer)
 *   - Base URL is absolute, from EXPO_PUBLIC_API_URL env var
 *
 * All endpoint definitions, types, and request logic live in @sqirl/shared.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createApiClient } from '@sqirl/shared';

export const api = createApiClient(
  () => AsyncStorage.getItem('accessToken'),
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
);

// Re-export all shared types so existing imports from '../lib/api' keep working.
export type {
  AuthUser,
  AuthTokens,
  RegisterPayload,
  RegisterResponse,
  LoginPayload,
  LoginResponse,
  Country,
  HouseholdMember,
  HouseholdResponse,
  InvitationResponse,
  CopyScope,
  CopyRequestResponse,
  NotificationResponse,
  ApiClient,
} from '@sqirl/shared';
