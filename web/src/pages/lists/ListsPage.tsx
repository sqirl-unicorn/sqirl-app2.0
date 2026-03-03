/**
 * ListsPage — main lists dashboard.
 *
 * Displays three tabs: General, Grocery, To Do.
 * Shows all visible lists (household + personal) for the current user.
 * Allows creating, renaming (inline), and deleting lists.
 * Polls every 30 s for real-time household updates.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useListsStore } from '../../store/listsStore';
import type { ShoppingList, ListType } from '@sqirl/shared';

const TABS: { key: ListType; label: string }[] = [
  { key: 'general',  label: 'General' },
  { key: 'grocery',  label: 'Grocery' },
  { key: 'todo',     label: 'To Do'   },
];

export default function ListsPage() {
  const navigate = useNavigate();
  const { lists, setLists, loading, setLoading, error, setError } = useListsStore();
  const [activeTab, setActiveTab] = useState<ListType>('general');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLists = useCallback(async () => {
    try {
      const { lists: ls } = await api.getLists();
      setLists(ls);
      setError(null);
    } catch {
      setError('Failed to load lists');
    }
  }, [setLists, setError]);

  useEffect(() => {
    setLoading(true);
    void fetchLists().finally(() => setLoading(false));

    // Poll every 30 s for household real-time updates
    pollingRef.current = setInterval(() => void fetchLists(), 30_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchLists, setLoading]);

  const filtered = lists.filter((l) => l.listType === activeTab && !l.isDeleted);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      setActionLoading('create');
      const { list } = await api.createList({ name: newName.trim(), listType: activeTab });
      setLists([list, ...lists]);
      setNewName('');
      setCreating(false);
    } catch {
      setError('Failed to create list');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRename(list: ShoppingList) {
    if (!renameValue.trim() || renameValue === list.name) {
      setRenamingId(null);
      return;
    }
    try {
      setActionLoading(list.id);
      const { list: updated } = await api.renameList(list.id, renameValue.trim());
      setLists(lists.map((l) => (l.id === updated.id ? updated : l)));
      setRenamingId(null);
    } catch {
      setError('Failed to rename list');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(listId: string) {
    if (!confirm('Delete this list and all its items?')) return;
    try {
      setActionLoading(listId);
      await api.deleteList(listId);
      setLists(lists.filter((l) => l.id !== listId));
    } catch {
      setError('Failed to delete list');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Lists</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setCreating(false); setNewName(''); }}
            className={`px-5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-primary-400 text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-gray-400">
              ({lists.filter((l) => l.listType === tab.key && !l.isDeleted).length})
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && lists.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <>
          {/* New list button */}
          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="mb-4 flex items-center gap-2 text-sm text-primary-400 hover:text-primary-600 font-medium"
            >
              <span className="text-xl leading-none">+</span> New list
            </button>
          ) : (
            <div className="mb-4 flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
                placeholder="List name…"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              <button
                onClick={() => void handleCreate()}
                disabled={actionLoading === 'create'}
                className="px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setCreating(false); setNewName(''); }}
                className="px-3 py-2 text-gray-500 text-sm hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}

          {/* List cards */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} lists yet
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((list) => (
                <li
                  key={list.id}
                  className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* List type icon */}
                  <span className="text-lg select-none" aria-hidden>
                    {list.listType === 'grocery' ? '🛒' : list.listType === 'todo' ? '✅' : '📋'}
                  </span>

                  {/* Rename inline */}
                  {renamingId === list.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void handleRename(list)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(list); if (e.key === 'Escape') setRenamingId(null); }}
                      className="flex-1 px-2 py-1 border border-primary-400 rounded text-sm focus:outline-none"
                    />
                  ) : (
                    <button
                      className="flex-1 text-left text-sm font-medium text-gray-800 hover:text-primary-400 truncate"
                      onClick={() => navigate(`/list/${list.id}`)}
                    >
                      {list.name}
                    </button>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      title="Rename"
                      onClick={() => { setRenamingId(list.id); setRenameValue(list.name); }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    >
                      ✏️
                    </button>
                    <button
                      title="Delete"
                      disabled={actionLoading === list.id}
                      onClick={() => void handleDelete(list.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded disabled:opacity-50"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
