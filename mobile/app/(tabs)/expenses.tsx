/**
 * Expenses tab — main expense tracking screen for mobile.
 *
 * Tabs: Personal | Household (hidden when user has no household)
 * Month navigator, summary bar (spent / budget), view toggle (Date | Category)
 * FAB for add expense, long-press for multi-select + move
 * Pending sync: ⚠ badge on un-synced rows
 */

import { useState, useEffect, useCallback } from 'react';
import * as wsClient from '../../src/lib/wsClient';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList, StyleSheet,
  Pressable, Modal, TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/authStore';
import { useHouseholdStore } from '../../src/store/householdStore';
import { useExpensesStore } from '../../src/store/expensesStore';
import type { Expense, ExpenseCategory, ExpenseScope } from '@sqirl/shared';
import { colors, typography, spacing, borderRadius, shadows } from '../../constants/designTokens';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SYSTEM_CAT_ICONS: Record<string, string> = {
  Home: 'home', GraduationCap: 'school', Car: 'car', UtensilsCrossed: 'restaurant',
  HeartPulse: 'medical', Tv: 'tv', Shirt: 'shirt',
};

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' })
    .toUpperCase();
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

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function flattenTree(cats: ExpenseCategory[]): ExpenseCategory[] {
  const out: ExpenseCategory[] = [];
  function walk(n: ExpenseCategory[]) {
    for (const c of n) { out.push(c); if (c.children) walk(c.children); }
  }
  walk(cats);
  return out;
}

function categoryPath(id: string | null, cats: ExpenseCategory[]): string {
  if (!id) return '—';
  const flat = flattenTree(cats);
  const byId = new Map(flat.map((c) => [c.id, c]));
  const parts: string[] = [];
  let cur = byId.get(id);
  while (cur) { parts.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  return parts.join(' > ') || '—';
}

function fmtAmt(n: number) { return `$${n.toFixed(2)}`; }

// ── Add/Edit Expense Modal ────────────────────────────────────────────────────

function ExpenseFormModal({
  mode, scope, categories, initialData, onClose, onSaved, onDeleted,
}: {
  mode: 'add' | 'edit';
  scope: ExpenseScope;
  categories: ExpenseCategory[];
  initialData?: Partial<Expense>;
  onClose: () => void;
  onSaved: (e: Expense) => void;
  onDeleted?: (id: string) => void;
}) {
  const flat = flattenTree(categories);
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [amount, setAmount] = useState(initialData?.amount?.toString() ?? '');
  const [expenseDate, setExpenseDate] = useState(initialData?.expenseDate ?? new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState(initialData?.categoryId ?? '');
  const [business, setBusiness] = useState(initialData?.business ?? '');
  const [location, setLocation] = useState(initialData?.location ?? '');
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  const selectedCat = flat.find((c) => c.id === categoryId);

  async function handleSave() {
    if (!description.trim() || !amount || !expenseDate || !categoryId) {
      Alert.alert('Required Fields', 'Description, Date, Amount and Category are required.');
      return;
    }
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      Alert.alert('Invalid Amount', 'Amount must be a positive number.');
      return;
    }
    setSaving(true);
    try {
      let saved: Expense;
      if (mode === 'add') {
        const res = await api.addExpense({ scope, categoryId, amount: amtNum, description: description.trim(), expenseDate, business: business || undefined, location: location || undefined, notes: notes || undefined });
        saved = res.expense;
      } else {
        const res = await api.updateExpense(initialData!.id!, { categoryId, amount: amtNum, description: description.trim(), expenseDate, business: business || null, location: location || null, notes: notes || null });
        saved = res.expense;
      }
      onSaved(saved);
    } catch {
      Alert.alert('Error', 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert('Delete Expense', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteExpense(initialData!.id!);
            onDeleted?.(initialData!.id!);
          } catch {
            Alert.alert('Error', 'Failed to delete.');
          }
        },
      },
    ]);
  }

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{mode === 'add' ? 'Add Expense' : 'Edit Expense'}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Description *</Text>
            <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="e.g. Weekly groceries" />
            <Text style={styles.label}>Amount *</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
            <Text style={styles.label}>Date *</Text>
            <TextInput style={styles.input} value={expenseDate} onChangeText={setExpenseDate} placeholder="YYYY-MM-DD" />
            <Text style={styles.label}>Category *</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowCatPicker(true)}>
              <Text style={categoryId ? styles.pickerBtnText : styles.pickerBtnPlaceholder}>
                {selectedCat ? selectedCat.name : 'Select category…'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.text.subtle} />
            </TouchableOpacity>
            <Text style={styles.label}>Business</Text>
            <TextInput style={styles.input} value={business} onChangeText={setBusiness} placeholder="e.g. Woolworths" />
            <Text style={styles.label}>Location</Text>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Bondi Junction" />
            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { height: 64 }]} value={notes} onChangeText={setNotes} multiline placeholder="Optional notes…" />
          </ScrollView>
          <View style={styles.modalActions}>
            {mode === 'edit' && onDeleted && (
              <TouchableOpacity onPress={handleDelete}>
                <Text style={{ color: '#ef4444', fontSize: 14 }}>Delete</Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={colors.text.inverse} /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Category picker sub-modal */}
      {showCatPicker && (
        <Modal animationType="slide" transparent onRequestClose={() => setShowCatPicker(false)}>
          <View style={styles.overlay}>
            <View style={[styles.sheet, { maxHeight: '80%' }]}>
              <Text style={styles.sheetTitle}>Select Category</Text>
              <FlatList
                data={flat}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.catPickerRow, { paddingLeft: 16 + (item.level - 1) * 16 }]}
                    onPress={() => { setCategoryId(item.id); setShowCatPicker(false); }}
                  >
                    <Text style={styles.catPickerName}>{item.name}</Text>
                    {item.id === categoryId && <Ionicons name="checkmark" size={16} color={colors.primary[400]} />}
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity style={[styles.cancelBtn, { marginTop: 8, alignSelf: 'flex-end' }]} onPress={() => setShowCatPicker(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

// ── Move Modal ────────────────────────────────────────────────────────────────

function MoveModal({
  expenses, targetScope, targetCategories, onClose, onMoved,
}: {
  expenses: Expense[];
  targetScope: ExpenseScope;
  targetCategories: ExpenseCategory[];
  onClose: () => void;
  onMoved: (moved: Expense[]) => void;
}) {
  const flat = flattenTree(targetCategories);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function checkAll() {
      const results: Record<string, boolean> = {};
      await Promise.all(expenses.map(async (exp) => {
        try {
          const r = await api.checkExpenseMove(exp.id, targetScope);
          results[exp.id] = r.needsRemap;
        } catch { results[exp.id] = false; }
      }));
      setChecks(results);
      setLoading(false);
    }
    void checkAll();
  }, [expenses, targetScope]);

  async function handleMove() {
    for (const exp of expenses) {
      if (checks[exp.id] && !overrides[exp.id]) {
        Alert.alert('Category Required', `Please select a category for "${exp.description}"`);
        return;
      }
    }
    setSaving(true);
    try {
      const moved: Expense[] = [];
      for (const exp of expenses) {
        const res = await api.moveExpense(exp.id, { targetScope, targetCategoryId: overrides[exp.id] || undefined });
        moved.push(res.expense);
      }
      onMoved(moved);
    } catch {
      Alert.alert('Error', 'Failed to move some expenses.');
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Move to {targetScope}</Text>
          {loading ? <ActivityIndicator size="small" color={colors.primary[400]} style={{ marginVertical: 16 }} /> : (
            <ScrollView>
              {expenses.map((exp) => (
                <View key={exp.id} style={{ borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '500', color: '#374151', flex: 1 }}>{exp.description}</Text>
                    <Text style={{ color: '#6b7280' }}>{fmtAmt(exp.amount)}</Text>
                  </View>
                  {checks[exp.id] && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, color: '#f59e0b', marginBottom: 4 }}>Category mismatch — select target category:</Text>
                      <ScrollView style={{ maxHeight: 140 }}>
                        {flat.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.catPickerRow, { paddingLeft: (c.level - 1) * 12 }]}
                            onPress={() => setOverrides({ ...overrides, [exp.id]: c.id })}
                          >
                            <Text style={styles.catPickerName}>{c.name}</Text>
                            {overrides[exp.id] === c.id && <Ionicons name="checkmark" size={16} color={colors.primary[400]} />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
          <View style={[styles.modalActions, { marginTop: 8 }]}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleMove} disabled={saving || loading}>
              {saving ? <ActivityIndicator size="small" color={colors.text.inverse} /> : <Text style={styles.saveBtnText}>Move</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Date View ─────────────────────────────────────────────────────────────────

function DateView({
  expenses, allCats, pendingIds, selectedIds, onToggleSelect, onEdit,
}: {
  expenses: Expense[];
  allCats: ExpenseCategory[];
  pendingIds: Set<string>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (e: Expense) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const byDate = expenses.reduce<Record<string, Expense[]>>((acc, exp) => {
    const d = exp.expenseDate.slice(0, 10);
    if (!acc[d]) acc[d] = [];
    acc[d].push(exp);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) return <Text style={{ color: '#9ca3af', textAlign: 'center', marginTop: 32 }}>No expenses this month.</Text>;

  return (
    <View>
      {dates.map((date) => {
        const dayExps = byDate[date];
        const dayTotal = dayExps.reduce((s, e) => s + e.amount, 0);
        const isOpen = !collapsed.has(date);
        const label = new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

        return (
          <View key={date} style={{ marginBottom: 8, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#f3f4f6' }}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9fafb', paddingHorizontal: 14, paddingVertical: 10 }}
              onPress={() => setCollapsed((s) => { const n = new Set(s); isOpen ? n.add(date) : n.delete(date); return n; })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.text.subtle} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151' }}>{label}</Text>
                <Text style={{ fontSize: 11, color: '#d1d5db' }}>({dayExps.length})</Text>
              </View>
              <Text style={{ fontWeight: '600', color: '#1f2937' }}>{fmtAmt(dayTotal)}</Text>
            </Pressable>
            {isOpen && dayExps.map((exp) => (
              <Pressable
                key={exp.id}
                style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f9fafb', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                onPress={() => onEdit(exp)}
                onLongPress={() => onToggleSelect(exp.id)}
              >
                {selectedIds.size > 0 && (
                  <Ionicons
                    name={selectedIds.has(exp.id) ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={selectedIds.has(exp.id) ? '#60a5fa' : '#d1d5db'}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', flex: 1 }} numberOfLines={1}>{exp.description}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {pendingIds.has(exp.id) && <Ionicons name="warning" size={12} color="#f59e0b" />}
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#1f2937' }}>{fmtAmt(exp.amount)}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }} numberOfLines={1}>
                    {categoryPath(exp.categoryId, allCats)}
                    {exp.business ? ` · ${exp.business}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ── Category View ─────────────────────────────────────────────────────────────

function CatNode({
  node, expenses, allCats, budgets, pendingIds, selectedIds, onToggleSelect, onEdit, depth,
}: {
  node: ExpenseCategory; expenses: Expense[]; allCats: ExpenseCategory[];
  budgets: { categoryId: string; amount: number }[];
  pendingIds: Set<string>; selectedIds: Set<string>;
  onToggleSelect: (id: string) => void; onEdit: (e: Expense) => void; depth: number;
}) {
  const [open, setOpen] = useState(false);

  function collectAll(n: ExpenseCategory): Expense[] {
    return [...expenses.filter((e) => e.categoryId === n.id), ...(n.children ?? []).flatMap(collectAll)];
  }
  const allExps = collectAll(node);
  const directExps = expenses.filter((e) => e.categoryId === node.id);
  const totalSpent = allExps.reduce((s, e) => s + e.amount, 0);
  const budget = budgets.find((b) => b.categoryId === node.id)?.amount ?? 0;
  const pct = budget > 0 ? Math.min(100, (totalSpent / budget) * 100) : 0;
  const barColor = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#34d399';

  const iconName = node.iconName ? (SYSTEM_CAT_ICONS[node.iconName] ?? 'apps') : 'apps';

  return (
    <View>
      <Pressable
        style={[styles.catRow, { paddingLeft: 14 + depth * 14 }]}
        onPress={() => setOpen((o) => !o)}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={13} color="#d1d5db" />
        <Ionicons name={iconName as never} size={15} color={colors.primary[400]} style={{ marginHorizontal: 4 }} />
        <Text style={styles.catRowName} numberOfLines={1}>{node.name}</Text>
        {budget > 0 && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <View style={{ width: 60, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: 4, backgroundColor: barColor }} />
            </View>
            <Text style={{ fontSize: 11, color: '#6b7280', width: 72, textAlign: 'right' }}>
              {fmtAmt(totalSpent)}/{fmtAmt(budget)}
            </Text>
          </View>
        )}
        {budget === 0 && totalSpent > 0 && (
          <Text style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>{fmtAmt(totalSpent)}</Text>
        )}
      </Pressable>

      {open && (
        <View>
          {(node.children ?? []).map((child) => (
            <CatNode key={child.id} node={child} expenses={expenses} allCats={allCats} budgets={budgets}
              pendingIds={pendingIds} selectedIds={selectedIds} onToggleSelect={onToggleSelect} onEdit={onEdit} depth={depth + 1} />
          ))}
          {directExps.map((exp) => (
            <Pressable
              key={exp.id}
              style={[styles.expRow, { paddingLeft: 28 + depth * 14 }]}
              onPress={() => onEdit(exp)}
              onLongPress={() => onToggleSelect(exp.id)}
            >
              {selectedIds.size > 0 && (
                <Ionicons name={selectedIds.has(exp.id) ? 'checkbox' : 'square-outline'} size={16} color={selectedIds.has(exp.id) ? '#60a5fa' : '#d1d5db'} />
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', flex: 1 }} numberOfLines={1}>{exp.description}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {pendingIds.has(exp.id) && <Ionicons name="warning" size={12} color="#f59e0b" />}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1f2937' }}>{fmtAmt(exp.amount)}</Text>
                  </View>
                </View>
                {exp.business && <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{exp.business}</Text>}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function CategoryView({
  categories, expenses, budgets, pendingIds, selectedIds, onToggleSelect, onEdit,
}: {
  categories: ExpenseCategory[]; expenses: Expense[];
  budgets: { categoryId: string; amount: number }[];
  pendingIds: Set<string>; selectedIds: Set<string>;
  onToggleSelect: (id: string) => void; onEdit: (e: Expense) => void;
}) {
  if (categories.length === 0) return <Text style={{ color: '#9ca3af', textAlign: 'center', marginTop: 32 }}>No categories loaded.</Text>;
  return (
    <View style={{ borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 10, overflow: 'hidden' }}>
      {categories.map((cat, i) => (
        <View key={cat.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: '#f3f4f6' } : {}}>
          <CatNode node={cat} expenses={expenses} allCats={categories} budgets={budgets}
            pendingIds={pendingIds} selectedIds={selectedIds} onToggleSelect={onToggleSelect} onEdit={onEdit} depth={0} />
        </View>
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const { user } = useAuthStore.getState();
  const household = useHouseholdStore((s) => s.household);
  const router = useRouter();

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
  const [month, setMonth] = useState(currentYM());
  const [viewMode, setViewMode] = useState<'date' | 'category'>('date');
  const [showAdd, setShowAdd] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMove, setShowMove] = useState(false);

  const expenses = scope === 'personal' ? personalExpenses : householdExpenses;
  const categories = scope === 'personal' ? personalCategories : householdCategories;
  const budgets = scope === 'personal' ? personalBudgets : householdBudgets;
  const targetScope: ExpenseScope = scope === 'personal' ? 'household' : 'personal';
  const targetCats = targetScope === 'personal' ? personalCategories : householdCategories;

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
      /* offline — keep cached */
    }
  }, [scope, month, setPersonalCategories, setHouseholdCategories, setPersonalBudgets, setHouseholdBudgets, setPersonalExpenses, setHouseholdExpenses]);

  useEffect(() => {
    void loadAll();
    return wsClient.on('expenses:changed', () => void loadAll());
  }, [loadAll]);

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const pct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
  const barColor = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#34d399';

  function toggleSelect(id: string) {
    setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleSaved(expense: Expense) {
    if (scope === 'personal') {
      const exists = personalExpenses.some((e) => e.id === expense.id);
      setPersonalExpenses(exists ? personalExpenses.map((e) => e.id === expense.id ? expense : e) : [expense, ...personalExpenses]);
    } else {
      const exists = householdExpenses.some((e) => e.id === expense.id);
      setHouseholdExpenses(exists ? householdExpenses.map((e) => e.id === expense.id ? expense : e) : [expense, ...householdExpenses]);
    }
    setShowAdd(false);
    setEditExpense(null);
  }

  function handleDeleted(id: string) {
    if (scope === 'personal') setPersonalExpenses(personalExpenses.filter((e) => e.id !== id));
    else setHouseholdExpenses(householdExpenses.filter((e) => e.id !== id));
    setEditExpense(null);
  }

  function handleMoved(moved: Expense[]) {
    const ids = new Set(moved.map((e) => e.id));
    if (scope === 'personal') setPersonalExpenses(personalExpenses.filter((e) => !ids.has(e.id)));
    else setHouseholdExpenses(householdExpenses.filter((e) => !ids.has(e.id)));
    setSelectedIds(new Set());
    setShowMove(false);
    void loadAll();
  }

  const selectedExpenses = expenses.filter((e) => selectedIds.has(e.id));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Expenses</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => router.push('/expenses/categories')}>
            <Ionicons name="list" size={22} color={colors.primary[400]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/expenses/budget')}>
            <Ionicons name="wallet-outline" size={22} color={colors.primary[400]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Scope tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, scope === 'personal' && styles.tabActive]}
          onPress={() => { setScope('personal'); setSelectedIds(new Set()); }}
        >
          <Text style={[styles.tabText, scope === 'personal' && styles.tabTextActive]}>Personal</Text>
        </Pressable>
        {household && (
          <Pressable
            style={[styles.tab, scope === 'household' && styles.tabActive]}
            onPress={() => { setScope('household'); setSelectedIds(new Set()); }}
          >
            <Text style={[styles.tabText, scope === 'household' && styles.tabTextActive]}>Household</Text>
          </Pressable>
        )}
      </View>

      {/* Month navigator */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setMonth(prevMonth(month))} style={styles.monthBtn}>
          <Text style={styles.monthBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{formatMonth(month)}</Text>
        <TouchableOpacity onPress={() => setMonth(nextMonth(month))} style={styles.monthBtn}>
          <Text style={styles.monthBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 13, color: '#6b7280' }}>Spent this month</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#1f2937' }}>
            {fmtAmt(totalSpent)}{totalBudget > 0 && <Text style={{ color: '#9ca3af', fontWeight: '400' }}> / {fmtAmt(totalBudget)}</Text>}
          </Text>
        </View>
        {totalBudget > 0 && (
          <View style={{ height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: 4, backgroundColor: barColor }} />
          </View>
        )}
      </View>

      {/* View toggle + Move toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.toggleGroup}>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'date' && styles.toggleBtnActive]}
            onPress={() => setViewMode('date')}
          >
            <Text style={[styles.toggleBtnText, viewMode === 'date' && styles.toggleBtnTextActive]}>Date</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'category' && styles.toggleBtnActive]}
            onPress={() => setViewMode('category')}
          >
            <Text style={[styles.toggleBtnText, viewMode === 'category' && styles.toggleBtnTextActive]}>Category</Text>
          </Pressable>
        </View>
        {selectedIds.size > 0 && household && (
          <TouchableOpacity style={styles.moveBtn} onPress={() => setShowMove(true)}>
            <Ionicons name="swap-horizontal" size={14} color="#6366f1" />
            <Text style={{ fontSize: 12, color: '#6366f1', fontWeight: '500' }}>Move {selectedIds.size}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {viewMode === 'date' ? (
          <DateView
            expenses={expenses}
            allCats={categories}
            pendingIds={pendingSyncIds}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEdit={setEditExpense}
          />
        ) : (
          <CategoryView
            categories={categories}
            expenses={expenses}
            budgets={budgets.map((b) => ({ categoryId: b.categoryId, amount: b.amount }))}
            pendingIds={pendingSyncIds}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEdit={setEditExpense}
          />
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Ionicons name="add" size={28} color={colors.text.inverse} />
      </TouchableOpacity>

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

      {/* Suppress unused warning */}
      {user && null}
    </View>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: colors.background.canvas },
  header:               { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.base, paddingTop: 56, paddingBottom: spacing.md, backgroundColor: colors.background.surface },
  headerTitle:          { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: colors.text.default },
  tabBar:               { flexDirection: 'row', paddingHorizontal: spacing.base, paddingVertical: spacing.xs, backgroundColor: colors.background.surface, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  tab:                  { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.pill, marginRight: spacing.xs },
  tabActive:            { backgroundColor: colors.primary[50] },
  tabText:              { fontSize: typography.fontSize.md, color: colors.text.subtle, fontWeight: typography.fontWeight.medium },
  tabTextActive:        { color: colors.primary[400] },
  monthNav:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, backgroundColor: colors.background.surface },
  monthBtn:             { paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  monthBtnText:         { fontSize: typography.fontSize.lg, color: colors.text.subtle },
  monthLabel:           { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.neutral[700], width: 160, textAlign: 'center' },
  summary:              { margin: spacing.base, padding: spacing.md, backgroundColor: colors.background.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border.subtle },
  toolbar:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingBottom: spacing.md, gap: spacing.xs },
  toggleGroup:          { flexDirection: 'row', backgroundColor: colors.neutral[100], borderRadius: borderRadius.md, padding: 2 },
  toggleBtn:            { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  toggleBtnActive:      { backgroundColor: colors.background.surface, ...shadows.sm },
  toggleBtnText:        { fontSize: typography.fontSize['2xs'], color: colors.text.subtle, fontWeight: typography.fontWeight.medium },
  toggleBtnTextActive:  { color: colors.neutral[700] },
  moveBtn:              { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: '#e0e7ff', borderRadius: borderRadius.md, backgroundColor: '#eef2ff' },
  fab:                  { position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary[400], alignItems: 'center', justifyContent: 'center', ...shadows.md },
  catRow:               { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingRight: spacing.md, backgroundColor: colors.background.surface },
  catRowName:           { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium, color: colors.neutral[700], flex: 1 },
  expRow:               { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, paddingRight: spacing.md, backgroundColor: colors.background.surfaceSubtle, borderTopWidth: 1, borderTopColor: colors.background.canvas, gap: spacing.xs },
  // Modal styles
  overlay:              { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:                { backgroundColor: colors.background.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.lg, maxHeight: '85%' as any },
  sheetTitle:           { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, color: colors.text.default, marginBottom: spacing.base },
  label:                { fontSize: typography.fontSize['2xs'], color: colors.text.muted, marginBottom: spacing.xs, marginTop: spacing.md },
  input:                { borderWidth: 1, borderColor: colors.border.soft, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, fontSize: typography.fontSize.md, color: colors.text.default },
  pickerBtn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border.soft, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pickerBtnText:        { fontSize: typography.fontSize.md, color: colors.text.default },
  pickerBtnPlaceholder: { fontSize: typography.fontSize.md, color: colors.text.subtle },
  catPickerRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.background.canvas },
  catPickerName:        { fontSize: typography.fontSize.md, color: colors.neutral[700], flex: 1 },
  modalActions:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.base },
  cancelBtn:            { paddingHorizontal: spacing.base, paddingVertical: spacing.xs, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border.soft },
  cancelBtnText:        { fontSize: typography.fontSize.md, color: colors.text.muted },
  saveBtn:              { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: borderRadius.md, backgroundColor: colors.primary[400] },
  saveBtnText:          { fontSize: typography.fontSize.md, color: colors.text.inverse, fontWeight: typography.fontWeight.semibold },
});
