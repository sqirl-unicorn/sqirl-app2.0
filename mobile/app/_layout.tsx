/**
 * Root layout — Expo Router Stack navigator.
 * Loads stored auth on mount; redirects unauthenticated users to /(auth)/login.
 * Controls the native splash screen: kept visible until auth is resolved.
 */

import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/store/authStore';
import * as wsClient from '../src/lib/wsClient';
import { analytics } from '../src/lib/analyticsService';

// Prevent the splash from auto-hiding before auth is resolved.
SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore — may throw if already hidden (e.g. fast-refresh)
});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { loadStoredAuth, accessToken } = useAuthStore();
  const authLoaded = useRef(false);

  // Load persisted auth once, then redirect if needed
  useEffect(() => {
    void analytics.init();
    void loadStoredAuth().then(() => {
      authLoaded.current = true;
      const token = useAuthStore.getState().accessToken;
      if (!token) {
        router.replace('/(auth)/login');
      }
      // Hide the native splash after auth is resolved
      void SplashScreen.hideAsync();
    });
    return () => analytics.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect on subsequent login / logout
  useEffect(() => {
    if (!authLoaded.current) return;
    const inAuth = (segments[0] as string) === '(auth)';
    if (!accessToken && !inAuth) {
      router.replace('/(auth)/login');
    } else if (accessToken && inAuth) {
      router.replace('/(tabs)');
    }
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <Stack.Screen name="profile" options={{ headerShown: true, title: 'Profile' }} />
    </Stack>
  );
}
