/**
 * ExpensesPage — main expense tracking screen.
 *
 * Tabs: Personal | Household (hidden when user has no household)
 * Month navigator: previous/next month arrows
 * Summary bar: total spent / total budget with a progress bar
 * View toggle: Date view | Category view
 *
 * Date view: collapsible rows per date with daily subtotals and transaction table.
 * Category view: 3-level expandable tree with per-category progress bars and transactions.
 *
 * Multi-select: checkboxes on transaction rows; "Move" toolbar appears on selection.
 * Pending-sync indicator: ⟳ badge on rows in pendingSyncIds set.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Home, GraduationCap, Car, UtensilsCrossed, HeartPulse, Tv, Shirt,
  ChevronDown, ChevronRight, Plus, RefreshCw, Calendar, LayoutList, Filter,
  ArrowRightLeft, Loader2, CheckSquare, Square,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useHouseholdStore } from '../../store/householdStore';
import { useExpensesStore } from '../../store/expensesStore';
import type { Expense, ExpenseCategory, ExpenseScope } from '@sqirl/shared';
import * as wsClient from '../../lib/wsClient';

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  Home: <Home size={16} />,
  GraduationCap: <GraduationCap size={16} />,
  Car: <Car size={16} />,
  UtensilsCrossed: <UtensilsCrossed size={16} />,
  HeartPulse: <HeartPulse size={16} />,
  Tv: <Tv size={16} />,
  Shirt: <Shirt size={16} />,
  default: <LayoutList size={16} />,
};

function CategoryIcon({ name }: { name: string | null }) {
  return (
    <span className="text-primary-400 flex-shrink-0">
      {name && ICON_MAP[name] ? ICON_MAP[name] : ICON_MAP.default}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMonth(ym: string) {
  const [year, month] = ym.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
}

function prevMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtCurrency(n: number) {
  return `$${n.toFixed(2)}`;
}

function flattenTree(cats: ExpenseCategory[]): ExpenseCategory[] {
  const result: ExpenseCategory[] = [];
  function walk(nodes: ExpenseCategory[]) {
    for (const n of nodes) {
      result.push(n);
      if (n.children) walk(n.children);
    }
  }
  walk(cats);
  return result;
}

/** Build a human-readable breadcrumb path like "Food > Groceries" */
function categoryPath(categoryId: string | null, allCats: ExpenseCategory[]): string {
  if (!categoryId) return '—';
  const flat = flattenTree(allCats);
  const catMap = new Map(flat.map((c) => [c.id, c]));

  const parts: string[] = [];
  let cur = catMap.get(categoryId);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? catMap.get(cur.parentId) : undefined;
  }
  return parts.join(' > ') || '—';
}

// ── Transaction Table ─────────────────────────────────────────────────────────

interface TxnTableProps {
  expenses: Expense[];
  allCats: ExpenseCategory[];
  pendingIds: Set<string>;
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (expense: Expense) => void;
}

function TransactionTable({ expenses, allCats, pendingIds, selectedIds, onSelect, onEdit }: TxnTableProps) {
  if (expenses.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <th className="w-6 py-1 pr-2"></th>
            <th className="py-1 pr-3 text-left font-medium">Date</th>
            <th className="py-1 pr-3 text-left font-medium">Description</th>
            <th className="py-1 pr-3 text-right font-medium">Amount</th>
            <th className="py-1 pr-3 text-left font-medium">Category</th>
            <th className="py-1 pr-3 text-right font-medium">Pack</th>
            <th className="py-1 pr-3 text-left font-medium">Unit</th>
            <th className="py-1 pr-3 text-right font-medium">Qty</th>
            <th className="py-1 pr-3 text-left font-medium">Business</th>
            <th className="py-1 text-left font-medium">Location</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((exp) => (
            <tr
              key={exp.id}
              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
              onClick={() => onEdit(exp)}
            >
              <td className="py-1 pr-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onSelect(exp.id, !selectedIds.has(exp.id))}
                  className="text-gray-300 hover:text-primary-400"
                >
                  {selectedIds.has(exp.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>
              </td>
              <td className="py-1 pr-3 text-gray-600 whitespace-nowrap">
                {new Date(exp.expenseDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </td>
              <td className="py-1 pr-3 text-gray-800 max-w-[180px] truncate">
                {exp.description}
                {pendingIds.has(exp.id) && (
                  <span className="ml-1 text-amber-400" title="Pending sync">
                    <Loader2 size={10} className="inline animate-spin" />
                  </span>
                )}
              </td>
              <td className="py-1 pr-3 text-right text-gray-800 font-medium whitespace-nowrap">
                {fmtCurrency(exp.amount)}
              </td>
              <td className="py-1 pr-3 text-gray-500 max-w-[140px] truncate">
                {categoryPath(exp.categoryId, allCats)}
              </td>
              <td className="py-1 pr-3 text-right text-gray-500">{exp.packSize ?? ''}</td>
              <td className="py-1 pr-3 text-gray-500">{exp.unit ?? ''}</td>
              <td className="py-1 pr-3 text-right text-gray-500">{exp.quantity ?? ''}</td>
              <td className="py-1 pr-3 text-gray-500 max-w-[100px] truncate">{exp.business ?? ''}</td>
              <td className="py-1 text-gray-500 max-w-[100px] truncate">{exp.location ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Date View ─────────────────────────────────────────────────────────────────

interface DateViewProps {
  expenses: Expense[];
  allCats: ExpenseCategory[];
  pendingIds: Set<string>;
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (expense: Expense) => void;
}

function DateView({ expenses, allCats, pendingIds, selectedIds, onSelect, onEdit }: DateViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const byDate = expenses.reduce<Record<string, Expense[]>>((acc, exp) => {
    const d = exp.expenseDate.slice(0, 10);
    if (!acc[d]) acc[d] = [];
    acc[d].push(exp);
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) {
    return <p className="text-gray-400 text-sm py-4">No expenses this month.</p>;
  }

  return (
    <div className="space-y-2">
      {dates.map((date) => {
        const dayExps = byDate[date];
        const dayTotal = dayExps.reduce((s, e) => s + e.amount, 0);
        const isOpen = !collapsed.has(date);
        const label = new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        });

        return (
          <div key={date} className="border border-gray-100 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700"
              onClick={() => setCollapsed((s) => {
                const n = new Set(s);
                isOpen ? n.add(date) : n.delete(date);
                return n;
              })}
            >
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Calendar size={14} className="text-primary-400" />
                {label}
                <span className="text-gray-400 font-normal text-xs">({dayExps.length} transactions)</span>
              </span>
              <span className="font-semibold text-gray-800">{fmtCurrency(dayTotal)}</span>
            </button>
            {isOpen && (
              <div className="px-4 py-2">
                <TransactionTable
                  expenses={dayExps}
                  allCats={allCats}
                  pendingIds={pendingIds}
                  selectedIds={selectedIds}
                  onSelect={onSelect}
                  onEdit={onEdit}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Category View ─────────────────────────────────────────────────────────────

interface CategoryViewProps {
  categories: ExpenseCategory[];
  expenses: Expense[];
  budgets: { categoryId: string; amount: number }[];
  pendingIds: Set<string>;
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (expense: Expense) => void;
}

function CategoryNode({
  node,
  expenses,
  allCats,
  budgets,
  depth,
  pendingIds,
  selectedIds,
  onSelect,
  onEdit,
}: {
  node: ExpenseCategory;
  expenses: Expense[];
  allCats: ExpenseCategory[];
  budgets: { categoryId: string; amount: number }[];
  depth: number;
  pendingIds: Set<string>;
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (expense: Expense) => void;
}) {
  const [open, setOpen] = useState(false);

  // Direct expenses (tagged exactly to this category)
  const directExps = expenses.filter((e) => e.categoryId === node.id);

  // All expenses under this subtree (for total + budget bar)
  function collectAll(n: ExpenseCategory): Expense[] {
    const direct = expenses.filter((e) => e.categoryId === n.id);
    const children = (n.children ?? []).flatMap(collectAll);
    return [...direct, ...children];
  }
  const allExps = collectAll(node);
  const totalSpent = allExps.reduce((s, e) => s + e.amount, 0);
  const budget = budgets.find((b) => b.categoryId === node.id)?.amount ?? 0;
  const pct = budget > 0 ? Math.min(100, (totalSpent / budget) * 100) : 0;
  const barColor = pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-green-400';

  const hasChildren = (node.children ?? []).length > 0 || directExps.length > 0;
  const indent = depth * 16;

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left rounded-lg"
        style={{ paddingLeft: `${12 + indent}px` }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex-shrink-0 text-gray-400">
          {hasChildren ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5 inline-block" />}
        </span>
        <CategoryIcon name={node.iconName} />
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">{node.name}</span>
        {budget > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-gray-500 w-28 text-right">
              {fmtCurrency(totalSpent)} / {fmtCurrency(budget)}
            </span>
          </div>
        )}
        {budget === 0 && totalSpent > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">{fmtCurrency(totalSpent)}</span>
        )}
      </button>

      {open && (
        <div>
          {/* Sub-category summaries */}
          {(node.children ?? []).map((child) => (
            <CategoryNode
              key={child.id}
              node={child}
              expenses={expenses}
              allCats={allCats}
              budgets={budgets}
              depth={depth + 1}
              pendingIds={pendingIds}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onEdit={onEdit}
            />
          ))}
          {/* Direct transactions */}
          {directExps.length > 0 && (
            <div className="px-4 pb-2" style={{ paddingLeft: `${28 + indent}px` }}>
              <TransactionTable
                expenses={directExps}
                allCats={allCats}
                pendingIds={pendingIds}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onEdit={onEdit}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryView({ categories, expenses, budgets, pendingIds, selectedIds, onSelect, onEdit }: CategoryViewProps) {
  if (categories.length === 0) return <p className="text-gray-400 text-sm py-4">No categories loaded.</p>;
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-100">
      {categories.map((cat) => (
        <CategoryNode
          key={cat.id}
          node={cat}
          expenses={expenses}
          allCats={categories}
          budgets={budgets}
          depth={0}
          pendingIds={pendingIds}
          selectedIds={selectedIds}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

// ── Expense Form Modal ────────────────────────────────────────────────────────

interface ExpenseFormModalProps {
  mode: 'add' | 'edit';
  scope: ExpenseScope;
  categories: ExpenseCategory[];
  initialData?: Partial<Expense>;
  onClose: () => void;
  onSaved: (expense: Expense) => void;
  onDeleted?: (id: string) => void;
}

function ExpenseFormModal({ mode, scope, categories, initialData, onClose, onSaved, onDeleted }: ExpenseFormModalProps) {
  const flat = flattenTree(categories);
  const [form, setForm] = useState({
    categoryId: initialData?.categoryId ?? '',
    amount: initialData?.amount?.toString() ?? '',
    description: initialData?.description ?? '',
    expenseDate: initialData?.expenseDate ?? new Date().toISOString().slice(0, 10),
    packSize: initialData?.packSize?.toString() ?? '',
    unit: initialData?.unit ?? '',
    quantity: initialData?.quantity?.toString() ?? '',
    business: initialData?.business ?? '',
    location: initialData?.location ?? '',
    notes: initialData?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!form.categoryId || !form.description || !form.amount || !form.expenseDate) {
      setError('Description, Date, Amount, and Category are required.');
      return;
    }
    const amountNum = parseFloat(form.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      let saved: Expense;
      if (mode === 'add') {
        const res = await api.addExpense({
          scope,
          categoryId: form.categoryId,
          amount: amountNum,
          description: form.description,
          expenseDate: form.expenseDate,
          packSize: form.packSize ? parseFloat(form.packSize) : undefined,
          unit: form.unit || undefined,
          quantity: form.quantity ? parseFloat(form.quantity) : undefined,
          business: form.business || undefined,
          location: form.location || undefined,
          notes: form.notes || undefined,
        });
        saved = res.expense;
      } else {
        const res = await api.updateExpense(initialData!.id!, {
          categoryId: form.categoryId || null,
          amount: amountNum,
          description: form.description,
          expenseDate: form.expenseDate,
          packSize: form.packSize ? parseFloat(form.packSize) : null,
          unit: form.unit || null,
          quantity: form.quantity ? parseFloat(form.quantity) : null,
          business: form.business || null,
          location: form.location || null,
          notes: form.notes || null,
        });
        saved = res.expense;
      }
      onSaved(saved);
    } catch {
      setError('Failed to save expense. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialData?.id || !onDeleted) return;
    setDeleting(true);
    try {
      await api.deleteExpense(initialData.id);
      onDeleted(initialData.id);
    } catch {
      setError('Failed to delete expense.');
      setDeleting(false);
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400';
  const labelCls = 'block text-xs text-gray-500 mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            {mode === 'add' ? 'Add Expense' : 'Edit Expense'}
          </h2>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Description *</label>
              <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Weekly groceries" />
            </div>
            <div>
              <label className={labelCls}>Amount *</label>
              <input className={inputCls} type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input className={inputCls} type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Category *</label>
              <select className={inputCls} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Select category…</option>
                {flat.map((c) => (
                  <option key={c.id} value={c.id} style={{ paddingLeft: `${(c.level - 1) * 8}px` }}>
                    {'  '.repeat(c.level - 1)}{c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Business</label>
              <input className={inputCls} value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="e.g. Woolworths" />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bondi Junction" />
            </div>
            <div>
              <label className={labelCls}>Pack Size</label>
              <input className={inputCls} type="number" min="0" step="any" value={form.packSize} onChange={(e) => setForm({ ...form, packSize: e.target.value })} placeholder="e.g. 2" />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g. kg, L, pcs" />
            </div>
            <div>
              <label className={labelCls}>Quantity</label>
              <input className={inputCls} type="number" min="0" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 3" />
            </div>
          </div>
          <div className="mb-4">
            <label className={labelCls}>Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes…" />
          </div>

          <div className="flex justify-between items-center">
            {mode === 'edit' && onDeleted ? (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-500 text-sm hover:underline disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete expense'}
              </button>
            ) : <div />}
            <div className="flex gap-2">
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
      </div>
    </div>
  );
}

// ── Move Modal ────────────────────────────────────────────────────────────────

interface MoveModalProps {
  expenses: Expense[];
  targetScope: ExpenseScope;
  targetCategories: ExpenseCategory[];
  onClose: () => void;
  onMoved: (moved: Expense[]) => void;
}

function MoveModal({ expenses, targetScope, targetCategories, onClose, onMoved }: MoveModalProps) {
  const flat = flattenTree(targetCategories);
  // Track per-expense category overrides (needed when source category doesn't exist in target)
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Check all expenses for category conflicts
  useEffect(() => {
    async function checkAll() {
      const results: Record<string, boolean> = {};
      await Promise.all(
        expenses.map(async (exp) => {
          try {
            const r = await api.checkExpenseMove(exp.id, targetScope);
            results[exp.id] = r.needsRemap;
          } catch {
            results[exp.id] = false;
          }
        })
      );
      setChecks(results);
      setLoading(false);
    }
    void checkAll();
  }, [expenses, targetScope]);

  async function handleMove() {
    // Validate: all remapping expenses have a category selected
    for (const exp of expenses) {
      if (checks[exp.id] && !overrides[exp.id]) {
        setError(`Please select a category for "${exp.description}"`);
        return;
      }
    }
    setSaving(true);
    try {
      const moved: Expense[] = [];
      for (const exp of expenses) {
        const res = await api.moveExpense(exp.id, {
          targetScope,
          targetCategoryId: overrides[exp.id] || undefined,
        });
        moved.push(res.expense);
      }
      onMoved(moved);
    } catch {
      setError('Failed to move some expenses. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            Move {expenses.length} expense{expenses.length > 1 ? 's' : ''} to {targetScope}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Expenses with custom categories that don't exist in the target scope need a new category.
          </p>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          {loading && <p className="text-gray-400 text-sm">Checking categories…</p>}

          {!loading && (
            <div className="space-y-3">
              {expenses.map((exp) => (
                <div key={exp.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">{exp.description}</span>
                    <span className="text-gray-500">{fmtCurrency(exp.amount)}</span>
                  </div>
                  {checks[exp.id] && (
                    <div className="mt-2">
                      <label className="text-xs text-amber-600 mb-1 block">Category mismatch — select target category:</label>
                      <select
                        className="w-full border border-amber-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                        value={overrides[exp.id] ?? ''}
                        onChange={(e) => setOverrides({ ...overrides, [exp.id]: e.target.value })}
                      >
                        <option value="">Select category…</option>
                        {flat.map((c) => (
                          <option key={c.id} value={c.id}>{'  '.repeat(c.level - 1)}{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={handleMove}
              disabled={saving || loading}
              className="px-4 py-1.5 text-sm bg-primary-400 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 flex items-center gap-1"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              {saving ? 'Moving…' : `Move to ${targetScope}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const user = useAuthStore((s) => s.user);
  const household = useHouseholdStore((s) => s.household);

  const {
    personalCategories, householdCategories,
    personalBudgets, householdBudgets,
    personalExpenses, householdExpenses,
    pendingSyncIds,
    setPersonalCategories, setHouseholdCategories,
    setPersonalBudgets, setHouseholdBudgets,
    setPersonalExpenses, setHouseholdExpenses,
  } = useExpensesStore();

  const [scope, setScope] = useState<ExpenseScope>('personal');
  const [month, setMonth] = useState(currentYearMonth());
  const [viewMode, setViewMode] = useState<'date' | 'category'>('date');
  const [showAdd, setShowAdd] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMove, setShowMove] = useState(false);

  const expenses = scope === 'personal' ? personalExpenses : householdExpenses;
  const categories = scope === 'personal' ? personalCategories : householdCategories;
  const budgets = scope === 'personal' ? personalBudgets : householdBudgets;
  const targetScope: ExpenseScope = scope === 'personal' ? 'household' : 'personal';

  const loadAll = useCallback(async () => {
    try {
      const [catRes, budgetRes, expRes] = await Promise.all([
        api.getExpenseCategories(scope),
        api.getExpenseBudgets(scope, month),
        api.getExpenses(scope, month),
      ]);
      if (scope === 'personal') {
        setPersonalCategories(catRes.categories);
        setPersonalBudgets(budgetRes.budgets);
        setPersonalExpenses(expRes.expenses);
      } else {
        setHouseholdCategories(catRes.categories);
        setHouseholdBudgets(budgetRes.budgets);
        setHouseholdExpenses(expRes.expenses);
      }
    } catch {
      // Silently fail — keep cached data
    }
  }, [scope, month, setPersonalCategories, setHouseholdCategories, setPersonalBudgets, setHouseholdBudgets, setPersonalExpenses, setHouseholdExpenses]);

  useEffect(() => {
    void loadAll();
    return wsClient.on('expenses:changed', () => void loadAll());
  }, [loadAll]);

  // Summary stats
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const budgetPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
  const barColor = budgetPct >= 90 ? 'bg-red-400' : budgetPct >= 70 ? 'bg-amber-400' : 'bg-green-400';

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds((s) => {
      const n = new Set(s);
      checked ? n.add(id) : n.delete(id);
      return n;
    });
  }

  function handleSaved(expense: Expense) {
    if (scope === 'personal') {
      const existing = personalExpenses.some((e) => e.id === expense.id);
      setPersonalExpenses(
        existing ? personalExpenses.map((e) => e.id === expense.id ? expense : e)
                 : [expense, ...personalExpenses]
      );
    } else {
      const existing = householdExpenses.some((e) => e.id === expense.id);
      setHouseholdExpenses(
        existing ? householdExpenses.map((e) => e.id === expense.id ? expense : e)
                 : [expense, ...householdExpenses]
      );
    }
    setShowAdd(false);
    setEditExpense(null);
  }

  function handleDeleted(id: string) {
    if (scope === 'personal') {
      setPersonalExpenses(personalExpenses.filter((e) => e.id !== id));
    } else {
      setHouseholdExpenses(householdExpenses.filter((e) => e.id !== id));
    }
    setEditExpense(null);
  }

  function handleMoved(moved: Expense[]) {
    const movedIds = new Set(moved.map((e) => e.id));
    // Remove from current scope
    if (scope === 'personal') {
      setPersonalExpenses(personalExpenses.filter((e) => !movedIds.has(e.id)));
    } else {
      setHouseholdExpenses(householdExpenses.filter((e) => !movedIds.has(e.id)));
    }
    setSelectedIds(new Set());
    setShowMove(false);
    // Reload target scope
    void loadAll();
  }

  const selectedExpenses = expenses.filter((e) => selectedIds.has(e.id));
  const targetCats = targetScope === 'personal' ? personalCategories : householdCategories;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Scope tabs */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => { setScope('personal'); setSelectedIds(new Set()); }}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${scope === 'personal' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Personal
          </button>
          {household && (
            <button
              onClick={() => { setScope('household'); setSelectedIds(new Set()); }}
              className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${scope === 'household' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Household
            </button>
          )}
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setMonth(prevMonth(month))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
          <span className="text-sm font-medium text-gray-700 w-36 text-center">{formatMonth(month)}</span>
          <button onClick={() => setMonth(nextMonth(month))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Spent this month</span>
            <span className="font-semibold text-gray-800">
              {fmtCurrency(totalSpent)}
              {totalBudget > 0 && <span className="text-gray-400 font-normal"> / {fmtCurrency(totalBudget)}</span>}
            </span>
          </div>
          {totalBudget > 0 && (
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${budgetPct}%` }} />
            </div>
          )}
        </div>
        {totalBudget > 0 && (
          <span className={`text-sm font-medium flex-shrink-0 ${budgetPct >= 90 ? 'text-red-500' : budgetPct >= 70 ? 'text-amber-500' : 'text-green-600'}`}>
            {budgetPct.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('date')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${viewMode === 'date' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
          >
            Date View
          </button>
          <button
            onClick={() => setViewMode('category')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${viewMode === 'category' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
          >
            Category View
          </button>
        </div>

        {selectedIds.size > 0 && household && (
          <button
            onClick={() => setShowMove(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100"
          >
            <ArrowRightLeft size={12} />
            Move {selectedIds.size} to {targetScope}
          </button>
        )}

        <button
          onClick={() => void loadAll()}
          className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>

        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 px-4 py-1.5 text-sm bg-primary-400 text-white rounded-lg hover:bg-primary-500"
        >
          <Plus size={14} />
          Add Expense
        </button>
      </div>

      {/* Main view */}
      {viewMode === 'date' ? (
        <DateView
          expenses={expenses}
          allCats={categories}
          pendingIds={pendingSyncIds}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onEdit={setEditExpense}
        />
      ) : (
        <CategoryView
          categories={categories}
          expenses={expenses}
          budgets={budgets.map((b) => ({ categoryId: b.categoryId, amount: b.amount }))}
          pendingIds={pendingSyncIds}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onEdit={setEditExpense}
        />
      )}

      {/* Modals */}
      {showAdd && (
        <ExpenseFormModal
          mode="add"
          scope={scope}
          categories={categories}
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}
      {editExpense && (
        <ExpenseFormModal
          mode="edit"
          scope={scope}
          categories={categories}
          initialData={editExpense}
          onClose={() => setEditExpense(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
      {showMove && selectedExpenses.length > 0 && (
        <MoveModal
          expenses={selectedExpenses}
          targetScope={targetScope}
          targetCategories={targetCats}
          onClose={() => setShowMove(false)}
          onMoved={handleMoved}
        />
      )}

      {/* Suppress unused variable warning for user */}
      {user && null}
    </div>
  );
}
