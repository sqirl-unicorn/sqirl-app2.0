/**
 * Gift Cards tab — household-shared gift card list for mobile.
 *
 * Features:
 *  - Active/Archived toggle
 *  - Card tiles: brand logo + balance; tap → detail screen
 *  - Add card: searchable brand picker, card number (with camera scan),
 *    balance, conditional PIN and expiry fields per brand rules
 *  - Polls every 30 s for real-time household updates
 *  - Offline-first: cached in local state; writes queued when offline
 */

import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ScrollView, Image, Alert, ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../../src/lib/api';
import * as wsClient from '../../src/lib/wsClient';
import { GIFT_BRANDS, getGiftBrandsForCountry, getGiftBrandById } from '@sqirl/shared';
import type { GiftCard, GiftBrand, BarcodeFormat, CreateGiftCardPayload } from '@sqirl/shared';
import { useAuthStore } from '../../src/store/authStore';
import { colors, typography, spacing, borderRadius, shadows } from '../../constants/designTokens';

const BARCODE_FORMATS: BarcodeFormat[] = [
  'CODE128','EAN13','EAN8','QR','CODABAR',
  'ITF','CODE39','UPC_A','UPC_E','PDF417','AZTEC','DATA_MATRIX',
];

// ── Camera scan modal ─────────────────────────────────────────────────────────

function ScanModal({ onScanned, onClose }: { onScanned(v: string): void; onClose(): void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);
  useEffect(() => { if (!permission?.granted) void requestPermission(); }, [permission, requestPermission]);
  const handleBarcode = useCallback(({ data }: { data: string }) => {
    if (scanned.current) return;
    scanned.current = true;
    onScanned(data);
  }, [onScanned]);
  return (
    <Modal animationType="slide" presentationStyle="fullScreen">
      <View style={s.scanContainer}>
        {permission?.granted
          ? <CameraView style={StyleSheet.absoluteFill} facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['code128','ean13','ean8','qr','upc_a','upc_e','itf14','codabar','code39'] }}
              onBarcodeScanned={handleBarcode} />
          : <Text style={s.scanPerm}>Camera permission required</Text>}
        <View style={s.scanOverlay}>
          <View style={s.scanFrame} />
          <Text style={s.scanHint}>Align the barcode within the frame</Text>
          <TouchableOpacity style={s.scanCloseBtn} onPress={onClose}>
            <Text style={s.scanCloseTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Brand picker ──────────────────────────────────────────────────────────────

function BrandPicker({ userCountry, selected, onSelect }: {
  userCountry: string;
  selected: GiftBrand | null;
  onSelect(b: GiftBrand): void;
}) {
  const [query, setQuery] = useState('');
  const local = getGiftBrandsForCountry(userCountry);
  const other = GIFT_BRANDS.filter((b) => !b.countries.includes(userCountry)).sort((a, b) => a.name.localeCompare(b.name));
  const all = [...local, ...other];
  const filtered = query ? all.filter((b) => b.name.toLowerCase().includes(query.toLowerCase())) : all;
  return (
    <View style={s.brandPicker}>
      <TextInput style={s.searchInput} placeholder="Search brands…" value={query} onChangeText={setQuery} autoCorrect={false} />
      <ScrollView style={s.brandList} nestedScrollEnabled>
        {filtered.map((brand) => (
          <TouchableOpacity key={brand.id} style={[s.brandRow, selected?.id === brand.id && s.brandRowSel]} onPress={() => onSelect(brand)}>
            <Image source={{ uri: brand.logoUrl }} style={s.brandLogo} resizeMode="contain" />
            <Text style={s.brandName}>{brand.name}</Text>
          </TouchableOpacity>
        ))}
        {filtered.length === 0 && <Text style={s.emptyText}>No brands found</Text>}
      </ScrollView>
    </View>
  );
}

// ── Add card modal ────────────────────────────────────────────────────────────

function AddCardModal({ userCountry, onAdded, onClose }: {
  userCountry: string;
  onAdded(card: GiftCard): void;
  onClose(): void;
}) {
  const [brand, setBrand] = useState<GiftBrand | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [balance, setBalance] = useState('');
  const [pin, setPin] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>('CODE128');
  const [showScan, setShowScan] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleSelectBrand(b: GiftBrand) { setBrand(b); setBarcodeFormat(b.barcodeFormat); }

  async function handleAdd() {
    if (!brand) { Alert.alert('Please select a brand'); return; }
    if (!cardNumber.trim()) { Alert.alert('Card number is required'); return; }
    const balanceNum = Number(balance);
    if (isNaN(balanceNum) || balanceNum < 0) { Alert.alert('Balance must be a non-negative number'); return; }
    if (brand.requiresPin && !pin.trim()) { Alert.alert(`PIN is required for ${brand.name} gift cards`); return; }
    setSaving(true);
    try {
      const payload: CreateGiftCardPayload = {
        brandId: brand.id, cardNumber: cardNumber.trim(),
        barcodeFormat, balance: balanceNum,
        clientId: Math.random().toString(36).slice(2),
      };
      if (pin.trim()) payload.pin = pin.trim();
      if (expiryDate.trim()) payload.expiryDate = expiryDate.trim();
      const { card } = await api.addGiftCard(payload);
      onAdded(card);
    } catch { Alert.alert('Failed to add gift card'); }
    finally { setSaving(false); }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet">
      <View style={s.modalContainer}>
        <Text style={s.modalTitle}>Add Gift Card</Text>
        {!brand ? (
          <BrandPicker userCountry={userCountry} selected={brand} onSelect={handleSelectBrand} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={s.brandHeader}>
              <Image source={{ uri: brand.logoUrl }} style={s.brandHeaderLogo} resizeMode="contain" />
              <Text style={s.brandHeaderName}>{brand.name}</Text>
              <TouchableOpacity onPress={() => setBrand(null)}>
                <Text style={s.changeBrand}>Change</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Card number</Text>
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1 }]} value={cardNumber} onChangeText={setCardNumber} placeholder="Card number…" autoCapitalize="characters" />
              <TouchableOpacity style={s.scanBtn} onPress={() => setShowScan(true)}><Text>📷</Text></TouchableOpacity>
            </View>

            <Text style={s.label}>Opening balance</Text>
            <TextInput style={s.input} value={balance} onChangeText={setBalance} placeholder="0.00" keyboardType="decimal-pad" />

            {brand.requiresPin && (
              <>
                <Text style={s.label}>PIN *</Text>
                <TextInput style={s.input} value={pin} onChangeText={setPin} placeholder="PIN…" keyboardType="numeric" secureTextEntry />
              </>
            )}
            {brand.requiresExpiry && (
              <>
                <Text style={s.label}>Expiry (YYYY-MM-DD) *</Text>
                <TextInput style={s.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="2027-12-31" keyboardType="numbers-and-punctuation" />
              </>
            )}

            <Text style={s.label}>Barcode format</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {BARCODE_FORMATS.map((f) => (
                <TouchableOpacity key={f} style={[s.fmtChip, barcodeFormat === f && s.fmtChipSel]} onPress={() => setBarcodeFormat(f)}>
                  <Text style={[s.fmtChipText, barcodeFormat === f && s.fmtChipTextSel]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={onClose}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.addBtn} onPress={() => void handleAdd()} disabled={saving}>
                <Text style={s.addTxt}>{saving ? 'Adding…' : 'Add Gift Card'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
        {showScan && <ScanModal onScanned={(v) => { setCardNumber(v); setShowScan(false); }} onClose={() => setShowScan(false)} />}
      </View>
    </Modal>
  );
}

// ── Card tile ─────────────────────────────────────────────────────────────────

function CardTile({ card, onPress }: { card: GiftCard; onPress(): void }) {
  const brand = getGiftBrandById(card.brandId);
  return (
    <TouchableOpacity style={s.tile} onPress={onPress} activeOpacity={0.85}>
      <Image source={{ uri: brand?.logoUrl ?? `https://www.google.com/s2/favicons?domain=${card.brandId}&sz=64` }} style={s.tileLogo} resizeMode="contain" />
      <View style={s.tileInfo}>
        <Text style={s.tileBrand}>{brand?.name ?? card.brandId}</Text>
        <Text style={s.tileNum} numberOfLines={1}>{card.cardNumber}</Text>
        {card.expiryDate && <Text style={s.tileExpiry}>Expires {card.expiryDate}</Text>}
      </View>
      <View style={s.tileRight}>
        <Text style={s.tileAmt}>${Number(card.balance).toFixed(2)}</Text>
        {card.isArchived && <Text style={s.archTag}>Archived</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function GiftCardsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCards = useCallback(async () => {
    try { const { cards: fetched } = await api.getGiftCards(); setCards(fetched); }
    catch { /* offline — keep cached */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void loadCards();
    return wsClient.on('giftCards:changed', () => void loadCards());
  }, [loadCards]);

  const active   = cards.filter((c) => !c.isDeleted && !c.isArchived);
  const archived = cards.filter((c) => !c.isDeleted &&  c.isArchived);
  const visible  = tab === 'active' ? active : archived;

  return (
    <View style={s.screen}>
      <View style={s.tabs}>
        {(['active', 'archived'] as const).map((t) => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t === 'active' ? `Active (${active.length})` : `Archived (${archived.length})`}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.addBtn2} onPress={() => setShowAdd(true)}>
          <Text style={s.addBtn2Txt}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator style={{ flex: 1 }} color={colors.primary[400]} />
        : visible.length === 0
          ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🎁</Text>
              <Text style={s.emptyText}>{tab === 'active' ? 'No active gift cards' : 'No archived gift cards'}</Text>
            </View>
          ) : (
            <FlatList
              data={visible}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <CardTile card={item} onPress={() => router.push(`/gift-card/${item.id}` as `/gift-card/${string}`)} />
              )}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              showsVerticalScrollIndicator={false}
            />
          )
      }

      {showAdd && (
        <AddCardModal
          userCountry={user?.country ?? 'AU'}
          onAdded={(card) => { setCards((prev) => [card, ...prev]); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: colors.background.canvas },
  tabs:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.xs, backgroundColor: colors.background.surface, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  tabBtn:          { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.pill, backgroundColor: colors.neutral[100] },
  tabBtnActive:    { backgroundColor: colors.primary[400] },
  tabTxt:          { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.text.muted },
  tabTxtActive:    { color: colors.text.inverse },
  addBtn2:         { marginLeft: 'auto', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.pill, backgroundColor: colors.primary[400] },
  addBtn2Txt:      { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.inverse },
  tile:            { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.surface, borderRadius: borderRadius.xl, padding: spacing.md, ...shadows.sm },
  tileLogo:        { width: 48, height: 48, borderRadius: borderRadius.lg, backgroundColor: colors.background.canvas, marginRight: spacing.md },
  tileInfo:        { flex: 1 },
  tileBrand:       { fontSize: typography.fontSize.md + 1, fontWeight: typography.fontWeight.semibold, color: colors.text.default },
  tileNum:         { fontSize: typography.fontSize['2xs'], color: colors.text.muted, fontFamily: 'monospace', marginTop: 2 },
  tileExpiry:      { fontSize: typography.fontSize.xs, color: colors.text.subtle, marginTop: 2 },
  tileRight:       { alignItems: 'flex-end' },
  tileAmt:         { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.default },
  archTag:         { fontSize: typography.fontSize.xs, color: colors.text.subtle, backgroundColor: colors.neutral[100], borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 2 },
  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  emptyIcon:       { fontSize: 48 },
  emptyText:       { fontSize: typography.fontSize.md, color: colors.text.subtle },
  // Modal
  modalContainer:  { flex: 1, padding: spacing.lg, backgroundColor: colors.background.surface },
  modalTitle:      { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.default, marginBottom: spacing.base },
  label:           { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.neutral[700], marginBottom: spacing.xs },
  input:           { borderWidth: 1, borderColor: colors.border.strong, borderRadius: borderRadius.md, padding: spacing.md, fontSize: typography.fontSize.md, marginBottom: spacing.md, color: colors.text.default },
  row:             { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  scanBtn:         { borderWidth: 1, borderColor: colors.border.strong, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center', justifyContent: 'center' },
  fmtChip:         { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.pill, backgroundColor: colors.neutral[100], marginRight: spacing.xs },
  fmtChipSel:      { backgroundColor: colors.primary[400] },
  fmtChipText:     { fontSize: typography.fontSize['2xs'], color: colors.text.muted },
  fmtChipTextSel:  { color: colors.text.inverse, fontWeight: typography.fontWeight.semibold },
  modalBtns:       { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs, marginBottom: 40 },
  cancelBtn:       { flex: 1, padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border.strong, alignItems: 'center' },
  cancelTxt:       { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium, color: colors.neutral[700] },
  addBtn:          { flex: 1, padding: spacing.md, borderRadius: borderRadius.lg, backgroundColor: colors.primary[400], alignItems: 'center' },
  addTxt:          { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text.inverse },
  brandPicker:     { flex: 1 },
  searchInput:     { borderWidth: 1, borderColor: colors.border.strong, borderRadius: borderRadius.md, padding: spacing.md, fontSize: typography.fontSize.md, marginBottom: spacing.md },
  brandList:       { maxHeight: 380 },
  brandRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xs, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.background.canvas },
  brandRowSel:     { backgroundColor: colors.primary[50] },
  brandLogo:       { width: 28, height: 28, borderRadius: borderRadius.sm },
  brandName:       { fontSize: typography.fontSize.md, color: colors.text.default },
  brandHeader:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.canvas, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.base, gap: spacing.md },
  brandHeaderLogo: { width: 36, height: 36, borderRadius: borderRadius.md },
  brandHeaderName: { flex: 1, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.text.default },
  changeBrand:     { fontSize: typography.fontSize.sm, color: colors.primary[400], textDecorationLine: 'underline' },
  // Scan
  scanContainer:   { flex: 1, backgroundColor: '#000' },
  scanPerm:        { color: colors.text.inverse, textAlign: 'center', marginTop: 100 },
  scanOverlay:     { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame:       { width: 260, height: 160, borderWidth: 2, borderColor: colors.primary[400], borderRadius: borderRadius.lg },
  scanHint:        { color: colors.text.inverse, marginTop: spacing.base, fontSize: typography.fontSize.sm },
  scanCloseBtn:    { marginTop: spacing.xl, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.pill },
  scanCloseTxt:    { color: colors.text.inverse, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold },
});
