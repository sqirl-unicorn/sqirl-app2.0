/**
 * ListDetailPage — detail view for General and Grocery lists.
 *
 * Two sections:
 *   1. Unpurchased items — can be edited, marked purchased, or deleted
 *   2. Purchased items   — struck-through; can be un-purchased or deleted
 *
 * Supports:
 *  - Add item inline (description required; pack size, unit, quantity optional)
 *  - Camera scan: upload an image and the API parses item descriptions from it
 *  - Move item to another list of the same type
 *  - Poll every 30 s for household real-time updates
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useListsStore } from '../../store/listsStore';
import type { ListItem, ShoppingList } from '@sqirl/shared';

interface ItemFormState {
  description: string;
  packSize: string;
  unit: string;
  quantity: string;
}

const EMPTY_FORM: ItemFormState = { description: '', packSize: '', unit: '', quantity: '' };

export default function ListDetailPage() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { lists, items, setItems, setError } = useListsStore();

  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingItem, setAddingItem] = useState(false);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemFormState>(EMPTY_FORM);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchItems = useCallback(async () => {
    if (!listId) return;
    try {
      const { items: its } = await api.getListItems(listId);
      setItems(its);
    } catch {
      setError('Failed to load items');
    }
  }, [listId, setItems, setError]);

  useEffect(() => {
    if (!listId) return;
    // Find list from store or fetch
    const found = lists.find((l) => l.id === listId) ?? null;
    setList(found);
    setLoading(true);
    void fetchItems().finally(() => setLoading(false));

    pollingRef.current = setInterval(() => void fetchItems(), 30_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [listId, lists, fetchItems]);

  const unpurchased = items.filter((i) => !i.isPurchased && !i.isDeleted);
  const purchased   = items.filter((i) => i.isPurchased && !i.isDeleted);
  const sameLists   = lists.filter((l) => l.listType === list?.listType && l.id !== listId && !l.isDeleted);

  async function handleAddItem() {
    if (!listId || !form.description.trim()) return;
    try {
      setActionLoading('add');
      const { item } = await api.addListItem(listId, {
        description: form.description.trim(),
        packSize: form.packSize || undefined,
        unit: form.unit || undefined,
        quantity: form.quantity ? Number(form.quantity) : undefined,
      });
      setItems([...items, item]);
      setForm(EMPTY_FORM);
      setAddingItem(false);
    } catch {
      setError('Failed to add item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTogglePurchased(item: ListItem) {
    if (!listId) return;
    try {
      setActionLoading(item.id);
      const { item: updated } = await api.updateListItem(listId, item.id, { isPurchased: !item.isPurchased });
      setItems(items.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      setError('Failed to update item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveEdit(item: ListItem) {
    if (!listId || !editForm.description.trim()) return;
    try {
      setActionLoading(item.id);
      const { item: updated } = await api.updateListItem(listId, item.id, {
        description: editForm.description.trim(),
        packSize: editForm.packSize || null,
        unit: editForm.unit || null,
        quantity: editForm.quantity ? Number(editForm.quantity) : null,
      });
      setItems(items.map((i) => (i.id === updated.id ? updated : i)));
      setEditingId(null);
    } catch {
      setError('Failed to update item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!listId) return;
    try {
      setActionLoading(itemId);
      await api.deleteListItem(listId, itemId);
      setItems(items.filter((i) => i.id !== itemId));
    } catch {
      setError('Failed to delete item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMoveItem(itemId: string, targetListId: string) {
    try {
      setActionLoading(itemId);
      await api.moveListItem(itemId, targetListId);
      setItems(items.filter((i) => i.id !== itemId));
      setMovingItemId(null);
    } catch {
      setError('Failed to move item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleScanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !listId) return;
    try {
      setScanning(true);
      const fd = new FormData();
      fd.append('image', file);
      const { items: parsed } = await api.scanList(fd);
      if (parsed.length === 0) {
        setError('No items detected in image');
        return;
      }
      // Add all parsed items sequentially
      const added: ListItem[] = [];
      for (const desc of parsed) {
        const { item } = await api.addListItem(listId, { description: desc });
        added.push(item);
      }
      setItems([...items, ...added]);
    } catch {
      setError('Scan failed — please try again');
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!list) return <div className="p-8 text-gray-400">List not found</div>;

  const renderItem = (item: ListItem, section: 'unpurchased' | 'purchased') => (
    <li
      key={item.id}
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        section === 'purchased' ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'
      }`}
    >
      {/* Purchase checkbox */}
      <button
        title={item.isPurchased ? 'Mark unpurchased' : 'Mark purchased'}
        disabled={actionLoading === item.id}
        onClick={() => void handleTogglePurchased(item)}
        className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          item.isPurchased
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 hover:border-primary-400'
        }`}
      >
        {item.isPurchased && <span className="text-xs">✓</span>}
      </button>

      {/* Content */}
      {editingId === item.id ? (
        <div className="flex-1 space-y-2">
          <input
            autoFocus
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            placeholder="Description *"
            className="w-full px-2 py-1 border border-primary-400 rounded text-sm focus:outline-none"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={editForm.packSize}
              onChange={(e) => setEditForm({ ...editForm, packSize: e.target.value })}
              placeholder="Pack size"
              className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none"
            />
            <input
              value={editForm.unit}
              onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
              placeholder="Unit"
              className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none"
            />
            <input
              type="number"
              value={editForm.quantity}
              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              placeholder="Qty"
              className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleSaveEdit(item)}
              disabled={actionLoading === item.id}
              className="px-3 py-1 bg-primary-400 text-white rounded text-xs font-medium"
            >
              Save
            </button>
            <button onClick={() => setEditingId(null)} className="px-3 py-1 text-gray-500 text-xs">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={`flex-1 min-w-0 ${section === 'purchased' ? 'line-through text-gray-400' : ''}`}>
          <p className="text-sm font-medium text-gray-800 truncate">{item.description}</p>
          {(item.packSize || item.unit || item.quantity !== null) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {[item.quantity !== null ? item.quantity : null, item.unit, item.packSize]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {editingId !== item.id && (
        <div className="flex gap-1 shrink-0">
          <button
            title="Edit"
            onClick={() => { setEditingId(item.id); setEditForm({ description: item.description, packSize: item.packSize ?? '', unit: item.unit ?? '', quantity: item.quantity !== null ? String(item.quantity) : '' }); }}
            className="p-1 text-gray-300 hover:text-gray-600 text-xs"
          >
            ✏️
          </button>
          {sameLists.length > 0 && (
            <button
              title="Move to list"
              onClick={() => setMovingItemId(movingItemId === item.id ? null : item.id)}
              className="p-1 text-gray-300 hover:text-gray-600 text-xs"
            >
              ↗
            </button>
          )}
          <button
            title="Delete"
            disabled={actionLoading === item.id}
            onClick={() => void handleDeleteItem(item.id)}
            className="p-1 text-gray-300 hover:text-red-500 text-xs disabled:opacity-50"
          >
            🗑️
          </button>
        </div>
      )}

      {/* Move popover */}
      {movingItemId === item.id && (
        <div className="absolute right-0 mt-8 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 min-w-[160px]">
          <p className="text-xs text-gray-500 mb-1 px-1">Move to:</p>
          {sameLists.map((sl) => (
            <button
              key={sl.id}
              onClick={() => void handleMoveItem(item.id, sl.id)}
              className="block w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded"
            >
              {sl.name}
            </button>
          ))}
        </div>
      )}
    </li>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600">
          ←
        </button>
        <h1 className="text-xl font-semibold text-gray-800 flex-1">{list.name}</h1>
        <span className="text-xs text-gray-400 uppercase tracking-wide">{list.listType}</span>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setAddingItem(!addingItem); setForm(EMPTY_FORM); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500"
        >
          + Add item
        </button>
        <label
          title="Scan list with camera"
          className={`flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer ${scanning ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {scanning ? 'Scanning…' : '📷 Scan'}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void handleScanUpload(e)}
          />
        </label>
      </div>

      {/* Add item form */}
      {addingItem && (
        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
          <input
            autoFocus
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddItem(); }}
            placeholder="Item description *"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={form.packSize}
              onChange={(e) => setForm({ ...form, packSize: e.target.value })}
              placeholder="Pack size"
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none"
            />
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="Unit (kg, L…)"
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none"
            />
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="Qty"
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleAddItem()}
              disabled={actionLoading === 'add' || !form.description.trim()}
              className="px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingItem(false); setForm(EMPTY_FORM); }}
              className="px-3 py-2 text-gray-500 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Unpurchased items */}
      {unpurchased.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Items ({unpurchased.length})
          </h2>
          <ul className="space-y-2 relative">
            {unpurchased.map((item) => renderItem(item, 'unpurchased'))}
          </ul>
        </section>
      )}

      {/* Purchased items */}
      {purchased.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Purchased ({purchased.length})
          </h2>
          <ul className="space-y-2 relative">
            {purchased.map((item) => renderItem(item, 'purchased'))}
          </ul>
        </section>
      )}

      {items.filter((i) => !i.isDeleted).length === 0 && !addingItem && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No items yet — add one or scan a written list
        </div>
      )}
    </div>
  );
}
