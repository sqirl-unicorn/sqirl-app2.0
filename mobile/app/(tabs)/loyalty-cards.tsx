/**
 * Loyalty Cards tab — household-shared loyalty card list for mobile.
 *
 * Features:
 *  - List all household cards inline: brand logo, barcode/QR, card number
 *  - Tap a card → fullscreen view with barcode centred in the bottom half
 *  - Add card: searchable brand picker, card number, barcode format
 *  - Scan card: expo-camera barcode scanner auto-fills card number
 *  - Edit/delete any card (household-shared access)
 *  - Offline-first: cards cached in zustand; polls every 30 s
 */

import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ScrollView, Image, Alert, Dimensions, Platform, ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as wsClient from '../../src/lib/wsClient';
import { Svg, Rect, G } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../../src/lib/api';
import { LOYALTY_BRANDS, getBrandById, getBrandsForCountry } from '@sqirl/shared';
import type { LoyaltyCard, BarcodeFormat, LoyaltyBrand } from '@sqirl/shared';
import { useAuthStore } from '../../src/store/authStore';
import { encodeCode128, generateQrMatrix } from '../../src/lib/barcodeRenderer';
import { colors, typography, spacing, borderRadius, shadows } from '../../constants/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');

const BARCODE_FORMATS: BarcodeFormat[] = [
  'CODE128','EAN13','EAN8','QR','CODABAR',
  'ITF','CODE39','UPC_A','UPC_E','PDF417','AZTEC','DATA_MATRIX',
];

// ── Barcode SVG rendering ─────────────────────────────────────────────────────

interface BarcodeSvgProps {
  value: string;
  format: BarcodeFormat;
  width: number;
  height: number;
}

function BarcodeSvg({ value, format, width, height }: BarcodeSvgProps) {
  const [qrMatrix, setQrMatrix] = useState<boolean[][] | null>(null);
  const [encError, setEncError] = useState(false);
  const [bars, setBars] = useState<string>('');

  useEffect(() => {
    setEncError(false); setQrMatrix(null); setBars('');
    if (format === 'QR') {
      generateQrMatrix(value).then(setQrMatrix).catch(() => setEncError(true));
    } else {
      try { setBars(encodeCode128(value)); }
      catch { setEncError(true); }
    }
  }, [value, format]);

  if (encError) {
    return (
      <View style={[s.barcodeFallback, { width, height }]}>
        <Text style={s.barcodeFallbackText} numberOfLines={1}>{value}</Text>
      </View>
    );
  }

  if (format === 'QR') {
    if (!qrMatrix) return <ActivityIndicator style={{ width, height }} />;
    const size = qrMatrix.length;
    const cell = Math.floor(width / size);
    return (
      <Svg width={cell * size} height={cell * size}>
        <Rect width={cell * size} height={cell * size} fill="white" />
        {qrMatrix.flatMap((row, r) =>
          row.map((dark, c) => dark ? (
            <Rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="black" />
          ) : null)
        )}
      </Svg>
    );
  }

  if (!bars) return <ActivityIndicator style={{ width, height }} />;
  const moduleW = width / bars.length;
  return (
    <Svg width={width} height={height}>
      <Rect width={width} height={height} fill="white" />
      <G>
        {bars.split('').map((b, i) => b === '1' ? (
          <Rect key={i} x={i * moduleW} y={0} width={Math.max(moduleW, 1)} height={height} fill="black" />
        ) : null)}
      </G>
    </Svg>
  );
}

// ── Brand Picker ──────────────────────────────────────────────────────────────

function BrandPicker({ userCountry, selected, onSelect }: {
  userCountry: string;
  selected: LoyaltyBrand | null;
  onSelect: (b: LoyaltyBrand) => void;
}) {
  const [query, setQuery] = useState('');
  const local = getBrandsForCountry(userCountry);
  const other = LOYALTY_BRANDS.filter((b) => !b.countries.includes(userCountry)).sort((a, b) => a.name.localeCompare(b.name));
  const all = [...local, ...other];
  const filtered = query ? all.filter((b) => b.name.toLowerCase().includes(query.toLowerCase())) : all;

  return (
    <View style={s.brandPicker}>
      <TextInput style={s.searchInput} placeholder="Search brands…" value={query} onChangeText={setQuery} autoCorrect={false} />
      <ScrollView style={s.brandList} nestedScrollEnabled>
        {filtered.map((brand) => (
          <TouchableOpacity key={brand.id} style={[s.brandRow, selected?.id === brand.id && s.brandRowSelected]} onPress={() => onSelect(brand)}>
            <Image source={{ uri: brand.logoUrl }} style={s.brandLogo} resizeMode="contain" />
            <Text style={s.brandName}>{brand.name}</Text>
          </TouchableOpacity>
        ))}
        {filtered.length === 0 && <Text style={s.emptyText}>No brands found</Text>}
      </ScrollView>
    </View>
  );
}

// ── Scan Modal ────────────────────────────────────────────────────────────────

function ScanModal({ onScanned, onClose }: { onScanned: (v: string) => void; onClose: () => void }) {
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
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['code128','ean13','ean8','qr','upc_a','upc_e','itf14','codabar','code39'] }}
            onBarcodeScanned={handleBarcode}
          />
        ) : <Text style={s.scanPermText}>Camera permission required</Text>}
        <View style={s.scanOverlay}>
          <View style={s.scanFrame} />
          <Text style={s.scanHint}>Align the barcode within the frame</Text>
          <TouchableOpacity style={s.scanClose} onPress={onClose}>
            <Text style={s.scanCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

function CardFormModal({ userCountry, initial, onSave, onClose }: {
  userCountry: string;
  initial?: LoyaltyCard;
  onSave: (d: { brandId: string; cardNumber: string; barcodeFormat: BarcodeFormat; notes: string }) => Promise<void>;
  onClose: () => void;
}) {
  const initBrand = initial ? getBrandById(initial.brandId) ?? null : null;
  const [brand, setBrand]           = useState<LoyaltyBrand | null>(initBrand);
  const [cardNumber, setCardNumber] = useState(initial?.cardNumber ?? '');
  const [format, setFormat]         = useState<BarcodeFormat>(initial?.barcodeFormat ?? 'CODE128');
  const [notes, setNotes]           = useState(initial?.notes ?? '');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const [showScan, setShowScan]     = useState(false);

  const handleBrandSelect = (b: LoyaltyBrand) => { setBrand(b); setFormat(b.barcodeFormat); };

  const handleSave = async () => {
    if (!brand) { setErr('Please select a brand'); return; }
    if (!cardNumber.trim()) { setErr('Card number is required'); return; }
    setSaving(true); setErr(null);
    try { await onSave({ brandId: brand.id, cardNumber: cardNumber.trim(), barcodeFormat: format, notes }); }
    catch { setErr('Failed to save. Please try again.'); setSaving(false); }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet">
      {showScan && <ScanModal onScanned={(v) => { setCardNumber(v); setShowScan(false); }} onClose={() => setShowScan(false)} />}
      <View style={s.formModal}>
        <View style={s.formHeader}>
          <Text style={s.formTitle}>{initial ? 'Edit Card' : 'Add Loyalty Card'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={s.formCloseBtn}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView style={s.formBody} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Brand</Text>
          <BrandPicker userCountry={userCountry} selected={brand} onSelect={handleBrandSelect} />

          <Text style={[s.label, { marginTop: 12 }]}>Card Number</Text>
          <View style={s.cardNumRow}>
            <TextInput style={[s.input, { flex: 1 }]} value={cardNumber} onChangeText={setCardNumber} placeholder="Enter or scan card number" keyboardType="number-pad" autoCorrect={false} autoCapitalize="none" />
            <TouchableOpacity style={s.scanBtn} onPress={() => setShowScan(true)}>
              <Text style={s.scanBtnText}>📷</Text>
            </TouchableOpacity>
          </View>

          <Text style={[s.label, { marginTop: 12 }]}>Barcode Format</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.formatScroll}>
            {BARCODE_FORMATS.map((f) => (
              <TouchableOpacity key={f} style={[s.formatChip, format === f && s.formatChipSelected]} onPress={() => setFormat(f)}>
                <Text style={[s.formatChipText, format === f && s.formatChipTextSelected]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[s.label, { marginTop: 12 }]}>Notes (optional)</Text>
          <TextInput style={s.input} value={notes} onChangeText={setNotes} placeholder="e.g. Mum's card" />

          {err && <Text style={s.errText}>{err}</Text>}
          <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={() => void handleSave()} disabled={saving}>
            <Text style={s.saveBtnText}>{saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Card'}</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Fullscreen Card View ──────────────────────────────────────────────────────

/**
 * Full-screen card view: brand info top half, barcode centred in the bottom half.
 */
function FullscreenCard({ card, onClose }: { card: LoyaltyCard; onClose: () => void }) {
  const brand = getBrandById(card.brandId);
  const barcodeW = SCREEN_W - 48;
  const barcodeH = card.barcodeFormat === 'QR' ? barcodeW : 100;
  return (
    <Modal animationType="fade" presentationStyle="fullScreen">
      <View style={s.fullscreen}>
        <View style={s.fullscreenTop}>
          <TouchableOpacity style={s.fullscreenClose} onPress={onClose}>
            <Text style={s.fullscreenCloseText}>✕</Text>
          </TouchableOpacity>
          {brand && <Image source={{ uri: brand.logoUrl }} style={s.fullscreenLogo} resizeMode="contain" />}
          <Text style={s.fullscreenBrand}>{brand?.name ?? card.brandId}</Text>
          {card.notes ? <Text style={s.fullscreenNotes}>{card.notes}</Text> : null}
        </View>
        <View style={s.fullscreenBottom}>
          <BarcodeSvg value={card.cardNumber} format={card.barcodeFormat} width={barcodeW} height={barcodeH} />
          <Text style={s.fullscreenCardNum}>{card.cardNumber}</Text>
        </View>
      </View>
    </Modal>
  );
}

// ── Card Row ──────────────────────────────────────────────────────────────────

function CardRow({ card, onTap, onEdit, onDelete }: {
  card: LoyaltyCard;
  onTap: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const brand = getBrandById(card.brandId);
  const confirmDelete = () =>
    Alert.alert('Delete Card', `Remove ${brand?.name ?? card.brandId} card?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);

  return (
    <TouchableOpacity style={s.cardRow} onPress={onTap} activeOpacity={0.85}>
      <View style={s.cardHeader}>
        <Image source={{ uri: brand?.logoUrl }} style={s.cardLogo} resizeMode="contain" />
        <View style={s.cardHeaderText}>
          <Text style={s.cardBrandName} numberOfLines={1}>{brand?.name ?? card.brandId}</Text>
          {card.notes ? <Text style={s.cardNotes} numberOfLines={1}>{card.notes}</Text> : null}
        </View>
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.actionIcon}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.actionIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>
      <View style={s.barcodeWrap}>
        <BarcodeSvg value={card.cardNumber} format={card.barcodeFormat} width={SCREEN_W - 64} height={card.barcodeFormat === 'QR' ? SCREEN_W - 64 : 72} />
      </View>
      <Text style={s.cardNumber}>{card.cardNumber}</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LoyaltyCardsScreen() {
  const user = useAuthStore((s) => s.user);
  const [cards, setCards]           = useState<LoyaltyCard[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [editing, setEditing]       = useState<LoyaltyCard | null>(null);
  const [fullscreen, setFullscreen] = useState<LoyaltyCard | null>(null);

  const fetchCards = useCallback(async () => {
    try {
      const { cards: c } = await api.getLoyaltyCards();
      setCards(c); setError(null);
    } catch {
      setError((prev) => prev ?? 'Unable to refresh — showing cached cards');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void fetchCards();
    return wsClient.on('loyaltyCards:changed', () => void fetchCards());
  }, [fetchCards]);

  const handleAdd = async (d: { brandId: string; cardNumber: string; barcodeFormat: BarcodeFormat; notes: string }) => {
    const { card } = await api.addLoyaltyCard({ brandId: d.brandId, cardNumber: d.cardNumber, barcodeFormat: d.barcodeFormat, notes: d.notes || undefined });
    setCards((prev) => [card, ...prev]); setShowAdd(false);
  };

  const handleEdit = async (d: { brandId: string; cardNumber: string; barcodeFormat: BarcodeFormat; notes: string }) => {
    if (!editing) return;
    const { card } = await api.updateLoyaltyCard(editing.id, { cardNumber: d.cardNumber, barcodeFormat: d.barcodeFormat, notes: d.notes || null });
    setCards((prev) => prev.map((c) => (c.id === card.id ? card : c))); setEditing(null);
  };

  const handleDelete = async (cardId: string) => {
    await api.deleteLoyaltyCard(cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const filtered = search
    ? cards.filter((c) => { const b = getBrandById(c.brandId); return b?.name.toLowerCase().includes(search.toLowerCase()) || c.cardNumber.toLowerCase().includes(search.toLowerCase()); })
    : cards;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TextInput style={s.headerSearch} placeholder="Search cards…" value={search} onChangeText={setSearch} autoCorrect={false} />
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : error && cards.length === 0 ? (
        <Text style={s.errorText}>{error}</Text>
      ) : filtered.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>💳</Text>
          <Text style={s.emptyMsg}>{search ? 'No cards match your search' : 'No loyalty cards yet — tap + Add to start!'}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CardRow card={item} onTap={() => setFullscreen(item)} onEdit={() => setEditing(item)} onDelete={() => void handleDelete(item.id)} />
          )}
          contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16, paddingTop: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}

      {showAdd && <CardFormModal userCountry={user?.country ?? 'AU'} onSave={handleAdd} onClose={() => setShowAdd(false)} />}
      {editing && <CardFormModal userCountry={user?.country ?? 'AU'} initial={editing} onSave={handleEdit} onClose={() => setEditing(null)} />}
      {fullscreen && <FullscreenCard card={fullscreen} onClose={() => setFullscreen(null)} />}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:              { flex: 1, backgroundColor: colors.background.canvas },
  header:                 { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.background.surface, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  headerSearch:           { flex: 1, backgroundColor: colors.neutral[100], borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, fontSize: typography.fontSize.md, color: colors.text.default },
  addBtn:                 { backgroundColor: colors.primary[400], borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  addBtnText:             { color: colors.text.inverse, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.md },
  cardRow:                { backgroundColor: colors.background.surface, borderRadius: borderRadius.xl, padding: spacing.base, ...shadows.sm },
  cardHeader:             { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  cardLogo:               { width: 32, height: 32, borderRadius: borderRadius.md },
  cardHeaderText:         { flex: 1 },
  cardBrandName:          { fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.md, color: colors.text.default },
  cardNotes:              { fontSize: typography.fontSize['2xs'], color: colors.text.subtle, marginTop: 1 },
  actionIcon:             { fontSize: typography.fontSize.base, marginLeft: spacing.xs },
  barcodeWrap:            { alignItems: 'center', backgroundColor: colors.background.surface, borderRadius: borderRadius.md, paddingVertical: spacing.xs },
  cardNumber:             { textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: typography.fontSize.sm, color: colors.text.muted, marginTop: spacing.xs, letterSpacing: 1 },
  barcodeFallback:        { backgroundColor: colors.neutral[100], alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.sm },
  barcodeFallbackText:    { fontSize: typography.fontSize.xs, color: colors.text.subtle, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  brandPicker:            { marginBottom: spacing.xs },
  searchInput:            { borderWidth: 1, borderColor: colors.border.soft, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, fontSize: typography.fontSize.md, marginBottom: spacing.sm, backgroundColor: colors.background.surface },
  brandList:              { maxHeight: 200, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: borderRadius.md },
  brandRow:               { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.background.canvas },
  brandRowSelected:       { backgroundColor: colors.primary[50] },
  brandLogo:              { width: 24, height: 24, borderRadius: borderRadius.xs },
  brandName:              { fontSize: typography.fontSize.md, color: colors.neutral[700], flex: 1 },
  emptyText:              { textAlign: 'center', color: colors.text.subtle, fontSize: typography.fontSize.sm, padding: spacing.base },
  formModal:              { flex: 1, backgroundColor: colors.background.canvas },
  formHeader:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.base, backgroundColor: colors.background.surface, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  formTitle:              { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.base, color: colors.text.default },
  formCloseBtn:           { fontSize: typography.fontSize.base, color: colors.text.muted, padding: spacing.xs },
  formBody:               { padding: spacing.base },
  label:                  { fontSize: typography.fontSize['2xs'], fontWeight: typography.fontWeight.semibold, color: colors.text.muted, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:                  { borderWidth: 1, borderColor: colors.border.soft, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.fontSize.md, backgroundColor: colors.background.surface },
  cardNumRow:             { flexDirection: 'row', gap: spacing.xs },
  scanBtn:                { backgroundColor: colors.neutral[100], borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, justifyContent: 'center' },
  scanBtnText:            { fontSize: typography.fontSize.base },
  formatScroll:           { marginBottom: spacing.xs },
  formatChip:             { borderWidth: 1, borderColor: colors.border.soft, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm, marginBottom: spacing.xs },
  formatChipSelected:     { borderColor: colors.primary[400], backgroundColor: colors.primary[50] },
  formatChipText:         { fontSize: typography.fontSize['2xs'], color: colors.text.muted },
  formatChipTextSelected: { color: colors.primary[600], fontWeight: typography.fontWeight.semibold },
  errText:                { color: colors.error.default, fontSize: typography.fontSize.sm, marginTop: spacing.xs },
  saveBtn:                { backgroundColor: colors.primary[400], borderRadius: borderRadius.lg, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText:            { color: colors.text.inverse, fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.md + 1 },
  scanContainer:          { flex: 1, backgroundColor: '#000' },
  scanPermText:           { color: colors.text.inverse, textAlign: 'center', marginTop: 200, fontSize: typography.fontSize.base },
  scanOverlay:            { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame:              { width: 260, height: 160, borderWidth: 2, borderColor: colors.primary[400], borderRadius: borderRadius.lg },
  scanHint:               { color: colors.text.inverse, marginTop: spacing.base, fontSize: typography.fontSize.md, textAlign: 'center' },
  scanClose:              { marginTop: spacing.xl, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  scanCloseText:          { color: colors.text.inverse, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.md + 1 },
  fullscreen:             { flex: 1, backgroundColor: colors.background.surface },
  fullscreenTop:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  fullscreenClose:        { position: 'absolute', top: Platform.OS === 'ios' ? 52 : spacing.base, right: spacing.base },
  fullscreenCloseText:    { fontSize: 22, color: colors.text.subtle },
  fullscreenLogo:         { width: 72, height: 72, borderRadius: borderRadius.xl, marginBottom: spacing.md },
  fullscreenBrand:        { fontWeight: typography.fontWeight.bold, fontSize: 22, color: colors.text.default, textAlign: 'center' },
  fullscreenNotes:        { fontSize: typography.fontSize.md, color: colors.text.subtle, marginTop: spacing.xs, textAlign: 'center' },
  fullscreenBottom:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  fullscreenCardNum:      { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: typography.fontSize.base, color: colors.neutral[700], letterSpacing: 2, marginTop: spacing.xs },
  emptyState:             { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon:              { fontSize: 48, marginBottom: spacing.md },
  emptyMsg:               { fontSize: typography.fontSize.md, color: colors.text.subtle, textAlign: 'center' },
  errorText:              { color: colors.error.default, textAlign: 'center', fontSize: typography.fontSize.md, marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
