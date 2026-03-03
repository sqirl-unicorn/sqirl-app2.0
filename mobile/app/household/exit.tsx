/**
 * Mobile exit screen — voluntary exit flow with optional copy request.
 * Presented as a modal.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, type CopyScope } from '../../src/lib/api';
import { useHouseholdStore } from '../../src/store/householdStore';
import { useAuthStore } from '../../src/store/authStore';

const DEFAULT_SCOPE: CopyScope = {
  lists: 'all',
  giftCards: 'active_only',
  loyaltyCards: 'all',
  expenses: '12months',
};

type Step = 'choose' | 'scope' | 'pending';

export default function ExitScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { household, setHousehold } = useHouseholdStore();

  const [step, setStep] = useState<Step>('choose');
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<CopyScope>({ ...DEFAULT_SCOPE });
  const [copyRequestStatus, setCopyRequestStatus] = useState<string | null>(null);

  const myMembership = household?.members.find((m) => m.userId === user?.id);
  const isOwner = myMembership?.role === 'owner';
  const ownerCount = household?.members.filter((m) => m.role === 'owner').length ?? 0;
  const memberCount = household?.members.length ?? 0;
  const mustPromoteFirst = isOwner && ownerCount === 1 && memberCount > 1;
  const isLastMember = memberCount === 1;

  async function handleImmediateExit() {
    setLoading(true);
    try {
      const { autoDeleted } = await api.exitHousehold();
      setHousehold(null);
      Alert.alert(
        'Left household',
        autoDeleted ? 'Household deleted. You received full copies of all data.' : 'You have left the household.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/household') }]
      );
    } catch (err) {
      const e = err as Error;
      Alert.alert('Error', e.message === 'SQIRL-HH-EXIT-001'
        ? 'You must promote another owner before exiting.'
        : 'Failed to exit household.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitCopyRequest() {
    setLoading(true);
    try {
      await api.createCopyRequest(scope);
      setCopyRequestStatus('pending');
      setStep('pending');
    } catch {
      Alert.alert('Error', 'Failed to submit copy request.');
    } finally {
      setLoading(false);
    }
  }

  function ScopeToggle({ label, field, options }: {
    label: string;
    field: keyof CopyScope;
    options: { value: string; label: string }[];
  }) {
    return (
      <View style={styles.scopeRow}>
        <Text style={styles.scopeLabel}>{label}</Text>
        <View style={styles.scopeOptions}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setScope({ ...scope, [field]: opt.value })}
              style={[styles.scopeOpt, scope[field] === opt.value && styles.scopeOptActive]}
            >
              <Text style={[styles.scopeOptText, scope[field] === opt.value && styles.scopeOptTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Exit {household?.name ?? 'Household'}</Text>

      {mustPromoteFirst && (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Promote an owner first</Text>
          <Text style={styles.warningText}>You are the only owner. Promote another member before exiting.</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: '#92400e', fontWeight: '600', fontSize: 13, marginTop: 8 }}>← Back to members</Text>
          </TouchableOpacity>
        </View>
      )}

      {!mustPromoteFirst && step === 'choose' && (
        <View style={{ gap: 12 }}>
          {isLastMember && (
            <View style={styles.info}>
              <Text style={styles.infoText}>You are the last member. The household will be deleted and you'll receive full data copies automatically.</Text>
            </View>
          )}
          <TouchableOpacity style={styles.option} onPress={() => void handleImmediateExit()} disabled={loading}>
            <Text style={styles.optionTitle}>Exit without copies</Text>
            <Text style={styles.optionSub}>Immediate. Access revoked instantly.</Text>
          </TouchableOpacity>
          {!isLastMember && (
            <TouchableOpacity style={styles.option} onPress={() => setStep('scope')}>
              <Text style={styles.optionTitle}>Exit with copies</Text>
              <Text style={styles.optionSub}>Request data copies. Requires owner approval.</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {step === 'scope' && (
        <View>
          <Text style={styles.sectionTitle}>Choose what to copy</Text>
          <ScopeToggle
            label="Lists"
            field="lists"
            options={[{ value: 'all', label: 'All' }, { value: 'none', label: 'None' }]}
          />
          <ScopeToggle
            label="Gift Cards"
            field="giftCards"
            options={[{ value: 'active_only', label: 'Active' }, { value: 'none', label: 'None' }]}
          />
          <ScopeToggle
            label="Loyalty Cards"
            field="loyaltyCards"
            options={[{ value: 'all', label: 'All' }, { value: 'none', label: 'None' }]}
          />
          <ScopeToggle
            label="Expenses"
            field="expenses"
            options={[{ value: '12months', label: '12 months' }, { value: 'none', label: 'None' }]}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
            <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: '#f3f4f6' }]} onPress={() => setStep('choose')}>
              <Text style={{ color: '#374151', fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={() => void handleSubmitCopyRequest()} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>Submit Request</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 'pending' && (
        <View>
          <View style={styles.info}>
            <Text style={styles.infoTitle}>
              {copyRequestStatus === 'pending' ? 'Waiting for approval' : `Request ${copyRequestStatus ?? ''}`}
            </Text>
            <Text style={styles.infoText}>
              {copyRequestStatus === 'pending'
                ? 'An owner must approve your copy request. You can exit without copies now, or wait.'
                : 'You can exit now.'}
            </Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => void handleImmediateExit()} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>Exit without copies</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 20 },
  warning: { backgroundColor: '#fef3c7', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#fde68a' },
  warningTitle: { fontSize: 15, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  warningText: { fontSize: 13, color: '#92400e' },
  info: { backgroundColor: '#eff6ff', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#1e40af', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#1e40af' },
  option: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  optionTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  optionSub: { fontSize: 13, color: '#6b7280' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 16 },
  scopeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  scopeLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  scopeOptions: { flexDirection: 'row', gap: 6 },
  scopeOpt: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  scopeOptActive: { backgroundColor: '#60a5fa', borderColor: '#60a5fa' },
  scopeOptText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  scopeOptTextActive: { color: '#fff', fontWeight: '600' },
  btn: { backgroundColor: '#60a5fa', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
