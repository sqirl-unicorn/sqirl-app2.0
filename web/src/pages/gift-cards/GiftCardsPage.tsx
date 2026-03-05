/**
 * GiftCardsPage — household gift card list with active/archived tabs.
 *
 * Layout:
 *  - Header: "Gift Cards" heading + "Add Card" button
 *  - Tabs: Active | Archived
 *  - Card grid: each card shows brand logo, brand name, balance, expiry
 *  - Click card → navigates to /gift-cards/:cardId
 *  - Add modal: brand picker with search, card number (with camera scan),
 *    balance, optional PIN (required per brand rules), optional expiry
 *
 * Real-time: polls every 30 s for household updates.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { GIFT_BRANDS, getGiftBrandsForCountry, getGiftBrandById } from '@sqirl/shared';
import type { GiftCard, GiftBrand, BarcodeFormat, CreateGiftCardPayload } from '@sqirl/shared';
import { useAuthStore } from '../../store/authStore';
import { useGiftCardsStore } from '../../store/giftCardsStore';
import * as wsClient from '../../lib/wsClient';
import { analytics } from '../../lib/analyticsService';

// ── Brand Picker ──────────────────────────────────────────────────────────────

interface BrandPickerProps {
  onSelect(brand: GiftBrand): void;
  userCountry: string;
}

function BrandPicker({ onSelect, userCountry }: BrandPickerProps) {
  const [query, setQuery] = useState('');
  const regional = getGiftBrandsForCountry(userCountry);
  const all = GIFT_BRANDS;
  const pool = query ? all : regional;
  const filtered = pool.filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
        placeholder="Search brands…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="max-h-56 overflow-y-auto divide-y">
        {filtered.map((b) => (
          <button
            key={b.id}
            type="button"
            className="flex items-center gap-3 w-full px-2 py-2 text-left hover:bg-gray-50 text-sm"
            onClick={() => onSelect(b)}
          >
            <img src={b.logoUrl} alt={b.name} className="w-6 h-6 rounded object-contain" />
            <span>{b.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-sm text-gray-400">No brands match "{query}"</p>
        )}
      </div>
    </div>
  );
}

// ── Add Card Modal ────────────────────────────────────────────────────────────

interface AddCardModalProps {
  userCountry: string;
  onClose(): void;
  onAdded(card: GiftCard): void;
}

function AddCardModal({ userCountry, onClose, onAdded }: AddCardModalProps) {
  const [brand, setBrand] = useState<GiftBrand | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [balance, setBalance] = useState('');
  const [pin, setPin] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>('CODE128');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Auto-fill barcode format from brand catalog on brand selection. */
  function handleSelectBrand(b: GiftBrand) {
    setBrand(b);
    setBarcodeFormat(b.barcodeFormat);
  }

  /** Camera/file scan: read barcode via BarcodeDetector API or fall back to value text. */
  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      if ('BarcodeDetector' in window) {
        const detector = new (window as unknown as { BarcodeDetector: new (opts: object) => { detect(img: HTMLImageElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'code_39', 'itf', 'upc_a', 'upc_e'] });
        const img = new Image();
        img.src = url;
        await new Promise((r) => { img.onload = r; });
        const results = await detector.detect(img);
        if (results[0]) setCardNumber(results[0].rawValue);
      }
    } catch {
      // BarcodeDetector not available or failed — user types manually
    } finally {
      URL.revokeObjectURL(url);
    }
    e.target.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brand) { setError('Please select a brand'); return; }
    if (!cardNumber.trim()) { setError('Card number is required'); return; }
    const balanceNum = Number(balance);
    if (isNaN(balanceNum) || balanceNum < 0) { setError('Balance must be a non-negative number'); return; }
    if (brand.requiresPin && !pin.trim()) { setError(`PIN is required for ${brand.name} gift cards`); return; }

    setSaving(true);
    setError('');
    try {
      const payload: CreateGiftCardPayload = {
        brandId: brand.id,
        cardNumber: cardNumber.trim(),
        barcodeFormat,
        balance: balanceNum,
        clientId: crypto.randomUUID(),
      };
      if (pin.trim()) payload.pin = pin.trim();
      if (expiryDate) payload.expiryDate = expiryDate;
      if (notes.trim()) payload.notes = notes.trim();

      const { card } = await api.addGiftCard(payload);
      analytics.track('gift_card.added', {
        brandId: brand.id,
        balance: balanceNum,
        hasPin: !!pin.trim(),
        hasExpiry: !!expiryDate,
        barcodeFormat,
      });
      onAdded(card);
    } catch {
      setError('Failed to add gift card. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Gift Card</h2>

          {!brand ? (
            <BrandPicker userCountry={userCountry} onSelect={handleSelectBrand} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Selected brand header */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <img src={brand.logoUrl} alt={brand.name} className="w-8 h-8 rounded object-contain" />
                <span className="font-medium text-gray-800">{brand.name}</span>
                <button
                  type="button"
                  className="ml-auto text-xs text-primary-500 underline"
                  onClick={() => setBrand(null)}
                >
                  Change
                </button>
              </div>

              {/* Card number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Card number</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="Card number…"
                    required
                  />
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50"
                    title="Scan barcode"
                    onClick={() => fileRef.current?.click()}
                  >
                    📷
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScan} />
                </div>
              </div>

              {/* Opening balance */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening balance</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              {/* PIN — required only for brands that need it */}
              {brand.requiresPin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PIN <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="PIN…"
                    inputMode="numeric"
                  />
                </div>
              )}

              {/* Expiry — optional unless brand requires it */}
              {(brand.requiresExpiry) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry date {brand.requiresExpiry && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              )}

              {/* Barcode format override */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Barcode format</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  value={barcodeFormat}
                  onChange={(e) => setBarcodeFormat(e.target.value as BarcodeFormat)}
                >
                  {(['CODE128','EAN13','EAN8','QR','CODABAR','ITF','CODE39','UPC_A','UPC_E','PDF417','AZTEC','DATA_MATRIX'] as BarcodeFormat[]).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              {/* Notes (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Birthday gift"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-primary-400 text-white text-sm font-medium hover:bg-primary-500 disabled:opacity-50"
                >
                  {saving ? 'Adding…' : 'Add Gift Card'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Card tile ─────────────────────────────────────────────────────────────────

interface CardTileProps {
  card: GiftCard;
  onClick(): void;
}

function CardTile({ card, onClick }: CardTileProps) {
  const brand = getGiftBrandById(card.brandId);
  return (
    <button
      className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left w-full"
      onClick={onClick}
    >
      <img
        src={brand?.logoUrl ?? `https://www.google.com/s2/favicons?domain=${card.brandId}&sz=64`}
        alt={brand?.name ?? card.brandId}
        className="w-12 h-12 rounded-xl object-contain bg-gray-50 p-1 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 truncate">{brand?.name ?? card.brandId}</p>
        <p className="text-sm text-gray-500 font-mono truncate">{card.cardNumber}</p>
        {card.expiryDate && (
          <p className="text-xs text-gray-400 mt-0.5">Expires {card.expiryDate}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-lg font-bold text-gray-800">
          ${Number(card.balance).toFixed(2)}
        </p>
        {card.isArchived && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Archived</span>
        )}
      </div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Gift cards list page. Active and archived tabs, 30 s poll, add card modal.
 */
export default function GiftCardsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { cards, setCards, loading, setLoading, error, setError } = useGiftCardsStore();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [showAdd, setShowAdd] = useState(false);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { cards: fetched } = await api.getGiftCards();
      setCards(fetched);
    } catch {
      setError('Failed to load gift cards');
    } finally {
      setLoading(false);
    }
  }, [setCards, setLoading, setError]);

  useEffect(() => {
    void loadCards();
    return wsClient.on('giftCards:changed', () => void loadCards());
  }, [loadCards]);

  const active   = cards.filter((c) => !c.isDeleted && !c.isArchived);
  const archived = cards.filter((c) => !c.isDeleted &&  c.isArchived);
  const visible  = tab === 'active' ? active : archived;

  function handleAdded(card: GiftCard) {
    setCards([card, ...cards]);
    setShowAdd(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Playfair Display, serif' }}>
          Gift Cards
        </h1>
        <button
          className="px-4 py-2 rounded-xl bg-primary-400 text-white text-sm font-medium hover:bg-primary-500"
          onClick={() => setShowAdd(true)}
        >
          Add Card
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['active', 'archived'] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-primary-400 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'active' ? 'Active' : 'Archived'}{' '}
            <span className="opacity-70">({t === 'active' ? active.length : archived.length})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && cards.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center">Loading gift cards…</p>
      ) : error ? (
        <p className="text-red-500 text-sm py-8 text-center">{error}</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🎁</p>
          <p className="text-sm">
            {tab === 'active' ? 'No active gift cards yet.' : 'No archived gift cards.'}
          </p>
          {tab === 'active' && (
            <button
              className="mt-3 text-primary-500 text-sm underline"
              onClick={() => setShowAdd(true)}
            >
              Add your first card
            </button>
          )}
        </div>
      ) : (
        <div data-testid={`${tab}-cards`} className="flex flex-col gap-3">
          {visible.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              onClick={() => navigate(`/gift-cards/${card.id}`)}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddCardModal
          userCountry={user?.country ?? 'AU'}
          onClose={() => setShowAdd(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
