/**
 * Web API client — thin platform wrapper around the shared createApiClient factory.
 *
 * The only web-specific concerns here:
 *   - Token is read synchronously from zustand authStore
 *   - Base URL is relative ('/api/v1') — Vite's dev proxy rewrites to localhost:3000
 *
 * All endpoint definitions, types, and request logic live in @sqirl/shared.
 */

import { createApiClient } from '@sqirl/shared';
import { useAuthStore } from '../store/authStore';

export const api = createApiClient(
  () => Promise.resolve(useAuthStore.getState().tokens?.accessToken ?? null),
  '/api/v1'
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
  ShoppingList,
  ListItem,
  TodoTask,
  TodoSubtask,
  ListType,
  ApiClient,
  LoyaltyCard,
  LoyaltyBrand,
  BarcodeFormat,
  CreateLoyaltyCardPayload,
  UpdateLoyaltyCardPayload,
} from '@sqirl/shared';
