/**
 * Budget management screen — mobile.
 * Month selector, scope tabs, flat category list with inline budget editing.
 * Carry Forward copies last month's budgets (only fills missing values).
 * Household budgets are owner-only.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/authStore';
import { useHouseholdStore } from '../../src/store/householdStore';
import { useExpensesStore } from '../../src/store/expensesStore';
import { colors, typography, spacing, borderRadius } from '../../constants/designTokens';
import { analytics } from '../../src/lib/analyticsService';
import type { ExpenseCategory, ExpenseBudget, ExpenseScope } from '@sqirl/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenTree(cats: ExpenseCategory[]): ExpenseCategory[] {
  const out: ExpenseCategory[] = [];
  function walk(n: ExpenseCategory[]) {
    for (const c of n) { out.push(c); if (c.children) walk(c.children); }
  }
  walk(cats);
  return out;
}

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const { user } = useAuthStore.getState();
  const household = useHouseholdStore((s) => s.household);
  const { personalCategories, householdCategories,
    personalBudgets, householdBudgets,
    setPersonalBudgets, setHouseholdBudgets } = useExpensesStore();

  const [scope, setScope] = useState<ExpenseScope>('personal');
  const [month, setMonth] = useState(currentYM());
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [carrying, setCarrying] = useState(false);

  const member = household?.members.find((m) => m.userId === user?.id);
  const isOwner = member?.role === 'owner';
  const canManage = scope === 'personal' || (scope === 'household' && isOwner);

  const categories = flattenTree(scope === 'personal' ? personalCategories : householdCategories);
  const budgets: ExpenseBudget[] = scope === 'personal' ? personalBudgets : householdBudgets;
  const budgetMap = new Map(budgets.map((b) => [b.categoryId, b]));

  const load = useCallback(async () => {
    try {
      const res = await api.getExpenseBudgets(scope, month);
      scope === 'personal'
        ? setPersonalBudgets(res.budgets)
        : setHouseholdBudgets(res.budgets);
    } catch {
      /* offline — keep cached */
    }
  }, [scope, month, setPersonalBudgets, setHouseholdBudgets]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(cat: ExpenseCategory) {
    const raw = editAmounts[cat.id] ?? '';
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid Amount', 'Budget amount must be non-negative.');
      return;
    }
    setSaving((s) => ({ ...s, [cat.id]: true }));
    try {
      const res = await api.setExpenseBudget(cat.id, { scope, budgetMonth: month, amount });
      const updated = res.budget;
      const existing = budgets.some((b) => b.categoryId === cat.id);
      const newBudgets = existing
        ? budgets.map((b) => b.categoryId === cat.id ? updated : b)
        : [...budgets, updated];
      scope === 'personal' ? setPersonalBudgets(newBudgets) : setHouseholdBudgets(newBudgets);
      analytics.track('expense.budget_set', { categoryId: cat.id, scope, budgetMonth: month, amount });
      setEditAmounts((a) => { const n = { ...a }; delete n[cat.id]; return n; });
    } catch {
      Alert.alert('Error', 'Failed to save budget.');
    } finally {
      setSaving((s) => ({ ...s, [cat.id]: false }));
    }
  }

  async function handleCarryForward() {
    setCarrying(true);
    try {
      await api.carryForwardExpenseBudgets({ scope, fromMonth: prevMonth(month), toMonth: month });
      analytics.track('expense.budget_carry_forward', { scope, toMonth: month });
      await load();
    } catch {
      Alert.alert('Error', 'Failed to carry forward budgets.');
    } finally {
      setCarrying(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Scope tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, scope === 'personal' && styles.tabActive]}
          onPress={() => setScope('personal')}
        >
          <Text style={[styles.tabText, scope === 'personal' && styles.tabTextActive]}>Personal</Text>
        </Pressable>
        {household && (
          <Pressable
            style={[styles.tab, scope === 'household' && styles.tabActive]}
            onPress={() => setScope('household')}
          >
            <Text style={[styles.tabText, scope === 'household' && styles.tabTextActive]}>Household</Text>
          </Pressable>
        )}
      </View>

      {/* Month navigator */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setMonth(prevMonth(month))} style={styles.monthBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text.subtle} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{formatMonth(month)}</Text>
        <TouchableOpacity onPress={() => setMonth(nextMonth(month))} style={styles.monthBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
        </TouchableOpacity>
      </View>

      {scope === 'household' && !isOwner && (
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={16} color="#d97706" />
          <Text style={styles.infoBannerText}>Only household owners can set household budgets.</Text>
        </View>
      )}

      {/* Carry forward */}
      {canManage && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <TouchableOpacity
            style={styles.carryBtn}
            onPress={handleCarryForward}
            disabled={carrying}
          >
            {carrying
              ? <ActivityIndicator size="small" color={colors.text.muted} />
              : <Ionicons name="arrow-forward" size={14} color={colors.text.muted} />
            }
            <Text style={styles.carryBtnText}>Carry Forward from Previous Month</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Category budget table */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 1 }]}>Category</Text>
            <Text style={[styles.headerCell, { width: 100, textAlign: 'right' }]}>Budget</Text>
            {canManage && <View style={{ width: 52 }} />}
          </View>

          {categories.map((cat, i) => {
            const existing = budgetMap.get(cat.id);
            const displayAmt = editAmounts[cat.id] !== undefined
              ? editAmounts[cat.id]
              : existing ? existing.amount.toString() : '';
            const isDirty = editAmounts[cat.id] !== undefined;

            return (
              <View
                key={cat.id}
                style={[styles.tableRow, i > 0 && styles.rowBorder]}
              >
                <Text
                  style={[styles.catName, { paddingLeft: (cat.level - 1) * 12 }]}
                  numberOfLines={1}
                >
                  {cat.name}
                </Text>
                {canManage ? (
                  <TextInput
                    style={styles.amtInput}
                    value={displayAmt}
                    onChangeText={(v) => setEditAmounts((a) => ({ ...a, [cat.id]: v }))}
                    onSubmitEditing={() => void handleSave(cat)}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    returnKeyType="done"
                  />
                ) : (
                  <Text style={styles.amtReadonly}>
                    {existing ? `$${Number(existing.amount).toFixed(2)}` : '—'}
                  </Text>
                )}
                {canManage && (
                  <View style={{ width: 52, alignItems: 'flex-end' }}>
                    {isDirty && (
                      <TouchableOpacity
                        style={styles.saveRowBtn}
                        onPress={() => void handleSave(cat)}
                        disabled={saving[cat.id]}
                      >
                        {saving[cat.id]
                          ? <ActivityIndicator size="small" color={colors.text.inverse} />
                          : <Text style={styles.saveRowBtnText}>Save</Text>
                        }
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {categories.length === 0 && (
            <Text style={{ color: '#9ca3af', textAlign: 'center', padding: 24 }}>
              No categories loaded.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.background.canvas },
  tabBar:         { flexDirection: 'row', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.background.surface, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  tab:            { paddingHorizontal: spacing.base, paddingVertical: spacing.xs, borderRadius: borderRadius.pill, marginRight: spacing.xs },
  tabActive:      { backgroundColor: colors.primary[50] },
  tabText:        { fontSize: typography.fontSize.md, color: colors.text.subtle, fontWeight: typography.fontWeight.medium },
  tabTextActive:  { color: colors.primary[400] },
  monthNav:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, backgroundColor: colors.background.surface, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  monthBtn:       { paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  monthLabel:     { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text.default, width: 180, textAlign: 'center' },
  infoBanner:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, margin: spacing.md, padding: spacing.md, backgroundColor: '#fffbeb', borderRadius: borderRadius.md, borderWidth: 1, borderColor: '#fde68a' },
  infoBannerText: { fontSize: typography.fontSize.sm, color: '#92400e', flex: 1 },
  carryBtn:       { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border.soft, borderRadius: borderRadius.md, backgroundColor: colors.background.surface },
  carryBtnText:   { fontSize: typography.fontSize.sm, color: colors.text.muted },
  card:           { backgroundColor: colors.background.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border.subtle, overflow: 'hidden', marginBottom: spacing.base },
  tableHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.background.canvas, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  headerCell:     { fontSize: typography.fontSize['2xs'], color: colors.text.subtle, fontWeight: typography.fontWeight.medium },
  tableRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowBorder:      { borderTopWidth: 1, borderTopColor: colors.background.canvas },
  catName:        { flex: 1, fontSize: typography.fontSize.sm, color: colors.text.default },
  amtInput:       { width: 100, textAlign: 'right', borderWidth: 1, borderColor: colors.border.soft, borderRadius: borderRadius.sm, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs / 2, fontSize: typography.fontSize.sm, color: colors.text.default },
  amtReadonly:    { width: 100, textAlign: 'right', fontSize: typography.fontSize.sm, color: colors.text.muted },
  saveRowBtn:     { backgroundColor: colors.primary[400], borderRadius: borderRadius.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs / 2 },
  saveRowBtnText: { fontSize: typography.fontSize.xs, color: colors.text.inverse, fontWeight: typography.fontWeight.semibold },
});
