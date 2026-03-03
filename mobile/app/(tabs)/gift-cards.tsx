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
import { GIFT_BRANDS, getGiftBrandsForCountry, getGiftBrandById } from '@sqirl/shared';
import type { GiftCard, GiftBrand, BarcodeFormat, CreateGiftCardPayload } from '@sqirl/shared';
import { useAuthStore } from '../../src/store/authStore';

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
    const id = setInterval(() => { void loadCards(); }, 30_000);
    return () => clearInterval(id);
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
        ? <ActivityIndicator style={{ flex: 1 }} color="#60a5fa" />
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
  screen:         { flex: 1, backgroundColor: '#f9fafb' },
  tabs:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tabBtn:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6' },
  tabBtnActive:   { backgroundColor: '#60a5fa' },
  tabTxt:         { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTxtActive:   { color: '#fff' },
  addBtn2:        { marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#60a5fa' },
  addBtn2Txt:     { fontSize: 13, fontWeight: '600', color: '#fff' },
  tile:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tileLogo:       { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f9fafb', marginRight: 12 },
  tileInfo:       { flex: 1 },
  tileBrand:      { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  tileNum:        { fontSize: 12, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 },
  tileExpiry:     { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  tileRight:      { alignItems: 'flex-end' },
  tileAmt:        { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  archTag:        { fontSize: 10, color: '#9ca3af', backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon:      { fontSize: 48 },
  emptyText:      { fontSize: 14, color: '#9ca3af' },
  // Modal
  modalContainer: { flex: 1, padding: 20, backgroundColor: '#fff' },
  modalTitle:     { fontSize: 20, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
  label:          { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 },
  input:          { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 14, color: '#1f2937' },
  row:            { flexDirection: 'row', gap: 8, marginBottom: 14 },
  scanBtn:        { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, alignItems: 'center', justifyContent: 'center' },
  fmtChip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8 },
  fmtChipSel:     { backgroundColor: '#60a5fa' },
  fmtChipText:    { fontSize: 12, color: '#6b7280' },
  fmtChipTextSel: { color: '#fff', fontWeight: '600' },
  modalBtns:      { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 40 },
  cancelBtn:      { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center' },
  cancelTxt:      { fontSize: 14, fontWeight: '500', color: '#374151' },
  addBtn:         { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#60a5fa', alignItems: 'center' },
  addTxt:         { fontSize: 14, fontWeight: '600', color: '#fff' },
  brandPicker:    { flex: 1 },
  searchInput:    { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 10 },
  brandList:      { maxHeight: 380 },
  brandRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  brandRowSel:    { backgroundColor: '#eff6ff' },
  brandLogo:      { width: 28, height: 28, borderRadius: 6 },
  brandName:      { fontSize: 14, color: '#1f2937' },
  brandHeader:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 16, gap: 10 },
  brandHeaderLogo:{ width: 36, height: 36, borderRadius: 8 },
  brandHeaderName:{ flex: 1, fontSize: 16, fontWeight: '600', color: '#1f2937' },
  changeBrand:    { fontSize: 13, color: '#60a5fa', textDecorationLine: 'underline' },
  // Scan
  scanContainer:  { flex: 1, backgroundColor: '#000' },
  scanPerm:       { color: '#fff', textAlign: 'center', marginTop: 100 },
  scanOverlay:    { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame:      { width: 260, height: 160, borderWidth: 2, borderColor: '#60a5fa', borderRadius: 12 },
  scanHint:       { color: '#fff', marginTop: 16, fontSize: 13 },
  scanCloseBtn:   { marginTop: 32, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  scanCloseTxt:   { color: '#fff', fontSize: 14, fontWeight: '600' },
});
