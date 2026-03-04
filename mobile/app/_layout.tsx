/**
 * Root layout — Expo Router Stack navigator.
 * Loads stored auth on mount; redirects unauthenticated users to /login.
 */

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function RootLayout() {
  const { loadStoredAuth } = useAuthStore();

  useEffect(() => {
    void loadStoredAuth();
  }, [loadStoredAuth]);

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
