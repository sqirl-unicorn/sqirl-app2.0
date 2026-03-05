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
import { colors, typography, spacing, borderRadius, shadows } from '../../constants/designTokens';
import { useHouseholdStore } from '../../src/store/householdStore';
import { analytics } from '../../src/lib/analyticsService';

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
      analytics.track('household.invite_sent', { identifierType: mode, expiryDays });
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
  container:        { padding: spacing.lg },
  subtitle:         { fontSize: typography.fontSize.md, color: colors.text.muted, marginBottom: spacing.lg },
  toggle:           { flexDirection: 'row', backgroundColor: colors.neutral[100], borderRadius: borderRadius.lg, padding: spacing.xs, marginBottom: spacing.base },
  toggleBtn:        { flex: 1, paddingVertical: spacing.xs, borderRadius: borderRadius.md, alignItems: 'center' },
  toggleActive:     { backgroundColor: colors.background.surface, ...shadows.sm },
  toggleText:       { fontSize: typography.fontSize.md, color: colors.text.muted, fontWeight: typography.fontWeight.medium },
  toggleTextActive: { color: colors.text.default, fontWeight: typography.fontWeight.semibold },
  input:            { borderWidth: 1, borderColor: colors.border.soft, borderRadius: borderRadius.lg, paddingHorizontal: spacing.base, paddingVertical: spacing.md, fontSize: typography.fontSize.md + 1, marginBottom: spacing.lg, backgroundColor: colors.background.surface },
  label:            { fontSize: typography.fontSize.sm, color: colors.text.muted, marginBottom: spacing.md },
  expiryRow:        { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xl },
  expiryBtn:        { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border.soft, backgroundColor: colors.background.surface },
  expiryBtnActive:  { backgroundColor: colors.primary[400], borderColor: colors.primary[400] },
  expiryText:       { fontSize: typography.fontSize.sm, color: colors.text.muted, fontWeight: typography.fontWeight.medium },
  expiryTextActive: { color: colors.text.inverse, fontWeight: typography.fontWeight.semibold },
  sendBtn:          { backgroundColor: colors.primary[400], borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center' },
  sendBtnText:      { color: colors.text.inverse, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold },
});
