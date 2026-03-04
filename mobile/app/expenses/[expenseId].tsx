/**
 * Expense detail / edit screen — dynamic route /expenses/:expenseId.
 * Full form with all fields; delete action via header button.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useExpensesStore } from '../../src/store/expensesStore';
import type { Expense, ExpenseCategory, ExpenseScope } from '@sqirl/shared';

function flattenTree(cats: ExpenseCategory[]): ExpenseCategory[] {
  const out: ExpenseCategory[] = [];
  function walk(n: ExpenseCategory[]) {
    for (const c of n) { out.push(c); if (c.children) walk(c.children); }
  }
  walk(cats);
  return out;
}

export default function ExpenseDetailScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const router = useRouter();

  const { personalExpenses, householdExpenses, personalCategories, householdCategories,
    setPersonalExpenses, setHouseholdExpenses } = useExpensesStore();

  // Find the expense in either scope
  const personal = personalExpenses.find((e) => e.id === expenseId);
  const household = householdExpenses.find((e) => e.id === expenseId);
  const initial = personal ?? household;
  const scope: ExpenseScope = household ? 'household' : 'personal';
  const categories = scope === 'personal' ? personalCategories : householdCategories;
  const flat = flattenTree(categories);

  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '');
  const [expenseDate, setExpenseDate] = useState(initial?.expenseDate ?? new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [business, setBusiness] = useState(initial?.business ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  const selectedCat = flat.find((c) => c.id === categoryId);

  const removeFromStore = useCallback((id: string) => {
    if (scope === 'personal') setPersonalExpenses(personalExpenses.filter((e) => e.id !== id));
    else setHouseholdExpenses(householdExpenses.filter((e) => e.id !== id));
  }, [scope, personalExpenses, householdExpenses, setPersonalExpenses, setHouseholdExpenses]);

  const updateInStore = useCallback((updated: Expense) => {
    if (scope === 'personal') {
      setPersonalExpenses(personalExpenses.map((e) => e.id === updated.id ? updated : e));
    } else {
      setHouseholdExpenses(householdExpenses.map((e) => e.id === updated.id ? updated : e));
    }
  }, [scope, personalExpenses, householdExpenses, setPersonalExpenses, setHouseholdExpenses]);

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
    if (!expenseId) return;
    setSaving(true);
    try {
      const res = await api.updateExpense(expenseId, {
        categoryId,
        amount: amtNum,
        description: description.trim(),
        expenseDate,
        business: business || null,
        location: location || null,
        notes: notes || null,
      });
      updateInStore(res.expense);
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!expenseId) return;
    Alert.alert('Delete Expense', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteExpense(expenseId);
            removeFromStore(expenseId);
            router.back();
          } catch {
            Alert.alert('Error', 'Failed to delete expense.');
          }
        },
      },
    ]);
  }

  if (!initial) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#9ca3af' }}>Expense not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <Text style={styles.label}>Description *</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Weekly groceries"
        />

        <Text style={styles.label}>Amount *</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />

        <Text style={styles.label}>Date *</Text>
        <TextInput
          style={styles.input}
          value={expenseDate}
          onChangeText={setExpenseDate}
          placeholder="YYYY-MM-DD"
        />

        <Text style={styles.label}>Category *</Text>
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowCatPicker(true)}>
          <Text style={categoryId ? styles.pickerText : styles.pickerPlaceholder}>
            {selectedCat ? selectedCat.name : 'Select category…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9ca3af" />
        </TouchableOpacity>

        {showCatPicker && (
          <View style={styles.catList}>
            {flat.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.catRow, { paddingLeft: 12 + (c.level - 1) * 16 }]}
                onPress={() => { setCategoryId(c.id); setShowCatPicker(false); }}
              >
                <Text style={styles.catRowText}>{c.name}</Text>
                {c.id === categoryId && <Ionicons name="checkmark" size={16} color="#60a5fa" />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Business</Text>
        <TextInput
          style={styles.input}
          value={business}
          onChangeText={setBusiness}
          placeholder="e.g. Woolworths"
        />

        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Bondi Junction"
        />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Optional notes…"
        />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>Save Changes</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f9fafb' },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label:            { fontSize: 12, color: '#6b7280', marginBottom: 4, marginTop: 14 },
  input:            { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1f2937', backgroundColor: '#fff' },
  pickerBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pickerText:       { fontSize: 14, color: '#1f2937' },
  pickerPlaceholder:{ fontSize: 14, color: '#9ca3af' },
  catList:          { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginTop: 4, backgroundColor: '#fff', maxHeight: 200 },
  catRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  catRowText:       { fontSize: 14, color: '#374151' },
  saveBtn:          { backgroundColor: '#60a5fa', borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:      { color: '#fff', fontSize: 15, fontWeight: '600' },
  deleteBtn:        { borderWidth: 1, borderColor: '#fca5a5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText:    { color: '#ef4444', fontSize: 15, fontWeight: '500' },
});
