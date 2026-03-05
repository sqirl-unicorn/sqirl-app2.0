/**
 * Root layout — Expo Router Stack navigator.
 * Loads stored auth on mount; redirects unauthenticated users to /login.
 */

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import * as wsClient from '../src/lib/wsClient';
import { analytics } from '../src/lib/analyticsService';

export default function RootLayout() {
  const { loadStoredAuth, accessToken } = useAuthStore();

  useEffect(() => {
    void loadStoredAuth();
    // Initialize analytics queue (loads persisted events from AsyncStorage)
    void analytics.init();
    return () => analytics.destroy();
  }, [loadStoredAuth]);

  // Connect WS on login, disconnect on logout
  useEffect(() => {
    if (accessToken) wsClient.connect(accessToken);
    else wsClient.disconnect();
  }, [accessToken]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="household/invite" options={{ presentation: 'modal', headerShown: true, title: 'Send Invitation' }} />
      <Stack.Screen name="household/invitations" options={{ headerShown: true, title: 'Invitations' }} />
      <Stack.Screen name="household/exit" options={{ presentation: 'modal', headerShown: true, title: 'Exit Household' }} />
      <Stack.Screen name="list/items/[listId]" options={{ headerShown: true, title: 'List' }} />
      <Stack.Screen name="list/todo/[listId]" options={{ headerShown: true, title: 'To Do' }} />
      <Stack.Screen name="gift-card/[cardId]" options={{ headerShown: true, title: 'Gift Card' }} />
      <Stack.Screen name="expenses/[expenseId]" options={{ headerShown: true, title: 'Expense' }} />
      <Stack.Screen name="expenses/categories" options={{ headerShown: true, title: 'Categories' }} />
      <Stack.Screen name="expenses/budget" options={{ headerShown: true, title: 'Budget' }} />
    </Stack>
  );
}
