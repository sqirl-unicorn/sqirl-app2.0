/**
 * Mobile invitations screen — view and act on received invitations.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, StyleSheet, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, type InvitationResponse } from '../../src/lib/api';
import { useHouseholdStore } from '../../src/store/householdStore';

function formatExpiry(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

export default function InvitationsScreen() {
  const router = useRouter();
  const { household, setHousehold, receivedInvitations, setReceivedInvitations } = useHouseholdStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load() {
    try {
      const [invRes, hhRes] = await Promise.all([api.getMyInvitations(), api.getHousehold()]);
      setReceivedInvitations(invRes.invitations);
      setHousehold(hhRes.household);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAccept(invite: InvitationResponse) {
    if (household) {
      Alert.alert('Already in household', 'Exit your current household before accepting a new invitation.');
      return;
    }
    setActionLoading(`accept-${invite.id}`);
    try {
      const { household: hh } = await api.acceptInvitation(invite.token);
      setHousehold(hh);
      setReceivedInvitations(receivedInvitations.filter((i) => i.id !== invite.id));
      router.replace('/(tabs)/household');
    } catch (err) {
      const e = err as Error;
      Alert.alert('Error', e.message === 'SQIRL-HH-INVITE-006'
        ? 'You are already in a household.'
        : 'Failed to accept invitation.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDecline(invite: InvitationResponse) {
    setActionLoading(`decline-${invite.id}`);
    try {
      await api.declineInvitation(invite.id);
      setReceivedInvitations(receivedInvitations.filter((i) => i.id !== invite.id));
    } catch {
      Alert.alert('Error', 'Failed to decline invitation.');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#60a5fa" size="large" /></View>;
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.container}
      data={receivedInvitations}
      keyExtractor={(i) => i.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="#60a5fa" />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No pending invitations</Text>
        </View>
      }
      ListHeaderComponent={household ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            You're in <Text style={{ fontWeight: '700' }}>{household.name}</Text>. Exit to accept a new invite.
          </Text>
        </View>
      ) : null}
      renderItem={({ item }) => {
        const accepting = actionLoading === `accept-${item.id}`;
        const declining = actionLoading === `decline-${item.id}`;
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {item.householdId ? 'Join household' : 'Create new household'}
            </Text>
            <Text style={styles.cardSub}>{formatExpiry(item.expiresAt)}</Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.acceptBtn, (!!actionLoading || !!household) && { opacity: 0.5 }]}
                onPress={() => void handleAccept(item)}
                disabled={!!actionLoading || !!household}
              >
                {accepting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.acceptText}>Accept</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.declineBtn, !!actionLoading && { opacity: 0.5 }]}
                onPress={() => void handleDecline(item)}
                disabled={!!actionLoading}
              >
                {declining ? <ActivityIndicator color="#374151" size="small" /> : <Text style={styles.declineText}>Decline</Text>}
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f9fafb' },
  container: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  warningBanner: { backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#fde68a' },
  warningText: { color: '#92400e', fontSize: 13 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#9ca3af', marginBottom: 14 },
  cardActions: { flexDirection: 'row', gap: 10 },
  acceptBtn: { flex: 1, backgroundColor: '#60a5fa', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  acceptText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  declineBtn: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  declineText: { color: '#374151', fontWeight: '500', fontSize: 14 },
});
