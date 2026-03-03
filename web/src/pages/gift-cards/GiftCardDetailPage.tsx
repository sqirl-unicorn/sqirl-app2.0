/**
 * GiftCardDetailPage — full detail view for a single gift card.
 *
 * Layout:
 *  - Top half: brand logo, card name, balance, expiry, masked/unmasked PIN
 *  - Centre of second half: barcode or QR code (JsBarcode / qrcode.react)
 *  - Below barcode: card number in monospace
 *  - Action buttons: Update Balance | Add Transaction | Archive | Edit | Delete
 *  - Transaction history list (reverse chronological)
 *
 * Modals:
 *  - Update Balance: new balance + optional note
 *  - Add Transaction: amount, date, optional location, optional description,
 *    optional "add as expense" checkbox (shown for spend amounts)
 *  - Edit Card: card number, PIN, expiry, notes, barcode format
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { getGiftBrandById } from '@sqirl/shared';
import type { GiftCard, GiftCardTransaction, BarcodeFormat, UpdateGiftCardBalancePayload, AddGiftCardTransactionPayload } from '@sqirl/shared';
import { useGiftCardsStore } from '../../store/giftCardsStore';

// ── Barcode display ───────────────────────────────────────────────────────────

interface BarcodeProps { value: string; format: BarcodeFormat; size?: number; }

function BarcodeDisplay({ value, format, size = 260 }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (format === 'QR' || !svgRef.current) return;
    try {
      setErr(false);
      JsBarcode(svgRef.current, value, {
        format: format === 'UPC_A' ? 'upc' : format === 'UPC_E' ? 'upce' : format.toLowerCase(),
        width: 2, height: 80, displayValue: false, margin: 4,
      });
    } catch { setErr(true); }
  }, [value, format]);

  if (err) return <p className="font-mono text-xs text-gray-400 text-center">{value}</p>;
  if (format === 'QR') return <QRCodeSVG value={value} size={size} level="M" />;
  return <svg ref={svgRef} style={{ width: size, height: 80 }} />;
}

// ── Update Balance Modal ──────────────────────────────────────────────────────

interface UpdateBalanceModalProps { card: GiftCard; onSave(card: GiftCard, txn: GiftCardTransaction): void; onClose(): void; }

function UpdateBalanceModal({ card, onSave, onClose }: UpdateBalanceModalProps) {
  const [newBalance, setNewBalance] = useState(String(Number(card.balance).toFixed(2)));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(newBalance);
    if (isNaN(n) || n < 0) { setError('Balance must be non-negative'); return; }
    setSaving(true);
    try {
      const payload: UpdateGiftCardBalancePayload = { newBalance: n };
      if (note.trim()) payload.note = note.trim();
      const { card: updated, transaction } = await api.updateGiftCardBalance(card.id, payload);
      onSave(updated, transaction);
    } catch { setError('Failed to update balance'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Update Balance</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New balance</label>
            <input
              type="number" min="0" step="0.01"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={newBalance} onChange={(e) => setNewBalance(e.target.value)} autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Correcting balance"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3">
            <button type="button" className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary-400 text-white text-sm font-medium hover:bg-primary-500 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Transaction Modal ─────────────────────────────────────────────────────

interface AddTransactionModalProps { card: GiftCard; onSave(card: GiftCard, txn: GiftCardTransaction, expenseId?: string): void; onClose(): void; }

function AddTransactionModal({ card, onSave, onClose }: AddTransactionModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [addAsExpense, setAddAsExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amountNum = Number(amount);
  const isSpend = amountNum < 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isNaN(amountNum) || amountNum === 0) { setError('Amount must be non-zero'); return; }
    if (!date) { setError('Date is required'); return; }
    setSaving(true);
    try {
      const payload: AddGiftCardTransactionPayload = {
        amount: amountNum,
        transactionDate: new Date(date).toISOString(),
        addAsExpense: isSpend && addAsExpense,
      };
      if (location.trim()) payload.location = location.trim();
      if (description.trim()) payload.description = description.trim();
      const { card: updated, transaction, expenseId } = await api.addGiftCardTransaction(card.id, payload);
      onSave(updated, transaction, expenseId);
    } catch { setError('Failed to record transaction'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Transaction</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (negative = spend)</label>
            <input
              type="number" step="0.01"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-10.00" autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={date} onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. CBD Store"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Bought headphones"
            />
          </div>
          {isSpend && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={addAsExpense}
                onChange={(e) => setAddAsExpense(e.target.checked)}
                className="rounded"
              />
              Add as personal expense
            </label>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3">
            <button type="button" className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary-400 text-white text-sm font-medium hover:bg-primary-500 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────

function TxnRow({ txn }: { txn: GiftCardTransaction }) {
  const sign = txn.type === 'spend' ? '-' : txn.type === 'reload' ? '+' : '±';
  const color = txn.type === 'spend' ? 'text-red-500' : txn.type === 'reload' ? 'text-green-600' : 'text-gray-600';
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-700 capitalize">{txn.type.replace('_', ' ')}</p>
        {txn.description && <p className="text-xs text-gray-400">{txn.description}</p>}
        {txn.location && <p className="text-xs text-gray-400">{txn.location}</p>}
        <p className="text-xs text-gray-300 mt-0.5">
          {new Date(txn.transactionDate).toLocaleDateString()}
          {txn.expenseId && ' · Added as expense'}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${color}`}>
          {sign}${Math.abs(Number(txn.amount)).toFixed(2)}
        </p>
        <p className="text-xs text-gray-400">${Number(txn.balanceAfter).toFixed(2)}</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Gift card detail page.
 * Upper half: card info (logo, balance, expiry, PIN).
 * Lower half centre: barcode/QR.
 * Below: transaction history.
 */
export default function GiftCardDetailPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const { cards, setCards, transactions, setTransactions } = useGiftCardsStore();

  const [card, setCard] = useState<GiftCard | null>(() => cards.find((c) => c.id === cardId) ?? null);
  const [pinVisible, setPinVisible] = useState(false);
  const [modal, setModal] = useState<'balance' | 'transaction' | null>(null);
  const [loading, setLoading] = useState(!card);
  const [error, setError] = useState('');

  const loadCard = useCallback(async () => {
    if (!cardId) return;
    try {
      const { cards: all } = await api.getGiftCards();
      setCards(all);
      const found = all.find((c) => c.id === cardId) ?? null;
      setCard(found);
    } catch { setError('Failed to load card'); }
    finally { setLoading(false); }
  }, [cardId, setCards]);

  const loadTransactions = useCallback(async () => {
    if (!cardId) return;
    try {
      const { transactions: txns } = await api.getGiftCardTransactions(cardId);
      setTransactions(txns);
    } catch { /* non-fatal */ }
  }, [cardId, setTransactions]);

  useEffect(() => {
    if (!card) void loadCard();
    else setLoading(false);
    void loadTransactions();
  }, [card, loadCard, loadTransactions]);

  async function handleArchive() {
    if (!card) return;
    if (!confirm('Archive this gift card?')) return;
    try {
      const { card: updated } = await api.archiveGiftCard(card.id);
      setCard(updated);
      setCards(cards.map((c) => c.id === updated.id ? updated : c));
    } catch { alert('Failed to archive card'); }
  }

  async function handleDelete() {
    if (!card) return;
    if (!confirm('Delete this gift card? This cannot be undone.')) return;
    try {
      await api.deleteGiftCard(card.id);
      setCards(cards.filter((c) => c.id !== card.id));
      navigate('/gift-cards');
    } catch { alert('Failed to delete card'); }
  }

  function handleBalanceSaved(updated: GiftCard, txn: GiftCardTransaction) {
    setCard(updated);
    setCards(cards.map((c) => c.id === updated.id ? updated : c));
    setTransactions([txn, ...transactions]);
    setModal(null);
  }

  function handleTransactionSaved(updated: GiftCard, txn: GiftCardTransaction) {
    setCard(updated);
    setCards(cards.map((c) => c.id === updated.id ? updated : c));
    setTransactions([txn, ...transactions]);
    setModal(null);
  }

  const brand = card ? getGiftBrandById(card.brandId) : null;

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>;
  if (error || !card) return (
    <div className="p-8 text-center">
      <p className="text-red-500 mb-4">{error || 'Gift card not found'}</p>
      <button className="text-primary-500 underline text-sm" onClick={() => navigate('/gift-cards')}>Back to Gift Cards</button>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Back */}
      <button className="text-sm text-primary-500 mb-4 flex items-center gap-1" onClick={() => navigate('/gift-cards')}>
        ← Gift Cards
      </button>

      {/* ── Top half: card info ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-4 mb-5">
          <img
            src={brand?.logoUrl ?? `https://www.google.com/s2/favicons?domain=${card.brandId}&sz=64`}
            alt={brand?.name ?? card.brandId}
            className="w-16 h-16 rounded-2xl object-contain bg-gray-50 p-2"
          />
          <div>
            <h1 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Playfair Display, serif' }}>
              {brand?.name ?? card.brandId}
            </h1>
            {card.isArchived && (
              <span className="inline-block text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mt-1">Archived</span>
            )}
          </div>
        </div>

        {/* Balance */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-bold text-gray-800">${Number(card.balance).toFixed(2)}</span>
          <span className="text-gray-400 text-sm">balance</span>
        </div>

        {/* Expiry + PIN row */}
        <div className="flex gap-6">
          {card.expiryDate && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Expires</p>
              <p className="text-sm font-medium text-gray-700">{card.expiryDate}</p>
            </div>
          )}
          {card.pin && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">PIN</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-700 font-mono">
                  {pinVisible ? card.pin : '••••'}
                </p>
                <button
                  aria-label={pinVisible ? 'Hide PIN' : 'Show PIN'}
                  className="text-gray-400 hover:text-gray-600 text-base"
                  onClick={() => setPinVisible((v) => !v)}
                >
                  {pinVisible ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Second half: barcode centred ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-8 px-6 mb-4 flex flex-col items-center">
        <BarcodeDisplay value={card.cardNumber} format={card.barcodeFormat} size={260} />
        <p className="font-mono text-sm text-gray-500 mt-3 tracking-widest">{card.cardNumber}</p>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          className="py-3 rounded-xl bg-primary-400 text-white text-sm font-medium hover:bg-primary-500"
          onClick={() => setModal('balance')}
        >
          Update Balance
        </button>
        <button
          className="py-3 rounded-xl bg-white border border-primary-400 text-primary-500 text-sm font-medium hover:bg-primary-50"
          onClick={() => setModal('transaction')}
        >
          Add Transaction
        </button>
        <button
          className="py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
          onClick={() => void handleArchive()}
          disabled={card.isArchived}
        >
          {card.isArchived ? 'Archived' : 'Archive'}
        </button>
        <button
          className="py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50"
          onClick={() => void handleDelete()}
        >
          Delete
        </button>
      </div>

      {/* ── Transaction history ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-700 mb-3">Transaction History</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400">No transactions yet.</p>
        ) : (
          <div>
            {transactions.map((txn) => <TxnRow key={txn.id} txn={txn} />)}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'balance' && (
        <UpdateBalanceModal card={card} onSave={handleBalanceSaved} onClose={() => setModal(null)} />
      )}
      {modal === 'transaction' && (
        <AddTransactionModal card={card} onSave={handleTransactionSaved} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
