/**
 * BudgetPage — set and carry-forward monthly budgets per category.
 *
 * Shows a flat table of all categories for the selected scope and month.
 * Inline-edit the budget amount per row. Carry Forward copies last month's
 * budgets to the current month (does not overwrite existing values).
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useHouseholdStore } from '../../store/householdStore';
import { useAuthStore } from '../../store/authStore';
import { useExpensesStore } from '../../store/expensesStore';
import type { ExpenseCategory, ExpenseBudget, ExpenseScope } from '@sqirl/shared';

function flattenTree(cats: ExpenseCategory[]): ExpenseCategory[] {
  const out: ExpenseCategory[] = [];
  function walk(nodes: ExpenseCategory[]) {
    for (const n of nodes) { out.push(n); if (n.children) walk(n.children); }
  }
  walk(cats);
  return out;
}

function prevMonthStr(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export default function BudgetPage() {
  const household = useHouseholdStore((s) => s.household);
  const { user } = useAuthStore.getState();
  const { personalCategories, householdCategories, personalBudgets, householdBudgets, setPersonalBudgets, setHouseholdBudgets } = useExpensesStore();

  const [scope, setScope] = useState<ExpenseScope>('personal');
  const [month, setMonth] = useState(currentYM());
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [carrying, setCarrying] = useState(false);

  const member = household?.members.find((m) => m.userId === user?.id);
  const isOwner = member?.role === 'owner';
  const canManage = scope === 'personal' || (scope === 'household' && isOwner);

  const categories = flattenTree(scope === 'personal' ? personalCategories : householdCategories);
  const budgets = scope === 'personal' ? personalBudgets : householdBudgets;

  const budgetMap = new Map(budgets.map((b) => [b.categoryId, b]));

  const load = useCallback(async () => {
    try {
      const res = await api.getExpenseBudgets(scope, month);
      scope === 'personal' ? setPersonalBudgets(res.budgets) : setHouseholdBudgets(res.budgets);
    } catch {
      // keep cached
    }
  }, [scope, month, setPersonalBudgets, setHouseholdBudgets]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(cat: ExpenseCategory) {
    const raw = editAmounts[cat.id] ?? '';
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount < 0) return;

    setSaving((s) => ({ ...s, [cat.id]: true }));
    try {
      const res = await api.setExpenseBudget(cat.id, { scope, budgetMonth: month, amount });
      const updated = res.budget;
      if (scope === 'personal') {
        setPersonalBudgets(budgets.some((b) => b.categoryId === cat.id)
          ? budgets.map((b) => b.categoryId === cat.id ? updated : b)
          : [...budgets, updated]);
      } else {
        setHouseholdBudgets(budgets.some((b) => b.categoryId === cat.id)
          ? budgets.map((b) => b.categoryId === cat.id ? updated : b)
          : [...budgets, updated]);
      }
      setEditAmounts((a) => { const n = { ...a }; delete n[cat.id]; return n; });
    } catch {
      // show error inline
    } finally {
      setSaving((s) => ({ ...s, [cat.id]: false }));
    }
  }

  async function handleCarryForward() {
    setCarrying(true);
    try {
      await api.carryForwardExpenseBudgets({ scope, fromMonth: prevMonthStr(month), toMonth: month });
      await load();
    } catch {
      // ignore
    } finally {
      setCarrying(false);
    }
  }

  const indentLabel = (cat: ExpenseCategory) =>
    `${'  '.repeat(cat.level - 1)}${cat.name}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-800">Budget</h1>
        <div className="flex items-center gap-3">
          {/* Scope */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setScope('personal')}
              className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${scope === 'personal' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
            >Personal</button>
            {household && (
              <button
                onClick={() => setScope('household')}
                className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${scope === 'household' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >Household</button>
            )}
          </div>
          {/* Month */}
          <div className="flex items-center gap-1">
            <button onClick={() => setMonth(prevMonthStr(month))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
            <span className="text-sm font-medium text-gray-700 w-32 text-center">{formatMonth(month)}</span>
            <button onClick={() => {
              const [y, m] = month.split('-').map(Number);
              const d = new Date(y, m, 1);
              setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
          </div>
          {/* Carry forward */}
          {canManage && (
            <button
              onClick={handleCarryForward}
              disabled={carrying}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-50"
            >
              {carrying ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
              Carry Forward
            </button>
          )}
        </div>
      </div>

      {scope === 'household' && !isOwner && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
          Only household owners can set household budgets.
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Category</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Budget</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const existing = budgetMap.get(cat.id);
              const displayAmt = editAmounts[cat.id] !== undefined
                ? editAmounts[cat.id]
                : existing ? existing.amount.toString() : '';
              const isDirty = editAmounts[cat.id] !== undefined;

              return (
                <tr key={cat.id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 text-gray-700" style={{ paddingLeft: `${16 + (cat.level - 1) * 16}px` }}>
                    {indentLabel(cat)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canManage ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-28 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                        value={displayAmt}
                        placeholder="0.00"
                        onChange={(e) => setEditAmounts((a) => ({ ...a, [cat.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(cat); }}
                      />
                    ) : (
                      <span className="text-gray-600">{existing ? `$${existing.amount.toFixed(2)}` : '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canManage && isDirty && (
                      <button
                        onClick={() => void handleSave(cat)}
                        disabled={saving[cat.id]}
                        className="text-xs bg-primary-400 text-white px-2 py-1 rounded-lg hover:bg-primary-500 disabled:opacity-50 flex items-center gap-1 ml-auto"
                      >
                        {saving[cat.id] ? <Loader2 size={10} className="animate-spin" /> : null}
                        Save
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
