/**
 * Household screen (mobile) — view household, manage members, navigate to sub-flows.
 *
 * Mirrors web HouseholdPage logic using React Native primitives.
 * Offline-first: loads from store; refreshes on mount.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, StyleSheet, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, type HouseholdMember } from '../../src/lib/api';
import { useHouseholdStore } from '../../src/store/householdStore';
import { useAuthStore } from '../../src/store/authStore';

export default function HouseholdScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { household, setHousehold, unreadCount } = useHouseholdStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const myRole = household?.members.find((m) => m.userId === user?.id)?.role;
  const isOwner = myRole === 'owner';

  const loadHousehold = useCallback(async () => {
    try {
      const { household: hh } = await api.getHousehold();
      setHousehold(hh);
      if (hh) setNewName(hh.name);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setHousehold]);

  useEffect(() => { void loadHousehold(); }, [loadHousehold]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadHousehold();
  };

  async function handleRename() {
    if (!newName.trim() || !household) return;
    setActionLoading('rename');
    try {
      const { household: hh } = await api.renameHousehold(newName.trim());
      setHousehold(hh);
      setRenaming(false);
    } catch {
      Alert.alert('Error', 'Failed to rename household');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePromote(userId: string) {
    setActionLoading(`promote-${userId}`);
    try {
      await api.promoteMember(userId);
      await loadHousehold();
    } catch {
      Alert.alert('Error', 'Failed to promote member');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDemote(userId: string) {
    setActionLoading(`demote-${userId}`);
    try {
      await api.demoteMember(userId);
      await loadHousehold();
    } catch (err) {
      const e = err as Error;
      Alert.alert('Error', e.message === 'SQIRL-HH-MEMBER-001'
        ? 'Cannot demote the last owner'
        : 'Failed to demote member');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemove(member: HouseholdMember) {
    Alert.alert(
      'Remove member',
      `Remove ${member.firstName}? They will receive default data copies.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setActionLoading(`remove-${member.userId}`);
            try {
              const { autoDeleted } = await api.removeMember(member.userId);
              if (autoDeleted) {
                setHousehold(null);
              } else {
                await loadHousehold();
              }
            } catch {
              Alert.alert('Error', 'Failed to remove member');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#60a5fa" size="large" />
      </View>
    );
  }

  if (!household) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Household</Text>
        <Text style={styles.muted}>You're not part of a household yet.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/household/invite')}>
          <Text style={styles.btnText}>Send Invitation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => router.push('/household/invitations')}>
          <Text style={styles.btnSecondaryText}>View Invitations {unreadCount > 0 ? `(${unreadCount})` : ''}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60a5fa" />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        {renaming && isOwner ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              style={styles.renameInput}
              autoFocus
              onSubmitEditing={() => void handleRename()}
            />
            <TouchableOpacity onPress={() => void handleRename()}>
              <Text style={{ color: '#60a5fa', fontWeight: '600', fontSize: 14 }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setRenaming(false); setNewName(household.name); }}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Text style={styles.title}>{household.name}</Text>
            {isOwner && (
              <TouchableOpacity onPress={() => setRenaming(true)}>
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        {isOwner && (
          <TouchableOpacity style={styles.btn} onPress={() => router.push('/household/invite')}>
            <Text style={styles.btnText}>+ Invite</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => router.push('/household/exit')}>
          <Text style={styles.btnSecondaryText}>Exit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => router.push('/household/invitations')}>
          <Text style={styles.btnSecondaryText}>
            Invitations {unreadCount > 0 ? `(${unreadCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Members */}
      <Text style={styles.sectionHeader}>Members ({household.members.length})</Text>
      <View style={styles.card}>
        {household.members.map((member, idx) => {
          const isMe = member.userId === user?.id;
          const busy =
            actionLoading === `promote-${member.userId}` ||
            actionLoading === `demote-${member.userId}` ||
            actionLoading === `remove-${member.userId}`;
          return (
            <View key={member.id} style={[styles.memberRow, idx > 0 && styles.borderTop]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{member.firstName}{isMe ? ' (you)' : ''}</Text>
                <Text style={styles.memberSub}>{member.email ?? member.phone ?? ''}</Text>
              </View>
              <View style={styles.roleBadge}>
                <Text style={[styles.roleText, member.role === 'owner' && styles.ownerText]}>
                  {member.role}
                </Text>
              </View>
              {isOwner && !isMe && (
                busy ? (
                  <ActivityIndicator size="small" color="#60a5fa" style={{ marginLeft: 8 }} />
                ) : (
                  <View style={{ flexDirection: 'row', gap: 4, marginLeft: 8 }}>
                    {member.role === 'member' ? (
                      <TouchableOpacity onPress={() => void handlePromote(member.userId)} style={styles.actionBtn}>
                        <Text style={styles.actionBtnText}>↑ Owner</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => void handleDemote(member.userId)} style={styles.actionBtn}>
                        <Text style={styles.actionBtnText}>↓</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => void handleRemove(member)} style={[styles.actionBtn, { borderColor: '#fca5a5' }]}>
                      <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          );
        })}
      </View>

      {isOwner && (
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.push('/household/copy-requests')}>
          <Text style={{ color: '#60a5fa', fontSize: 14 }}>View pending copy requests →</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f9fafb' },
  container: { padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  muted: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  renameInput: {
    flex: 1, fontSize: 20, fontWeight: '700', color: '#111827',
    borderBottomWidth: 2, borderBottomColor: '#60a5fa', paddingVertical: 2,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  btn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#60a5fa', borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnSecondary: { backgroundColor: '#f3f4f6' },
  btnSecondaryText: { color: '#374151', fontSize: 14, fontWeight: '500' },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  borderTop: { borderTopWidth: 1, borderTopColor: '#f9fafb' },
  memberName: { fontSize: 14, fontWeight: '500', color: '#111827' },
  memberSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  roleBadge: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: '#f3f4f6' },
  roleText: { fontSize: 11, fontWeight: '500', color: '#6b7280' },
  ownerText: { color: '#2563eb' },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  actionBtnText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
});
