/**
 * CategoriesPage — manage expense category sub-trees.
 *
 * Shows the full category tree for Personal or Household scope.
 * System categories (level 1) are read-only and cannot be edited or deleted.
 * Custom sub-categories (levels 2–3) can be renamed, have their icon updated,
 * and deleted. Household categories require owner role.
 *
 * Max depth is 3 levels. "+Add Sub-Category" is disabled on level-3 items.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Home, GraduationCap, Car, UtensilsCrossed, HeartPulse, Tv, Shirt,
  LayoutList, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useHouseholdStore } from '../../store/householdStore';
import { useExpensesStore } from '../../store/expensesStore';
import type { ExpenseCategory, ExpenseScope } from '@sqirl/shared';

const ICON_MAP: Record<string, React.ReactNode> = {
  Home: <Home size={16} />, GraduationCap: <GraduationCap size={16} />, Car: <Car size={16} />,
  UtensilsCrossed: <UtensilsCrossed size={16} />, HeartPulse: <HeartPulse size={16} />,
  Tv: <Tv size={16} />, Shirt: <Shirt size={16} />, default: <LayoutList size={16} />,
};
function CatIcon({ name }: { name: string | null }) {
  return <span className="text-primary-400 flex-shrink-0">{name && ICON_MAP[name] ? ICON_MAP[name] : ICON_MAP.default}</span>;
}

const ICON_OPTIONS = ['Home', 'GraduationCap', 'Car', 'UtensilsCrossed', 'HeartPulse', 'Tv', 'Shirt',
  'ShoppingCart', 'Coffee', 'Music', 'Film', 'Book', 'Dumbbell', 'Plane', 'Wallet', 'Pizza'];

interface EditModalProps {
  mode: 'add' | 'edit';
  scope: ExpenseScope;
  parentId?: string;
  initialName?: string;
  initialIcon?: string | null;
  onClose: () => void;
  onSaved: (cat: ExpenseCategory) => void;
}

function CategoryModal({ mode, scope, parentId, initialName, initialIcon, onClose, onSaved }: EditModalProps) {
  const [name, setName] = useState(initialName ?? '');
  const [iconName, setIconName] = useState(initialIcon ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    try {
      let cat: ExpenseCategory;
      if (mode === 'add') {
        const res = await api.createExpenseCategory({ parentId: parentId!, name: name.trim(), iconName: iconName || undefined, scope });
        cat = res.category;
      } else {
        // edit — caller must supply categoryId via parentId (reused field)
        const res = await api.updateExpenseCategory(parentId!, { name: name.trim(), iconName: iconName || null });
        cat = res.category;
      }
      onSaved(cat);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">{mode === 'add' ? 'Add Sub-Category' : 'Edit Category'}</h2>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Groceries"
          />
        </div>
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Icon (optional)</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            value={iconName}
            onChange={(e) => setIconName(e.target.value)}
          >
            <option value="">No icon</option>
            {ICON_OPTIONS.map((ico) => <option key={ico} value={ico}>{ico}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-primary-400 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 flex items-center gap-1"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface NodeProps {
  node: ExpenseCategory;
  scope: ExpenseScope;
  canManage: boolean;
  depth: number;
  onRefresh: () => void;
}

function CategoryTreeNode({ node, scope, canManage, depth, onRefresh }: NodeProps) {
  const [open, setOpen] = useState(depth === 0);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isSystem = node.scope === 'system';
  const canAdd = !isSystem && node.level < 3 && canManage;
  const canEdit = !isSystem && canManage;
  const canDelete = !isSystem && canManage;
  const hasChildren = (node.children ?? []).length > 0;

  async function handleDelete() {
    if (!confirm(`Delete "${node.name}" and all its sub-categories?`)) return;
    setDeleting(true);
    try {
      await api.deleteExpenseCategory(node.id);
      onRefresh();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group rounded-lg"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-gray-400 flex-shrink-0"
        >
          {hasChildren || isSystem
            ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
            : <span className="w-3.5 inline-block" />}
        </button>
        <CatIcon name={node.iconName} />
        <span className={`flex-1 text-sm ${isSystem ? 'font-semibold text-gray-700' : 'text-gray-600'}`}>{node.name}</span>
        {!isSystem && (
          <span className="text-xs text-gray-300">level {node.level}</span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAdd && (
            <button onClick={() => setShowAdd(true)} className="p-1 text-gray-400 hover:text-primary-400" title="Add sub-category">
              <Plus size={13} />
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowEdit(true)} className="p-1 text-gray-400 hover:text-primary-400" title="Edit">
              <Pencil size={13} />
            </button>
          )}
          {canDelete && (
            <button onClick={handleDelete} disabled={deleting} className="p-1 text-gray-400 hover:text-red-400 disabled:opacity-50" title="Delete">
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          )}
        </div>
      </div>

      {open && (node.children ?? []).map((child) => (
        <CategoryTreeNode
          key={child.id}
          node={child}
          scope={scope}
          canManage={canManage}
          depth={depth + 1}
          onRefresh={onRefresh}
        />
      ))}

      {/* Add sub-category under this system root */}
      {open && isSystem && canManage && (
        <div style={{ paddingLeft: `${28 + depth * 16}px` }}>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1 text-xs text-primary-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg my-1"
          >
            <Plus size={12} /> Add sub-category
          </button>
        </div>
      )}

      {showAdd && (
        <CategoryModal
          mode="add"
          scope={scope}
          parentId={node.id}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onRefresh(); }}
        />
      )}
      {showEdit && (
        <CategoryModal
          mode="edit"
          scope={scope}
          parentId={node.id}
          initialName={node.name}
          initialIcon={node.iconName}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const household = useHouseholdStore((s) => s.household);
  const { user } = useAuthStore.getState();
  const { personalCategories, householdCategories, setPersonalCategories, setHouseholdCategories } = useExpensesStore();

  const [scope, setScope] = useState<ExpenseScope>('personal');

  // Determine if user is household owner
  const member = household?.members.find((m) => m.userId === user?.id);
  const isOwner = member?.role === 'owner';
  const canManage = scope === 'personal' || (scope === 'household' && isOwner);

  const categories = scope === 'personal' ? personalCategories : householdCategories;

  const load = useCallback(async () => {
    try {
      const res = await api.getExpenseCategories(scope);
      scope === 'personal' ? setPersonalCategories(res.categories) : setHouseholdCategories(res.categories);
    } catch {
      // keep cached
    }
  }, [scope, setPersonalCategories, setHouseholdCategories]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Categories</h1>
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setScope('personal')}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${scope === 'personal' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Personal
          </button>
          {household && (
            <button
              onClick={() => setScope('household')}
              className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${scope === 'household' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Household
            </button>
          )}
        </div>
      </div>

      {scope === 'household' && !isOwner && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
          Only household owners can manage household categories.
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {categories.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">Loading categories…</p>
        ) : (
          <div className="divide-y divide-gray-50 p-2">
            {categories.map((cat) => (
              <CategoryTreeNode
                key={cat.id}
                node={cat}
                scope={scope}
                canManage={canManage}
                depth={0}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
