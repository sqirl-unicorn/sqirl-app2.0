/**
 * Tabs layout — bottom tab bar for main authenticated screens.
 * Tabs: Lists, Household, Expenses, Loyalty, Gift Cards.
 */

import { Tabs } from 'expo-router';
import { useHouseholdStore } from '../../src/store/householdStore';
import { Text, View } from 'react-native';

function HouseholdIcon({ color }: { color: string }) {
  return (
    <Text style={{ fontSize: 20, color }}>🏠</Text>
  );
}

export default function TabsLayout() {
  const unreadCount = useHouseholdStore((s) => s.unreadCount);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#60a5fa',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Lists',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="household"
        options={{
          title: 'Household',
          tabBarIcon: ({ color }) => <HouseholdIcon color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💰</Text>,
        }}
      />
      <Tabs.Screen
        name="loyalty-cards"
        options={{
          title: 'Loyalty',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💳</Text>,
        }}
      />
      <Tabs.Screen
        name="gift-cards"
        options={{
          title: 'Gifts',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎁</Text>,
        }}
      />
    </Tabs>
  );
}
