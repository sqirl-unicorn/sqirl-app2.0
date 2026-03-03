/**
 * Mobile invite screen — send a household invitation.
 * Presented as a modal from the household tab.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../src/lib/api';
import { useHouseholdStore } from '../../src/store/householdStore';

export default function InviteScreen() {
  const router = useRouter();
  const { household } = useHouseholdStore();

  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [inviteePhone, setInviteePhone] = useState('');
  const [expiryDays, setExpiryDays] = useState(7);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const contact = mode === 'email' ? inviteeEmail.trim() : inviteePhone.trim();
    if (!contact) {
      Alert.alert('Missing field', `Please enter an ${mode === 'email' ? 'email address' : 'phone number'}`);
      return;
    }

    try {
      setLoading(true);
      await api.sendInvite({
        ...(mode === 'email' ? { inviteeEmail: contact } : { inviteePhone: contact }),
        householdId: household?.id,
        expiryDays,
      });
      Alert.alert('Sent!', 'Invitation sent successfully.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err) {
      const e = err as Error;
      const msg = e.message === 'SQIRL-HH-INVITE-004'
        ? 'A pending invitation already exists for this person.'
        : 'Failed to send invitation. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {household && (
        <Text style={styles.subtitle}>Invite to {household.name}</Text>
      )}

      {/* Mode toggle */}
      <View style={styles.toggle}>
        {(['email', 'phone'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            style={[styles.toggleBtn, mode === m && styles.toggleActive]}
          >
            <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
              {m === 'email' ? 'Email' : 'Phone'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'email' ? (
        <TextInput
          value={inviteeEmail}
          onChangeText={setInviteeEmail}
          placeholder="their@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />
      ) : (
        <TextInput
          value={inviteePhone}
          onChangeText={setInviteePhone}
          placeholder="+1 555 000 0000"
          keyboardType="phone-pad"
          style={styles.input}
        />
      )}

      {/* Expiry */}
      <Text style={styles.label}>Expires in <Text style={{ fontWeight: '700' }}>{expiryDays} day{expiryDays !== 1 ? 's' : ''}</Text></Text>
      <View style={styles.expiryRow}>
        {[1, 3, 7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            onPress={() => setExpiryDays(d)}
            style={[styles.expiryBtn, expiryDays === d && styles.expiryBtnActive]}
          >
            <Text style={[styles.expiryText, expiryDays === d && styles.expiryTextActive]}>{d}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[styles.sendBtn, loading && { opacity: 0.6 }]} onPress={() => void handleSend()} disabled={loading}>
        <Text style={styles.sendBtnText}>{loading ? 'Sending…' : 'Send Invitation'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  toggle: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  toggleActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  toggleText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  toggleTextActive: { color: '#111827', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 20, backgroundColor: '#fff' },
  label: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  expiryRow: { flexDirection: 'row', gap: 8, marginBottom: 32 },
  expiryBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  expiryBtnActive: { backgroundColor: '#60a5fa', borderColor: '#60a5fa' },
  expiryText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  expiryTextActive: { color: '#fff', fontWeight: '600' },
  sendBtn: { backgroundColor: '#60a5fa', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
