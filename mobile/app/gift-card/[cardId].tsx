/**
 * Gift Card Detail screen — full detail view for a single gift card.
 *
 * Layout:
 *  - Top half: brand logo, name, balance, expiry, masked/unmasked PIN
 *  - Second half centre: barcode or QR code (BarcodeSvg)
 *  - Card number in monospace below the barcode
 *  - Action buttons: Update Balance | Add Transaction | Archive | Delete
 *  - Transaction history list (reverse chronological)
 *
 * Modals:
 *  - Update Balance: new balance + optional note
 *  - Add Transaction: signed amount, date, optional location, description,
 *    optional "add as expense" (for spend amounts)
 */

import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Image, Alert, ActivityIndicator, Dimensions, Switch,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Svg, Rect, G } from 'react-native-svg';
import { api } from '../../src/lib/api';
import { getGiftBrandById } from '@sqirl/shared';
import type { GiftCard, GiftCardTransaction, BarcodeFormat } from '@sqirl/shared';
import { encodeCode128, generateQrMatrix } from '../../src/lib/barcodeRenderer';
import { colors, typography, spacing, borderRadius, shadows } from '../../constants/designTokens';
import { analytics } from '../../src/lib/analyticsService';

const { width: SCREEN_W } = Dimensions.get('window');
const BARCODE_W = SCREEN_W - 64;
const BARCODE_H = 90;

// ── Barcode SVG ────────────────────────────────────────────────────────────────

interface BarcodeSvgProps { value: string; format: BarcodeFormat; width: number; height: number; }

function BarcodeSvg({ value, format, width, height }: BarcodeSvgProps) {
  const [qrMatrix, setQrMatrix] = useState<boolean[][] | null>(null);
  const [bars, setBars] = useState('');
  const [err, setErr] = useState(false);

  useEffect(() => {
    setErr(false); setQrMatrix(null); setBars('');
    if (format === 'QR') {
      generateQrMatrix(value).then(setQrMatrix).catch(() => setErr(true));
    } else {
      try { setBars(encodeCode128(value)); }
      catch { setErr(true); }
    }
  }, [value, format]);

  if (err) return <View style={[s.bcFallback, { width, height }]}><Text style={s.bcFallbackTxt} numberOfLines={1}>{value}</Text></View>;

  if (format === 'QR') {
    if (!qrMatrix) return <ActivityIndicator style={{ width, height }} />;
    const sz = qrMatrix.length;
    const cell = Math.floor(width / sz);
    return (
      <Svg width={cell * sz} height={cell * sz}>
        <Rect width={cell * sz} height={cell * sz} fill="white" />
        {qrMatrix.flatMap((row, r) => row.map((dark, c) =>
          dark ? <Rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="black" /> : null
        ))}
      </Svg>
    );
  }

  if (!bars) return <ActivityIndicator style={{ width, height }} />;
  const modW = width / bars.length;
  return (
    <Svg width={width} height={height}>
      <Rect width={width} height={height} fill="white" />
      <G>{bars.split('').map((b, i) => b === '1' ? <Rect key={i} x={i * modW} y={0} width={Math.max(modW, 1)} height={height} fill="black" /> : null)}</G>
    </Svg>
  );
}

// ── Update Balance Modal ──────────────────────────────────────────────────────

function UpdateBalanceModal({ card, onSave, onClose }: {
  card: GiftCard;
  onSave(updated: GiftCard, txn: GiftCardTransaction): void;
  onClose(): void;
}) {
  const [newBalance, setNewBalance] = useState(String(Number(card.balance).toFixed(2)));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = Number(newBalance);
    if (isNaN(n) || n < 0) { Alert.alert('Balance must be non-negative'); return; }
    setSaving(true);
    try {
      const { card: updated, transaction } = await api.updateGiftCardBalance(card.id, { newBalance: n, note: note.trim() || undefined });
      analytics.track('gift_card.balance_updated', { brandId: card.brandId, newBalance: n, delta: n - card.balance });
      onSave(updated, transaction);
    } catch { Alert.alert('Failed to update balance'); }
    finally { setSaving(false); }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet">
      <View style={s.modal}>
        <Text style={s.modalTitle}>Update Balance</Text>
        <Text style={s.label}>New balance</Text>
        <TextInput style={s.input} value={newBalance} onChangeText={setNewBalance} keyboardType="decimal-pad" autoFocus />
        <Text style={s.label}>Note (optional)</Text>
        <TextInput style={s.input} value={note} onChangeText={setNote} placeholder="e.g. Correcting balance" />
        <View style={s.btns}>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={s.primaryBtn} onPress={() => void handleSave()} disabled={saving}>
            <Text style={s.primaryTxt}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Add Transaction Modal ─────────────────────────────────────────────────────

function AddTransactionModal({ card, onSave, onClose }: {
  card: GiftCard;
  onSave(updated: GiftCard, txn: GiftCardTransaction): void;
  onClose(): void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [addAsExpense, setAddAsExpense] = useState(false);
  const [saving, setSaving] = useState(false);

  const amtNum = Number(amount);
  const isSpend = amtNum < 0;

  async function handleSave() {
    if (isNaN(amtNum) || amtNum === 0) { Alert.alert('Amount must be non-zero'); return; }
    if (!date) { Alert.alert('Date is required'); return; }
    setSaving(true);
    try {
      const { card: updated, transaction, expenseId } = await api.addGiftCardTransaction(card.id, {
        amount: amtNum,
        transactionDate: new Date(date).toISOString(),
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        addAsExpense: isSpend && addAsExpense,
      });
      analytics.track('gift_card.transaction_added', { brandId: card.brandId, transactionType: amtNum < 0 ? 'spend' : 'reload', amount: amtNum, transactionDate: date, addedAsExpense: !!expenseId });
      onSave(updated, transaction);
    } catch { Alert.alert('Failed to record transaction'); }
    finally { setSaving(false); }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={s.modal} keyboardShouldPersistTaps="handled">
        <Text style={s.modalTitle}>Add Transaction</Text>
        <Text style={s.label}>Amount (negative = spend)</Text>
        <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" placeholder="-10.00" autoFocus />
        <Text style={s.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={s.input} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <Text style={s.label}>Location (optional)</Text>
        <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="e.g. CBD Store" />
        <Text style={s.label}>Description (optional)</Text>
        <TextInput style={s.input} value={description} onChangeText={setDescription} placeholder="e.g. Bought headphones" />
        {isSpend && (
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Add as personal expense</Text>
            <Switch value={addAsExpense} onValueChange={setAddAsExpense} trackColor={{ true: '#60a5fa' }} />
          </View>
        )}
        <View style={s.btns}>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={s.primaryBtn} onPress={() => void handleSave()} disabled={saving}>
            <Text style={s.primaryTxt}>{saving ? 'Saving…' : 'Save Transaction'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Modal>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────

function TxnRow({ txn }: { txn: GiftCardTransaction }) {
  const sign = txn.type === 'spend' ? '-' : txn.type === 'reload' ? '+' : '±';
  const color = txn.type === 'spend' ? '#ef4444' : txn.type === 'reload' ? '#22c55e' : '#6b7280';
  return (
    <View style={s.txnRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.txnType}>{txn.type.replace('_', ' ')}</Text>
        {txn.description ? <Text style={s.txnNote}>{txn.description}</Text> : null}
        {txn.location ? <Text style={s.txnNote}>{txn.location}</Text> : null}
        <Text style={s.txnDate}>{new Date(txn.transactionDate).toLocaleDateString()}{txn.expenseId ? ' · As expense' : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.txnAmt, { color }]}>{sign}${Math.abs(Number(txn.amount)).toFixed(2)}</Text>
        <Text style={s.txnAfter}>${Number(txn.balanceAfter).toFixed(2)}</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function GiftCardDetailScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const router = useRouter();
  const [card, setCard] = useState<GiftCard | null>(null);
  const [transactions, setTransactions] = useState<GiftCardTransaction[]>([]);
  const [pinVisible, setPinVisible] = useState(false);
  const [modal, setModal] = useState<'balance' | 'transaction' | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCard = useCallback(async () => {
    if (!cardId) return;
    try {
      const { cards: all } = await api.getGiftCards();
      setCard(all.find((c) => c.id === cardId) ?? null);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, [cardId]);

  const loadTransactions = useCallback(async () => {
    if (!cardId) return;
    try {
      const { transactions: txns } = await api.getGiftCardTransactions(cardId);
      setTransactions(txns);
    } catch { /* non-fatal */ }
  }, [cardId]);

  useEffect(() => { void loadCard(); void loadTransactions(); }, [loadCard, loadTransactions]);

  async function handleArchive() {
    if (!card) return;
    Alert.alert('Archive Card', 'Archive this gift card?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => {
        try { const { card: updated } = await api.archiveGiftCard(card.id); analytics.track('gift_card.archived', { brandId: card.brandId, balance: card.balance }); setCard(updated); }
        catch { Alert.alert('Failed to archive'); }
      }},
    ]);
  }

  async function handleDelete() {
    if (!card) return;
    Alert.alert('Delete Card', 'Delete this gift card? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.deleteGiftCard(card.id); analytics.track('gift_card.deleted', { brandId: card.brandId }); router.back(); }
        catch { Alert.alert('Failed to delete'); }
      }},
    ]);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary[400]} />;
  if (!card) return (
    <View style={s.center}>
      <Text style={s.notFound}>Gift card not found</Text>
      <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
    </View>
  );

  const brand = getGiftBrandById(card.brandId);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* ── Top half ─────────────────────────────────────────────────── */}
      <View style={s.topCard}>
        <Image
          source={{ uri: brand?.logoUrl ?? `https://www.google.com/s2/favicons?domain=${card.brandId}&sz=64` }}
          style={s.logo} resizeMode="contain"
        />
        <Text style={s.brandName}>{brand?.name ?? card.brandId}</Text>
        {card.isArchived && <Text style={s.archBadge}>Archived</Text>}

        <Text style={s.balance}>${Number(card.balance).toFixed(2)}</Text>
        <Text style={s.balanceLabel}>balance</Text>

        <View style={s.metaRow}>
          {card.expiryDate && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Expires</Text>
              <Text style={s.metaValue}>{card.expiryDate}</Text>
            </View>
          )}
          {card.pin && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>PIN</Text>
              <TouchableOpacity style={s.pinRow} onPress={() => setPinVisible((v) => !v)}>
                <Text style={s.metaValue}>{pinVisible ? card.pin : '••••'}</Text>
                <Text style={s.pinEye}>{pinVisible ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ── Barcode centred in second half ─────────────────────────── */}
      <View style={s.barcodeCard}>
        <BarcodeSvg value={card.cardNumber} format={card.barcodeFormat} width={BARCODE_W} height={BARCODE_H} />
        <Text style={s.cardNum}>{card.cardNumber}</Text>
      </View>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <View style={s.actionsGrid}>
        <TouchableOpacity style={[s.actionBtn, s.actionPrimary]} onPress={() => setModal('balance')}>
          <Text style={s.actionPrimaryTxt}>Update Balance</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, s.actionOutline]} onPress={() => setModal('transaction')}>
          <Text style={s.actionOutlineTxt}>Add Transaction</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, s.actionGhost]} onPress={() => void handleArchive()} disabled={card.isArchived}>
          <Text style={s.actionGhostTxt}>{card.isArchived ? 'Archived' : 'Archive'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, s.actionDanger]} onPress={() => void handleDelete()}>
          <Text style={s.actionDangerTxt}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* ── Transaction history ──────────────────────────────────────── */}
      <View style={s.histCard}>
        <Text style={s.histTitle}>Transaction History</Text>
        {transactions.length === 0
          ? <Text style={s.histEmpty}>No transactions yet.</Text>
          : transactions.map((txn) => <TxnRow key={txn.id} txn={txn} />)
        }
      </View>

      {/* Modals */}
      {modal === 'balance' && (
        <UpdateBalanceModal
          card={card}
          onSave={(updated, txn) => { setCard(updated); setTransactions((prev) => [txn, ...prev]); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'transaction' && (
        <AddTransactionModal
          card={card}
          onSave={(updated, txn) => { setCard(updated); setTransactions((prev) => [txn, ...prev]); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: colors.background.canvas },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound:         { fontSize: typography.fontSize.md + 1, color: colors.text.muted, marginBottom: spacing.md },
  back:             { fontSize: typography.fontSize.md, color: colors.primary[400], textDecorationLine: 'underline' },
  topCard:          { margin: spacing.base, padding: spacing.lg, backgroundColor: colors.background.surface, borderRadius: borderRadius.xl, alignItems: 'center', ...shadows.sm },
  logo:             { width: 64, height: 64, borderRadius: borderRadius.xl, backgroundColor: colors.background.canvas, marginBottom: spacing.xs },
  brandName:        { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.default, marginBottom: spacing.xs },
  archBadge:        { fontSize: typography.fontSize.xs, color: colors.text.subtle, backgroundColor: colors.neutral[100], borderRadius: borderRadius.pill, paddingHorizontal: spacing.xs, paddingVertical: 2, marginBottom: spacing.xs },
  balance:          { fontSize: 40, fontWeight: '800', color: colors.text.default, marginTop: spacing.xs },
  balanceLabel:     { fontSize: typography.fontSize.sm, color: colors.text.subtle, marginBottom: spacing.md },
  metaRow:          { flexDirection: 'row', gap: 24, marginTop: spacing.xs },
  metaItem:         { alignItems: 'center' },
  metaLabel:        { fontSize: typography.fontSize.xs, color: colors.text.subtle, marginBottom: 2 },
  metaValue:        { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.neutral[700], fontFamily: 'monospace' },
  pinRow:           { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pinEye:           { fontSize: typography.fontSize.md },
  barcodeCard:      { marginHorizontal: spacing.base, marginBottom: spacing.md, padding: spacing.lg, backgroundColor: colors.background.surface, borderRadius: borderRadius.xl, alignItems: 'center', ...shadows.sm },
  cardNum:          { fontFamily: 'monospace', fontSize: typography.fontSize.sm, color: colors.text.muted, marginTop: spacing.md, letterSpacing: 2 },
  actionsGrid:      { marginHorizontal: spacing.base, marginBottom: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionBtn:        { flex: 1, minWidth: '45%', padding: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' },
  actionPrimary:    { backgroundColor: colors.primary[400] },
  actionPrimaryTxt: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text.inverse },
  actionOutline:    { borderWidth: 1.5, borderColor: colors.primary[400] },
  actionOutlineTxt: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.primary[400] },
  actionGhost:      { borderWidth: 1, borderColor: colors.border.strong },
  actionGhostTxt:   { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium, color: colors.text.muted },
  actionDanger:     { borderWidth: 1, borderColor: colors.error.light },
  actionDangerTxt:  { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium, color: colors.error.default },
  histCard:         { marginHorizontal: spacing.base, backgroundColor: colors.background.surface, borderRadius: borderRadius.xl, padding: spacing.base, ...shadows.sm },
  histTitle:        { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.text.default, marginBottom: spacing.xs },
  histEmpty:        { fontSize: typography.fontSize.sm, color: colors.text.subtle },
  txnRow:           { flexDirection: 'row', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.background.canvas },
  txnType:          { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.neutral[700], textTransform: 'capitalize' },
  txnNote:          { fontSize: typography.fontSize.xs, color: colors.text.subtle },
  txnDate:          { fontSize: typography.fontSize.xs, color: colors.border.strong, marginTop: 2 },
  txnAmt:           { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold },
  txnAfter:         { fontSize: typography.fontSize.xs, color: colors.text.subtle },
  bcFallback:       { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.canvas, borderRadius: borderRadius.md },
  bcFallbackTxt:    { fontSize: typography.fontSize.xs, color: colors.text.subtle, fontFamily: 'monospace' },
  // Modal
  modal:            { flex: 1, padding: spacing.lg, backgroundColor: colors.background.surface },
  modalTitle:       { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.default, marginBottom: spacing.base },
  label:            { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.neutral[700], marginBottom: spacing.xs },
  input:            { borderWidth: 1, borderColor: colors.border.strong, borderRadius: borderRadius.md, padding: spacing.md, fontSize: typography.fontSize.md, marginBottom: spacing.md, color: colors.text.default },
  switchRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.base },
  switchLabel:      { fontSize: typography.fontSize.md, color: colors.neutral[700] },
  btns:             { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  cancelBtn:        { flex: 1, padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border.strong, alignItems: 'center' },
  cancelTxt:        { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium, color: colors.neutral[700] },
  primaryBtn:       { flex: 1, padding: spacing.md, borderRadius: borderRadius.lg, backgroundColor: colors.primary[400], alignItems: 'center' },
  primaryTxt:       { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text.inverse },
});
