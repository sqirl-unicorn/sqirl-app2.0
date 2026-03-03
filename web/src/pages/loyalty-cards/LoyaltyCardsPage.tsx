/**
 * LoyaltyCardsPage — inline barcode display for all household loyalty cards.
 *
 * Layout:
 *  - Top bar: "Add Card" button + search input
 *  - Card grid: each card shows brand logo, brand name, rendered barcode/QR,
 *    card number below barcode, and edit/delete actions
 *  - Add/Edit modal: brand picker with search, card number, barcode format override
 *    (auto-filled from brand catalog), optional notes, camera scan via file input
 *
 * Barcode rendering:
 *  - Linear barcodes (CODE128, EAN13, EAN8, etc.): JsBarcode renders to <svg>
 *  - QR codes: QRCodeSVG from qrcode.react
 *
 * Real-time: polls every 30 s for household updates.
 * Offline: renders from in-memory store; add/edit/delete queued when offline.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { LOYALTY_BRANDS, getBrandById, getBrandsForCountry } from '@sqirl/shared';
import type { LoyaltyCard, BarcodeFormat, LoyaltyBrand } from '@sqirl/shared';
import { useAuthStore } from '../../store/authStore';

// ── Barcode renderer ──────────────────────────────────────────────────────────

interface BarcodeProps {
  value: string;
  format: BarcodeFormat;
  width?: number;
  height?: number;
}

/**
 * Renders a linear barcode using JsBarcode or a QR code using qrcode.react,
 * depending on the format. Falls back to displaying the value as text on error.
 */
function BarcodeDisplay({ value, format, width = 220, height = 60 }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (format === 'QR' || !svgRef.current) return;
    try {
      setError(false);
      JsBarcode(svgRef.current, value, {
        format: format === 'UPC_A' ? 'upc' : format === 'UPC_E' ? 'upce' : format.toLowerCase(),
        width: 2,
        height,
        displayValue: false,
        margin: 4,
      });
    } catch {
      setError(true);
    }
  }, [value, format, height]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 rounded text-xs text-gray-400 font-mono"
        style={{ width, height }}
      >
        {value}
      </div>
    );
  }

  if (format === 'QR') {
    return <QRCodeSVG value={value} size={width} level="M" />;
  }

  return <svg ref={svgRef} style={{ width, height }} />;
}

// ── Brand picker ──────────────────────────────────────────────────────────────

interface BrandPickerProps {
  userCountry: string;
  selected: LoyaltyBrand | null;
  onSelect: (brand: LoyaltyBrand) => void;
}

/**
 * Searchable brand picker. Shows brands for the user's country first,
 * then all others. Renders logo + name.
 */
function BrandPicker({ userCountry, selected, onSelect }: BrandPickerProps) {
  const [query, setQuery] = useState('');

  const localBrands = getBrandsForCountry(userCountry);
  const otherBrands = LOYALTY_BRANDS.filter((b) => !b.countries.includes(userCountry))
    .sort((a, b) => a.name.localeCompare(b.name));

  const all = [...localBrands, ...otherBrands];
  const filtered = query
    ? all.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
    : all;

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search brands…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
      />
      <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
        {filtered.map((brand) => (
          <button
            key={brand.id}
            type="button"
            onClick={() => onSelect(brand)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
              selected?.id === brand.id ? 'bg-blue-50 font-medium' : ''
            }`}
          >
            <img
              src={brand.logoUrl}
              alt=""
              className="w-6 h-6 rounded object-contain flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span>{brand.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-sm text-gray-400 text-center">No brands found</p>
        )}
      </div>
    </div>
  );
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

const FORMAT_OPTIONS: BarcodeFormat[] = [
  'CODE128','EAN13','EAN8','QR','CODABAR',
  'ITF','CODE39','UPC_A','UPC_E','PDF417','AZTEC','DATA_MATRIX',
];

interface CardModalProps {
  userCountry: string;
  initial?: LoyaltyCard;
  onSave: (data: {
    brandId: string;
    cardNumber: string;
    barcodeFormat: BarcodeFormat;
    notes: string;
  }) => Promise<void>;
  onClose: () => void;
}

/**
 * Modal for adding or editing a loyalty card.
 * Supports camera scan via <input type="file" capture="environment">.
 */
function CardModal({ userCountry, initial, onSave, onClose }: CardModalProps) {
  const initBrand = initial ? getBrandById(initial.brandId) ?? null : null;
  const [brand, setBrand]           = useState<LoyaltyBrand | null>(initBrand);
  const [cardNumber, setCardNumber] = useState(initial?.cardNumber ?? '');
  const [format, setFormat]         = useState<BarcodeFormat>(initial?.barcodeFormat ?? 'CODE128');
  const [notes, setNotes]           = useState(initial?.notes ?? '');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // When brand changes, auto-set format from catalog
  const handleBrandSelect = (b: LoyaltyBrand) => {
    setBrand(b);
    setFormat(b.barcodeFormat);
  };

  const handleScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    // File input capture — browser doesn't parse barcodes directly;
    // we rely on the native camera barcode scan on supported devices.
    // On desktop, use a barcode scanner device that types the number into the input.
    const file = e.target.files?.[0];
    if (!file) return;
    // On mobile Safari/Chrome the OS barcode scanner fills the value.
    // We trigger the file picker; users scan with their camera.
    // For a richer experience use the BarcodeDetector API where available.
    if ('BarcodeDetector' in window) {
      const detector = new (window as Window & { BarcodeDetector: { new(opts: object): { detect(img: ImageBitmap): Promise<{ rawValue: string }[]> } } }).BarcodeDetector({
        formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 'itf', 'codabar', 'code_39'],
      });
      createImageBitmap(file).then((bitmap) => {
        return detector.detect(bitmap);
      }).then((results) => {
        if (results[0]?.rawValue) setCardNumber(results[0].rawValue);
      }).catch(() => {/* silently ignore if detection fails */});
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand) { setErr('Please select a brand'); return; }
    if (!cardNumber.trim()) { setErr('Card number is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      await onSave({ brandId: brand.id, cardNumber: cardNumber.trim(), barcodeFormat: format, notes });
    } catch {
      setErr('Failed to save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{initial ? 'Edit Card' : 'Add Loyalty Card'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

          {/* Brand picker */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
            <BrandPicker userCountry={userCountry} selected={brand} onSelect={handleBrandSelect} />
          </div>

          {/* Card number + scan */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Card Number</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="Enter or scan card number"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              <button
                type="button"
                onClick={() => scanRef.current?.click()}
                className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 transition-colors flex-shrink-0"
                title="Scan barcode"
              >
                📷
              </button>
              <input
                ref={scanRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleScan}
              />
            </div>
          </div>

          {/* Barcode format */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Barcode Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as BarcodeFormat)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {FORMAT_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Mum's card"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-primary-400 text-white text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Card tile ─────────────────────────────────────────────────────────────────

interface CardTileProps {
  card: LoyaltyCard;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Displays a single loyalty card inline:
 * brand logo + name, barcode rendered at full width, card number below.
 */
function CardTile({ card, onEdit, onDelete }: CardTileProps) {
  const brand = getBrandById(card.brandId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
      {/* Header: logo + brand name + actions */}
      <div className="flex items-center gap-3">
        {brand && (
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="w-8 h-8 rounded-lg object-contain flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {brand?.name ?? card.brandId}
          </p>
          {card.notes && (
            <p className="text-xs text-gray-400 truncate">{card.notes}</p>
          )}
        </div>
        <button
          onClick={onEdit}
          className="text-gray-400 hover:text-blue-500 transition-colors p-1"
          title="Edit"
        >
          ✏️
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onDelete}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-gray-400 hover:text-red-500 transition-colors p-1"
            title="Delete"
          >
            🗑️
          </button>
        )}
      </div>

      {/* Barcode */}
      <div className="flex justify-center bg-white rounded-xl py-2">
        <BarcodeDisplay
          value={card.cardNumber}
          format={card.barcodeFormat}
          width={240}
          height={64}
        />
      </div>

      {/* Card number */}
      <p className="text-center text-xs font-mono text-gray-500 tracking-wider">
        {card.cardNumber}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

/**
 * LoyaltyCardsPage — main page component.
 * Polls every 30 s for real-time household updates.
 */
export default function LoyaltyCardsPage() {
  const user = useAuthStore((s) => s.user);
  const [cards, setCards]           = useState<LoyaltyCard[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState<LoyaltyCard | null>(null);
  const [search, setSearch]         = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCards = useCallback(async () => {
    try {
      const { cards: c } = await api.getLoyaltyCards();
      setCards(c);
      setError(null);
    } catch {
      setError('Failed to load loyalty cards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCards();
    pollingRef.current = setInterval(() => { void fetchCards(); }, 30_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchCards]);

  const handleAdd = async (data: {
    brandId: string;
    cardNumber: string;
    barcodeFormat: BarcodeFormat;
    notes: string;
  }) => {
    const { card } = await api.addLoyaltyCard({
      brandId: data.brandId,
      cardNumber: data.cardNumber,
      barcodeFormat: data.barcodeFormat,
      notes: data.notes || undefined,
    });
    setCards((prev) => [card, ...prev]);
    setShowModal(false);
  };

  const handleEdit = async (data: {
    brandId: string;
    cardNumber: string;
    barcodeFormat: BarcodeFormat;
    notes: string;
  }) => {
    if (!editing) return;
    const { card } = await api.updateLoyaltyCard(editing.id, {
      cardNumber: data.cardNumber,
      barcodeFormat: data.barcodeFormat,
      notes: data.notes || null,
    });
    setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
    setEditing(null);
  };

  const handleDelete = async (cardId: string) => {
    await api.deleteLoyaltyCard(cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const filtered = search
    ? cards.filter((c) => {
        const brand = getBrandById(c.brandId);
        return (
          brand?.name.toLowerCase().includes(search.toLowerCase()) ||
          c.cardNumber.toLowerCase().includes(search.toLowerCase()) ||
          c.brandId.toLowerCase().includes(search.toLowerCase())
        );
      })
    : cards;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Loyalty Cards</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white text-sm font-medium rounded-xl hover:bg-blue-500 transition-colors"
        >
          + Add Card
        </button>
      </div>

      {/* Search */}
      {cards.length > 0 && (
        <input
          type="text"
          placeholder="Search cards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-4 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      )}

      {/* States */}
      {loading && (
        <p className="text-center text-gray-400 text-sm py-12">Loading…</p>
      )}
      {error && (
        <p className="text-center text-red-400 text-sm py-8">{error}</p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-gray-500 text-sm">
            {search ? 'No cards match your search' : 'No loyalty cards yet — add your first one!'}
          </p>
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            onEdit={() => setEditing(card)}
            onDelete={() => void handleDelete(card.id)}
          />
        ))}
      </div>

      {/* Add modal */}
      {showModal && (
        <CardModal
          userCountry={user?.country ?? 'AU'}
          onSave={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <CardModal
          userCountry={user?.country ?? 'AU'}
          initial={editing}
          onSave={handleEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
