/**
 * Mobile expenses store — mirrors the web expensesStore pattern.
 * In-memory only (no SQLite persistence this sprint).
 * pendingSyncIds tracks mutations not yet confirmed by the server.
 */

import { create } from 'zustand';
import type { ExpenseCategory, ExpenseBudget, Expense } from '@sqirl/shared';

interface ExpensesState {
  personalCategories: ExpenseCategory[];
  householdCategories: ExpenseCategory[];
  personalBudgets: ExpenseBudget[];
  householdBudgets: ExpenseBudget[];
  personalExpenses: Expense[];
  householdExpenses: Expense[];
  pendingSyncIds: Set<string>;
  loading: boolean;
  error: string | null;

  setPersonalCategories: (cats: ExpenseCategory[]) => void;
  setHouseholdCategories: (cats: ExpenseCategory[]) => void;
  setPersonalBudgets: (b: ExpenseBudget[]) => void;
  setHouseholdBudgets: (b: ExpenseBudget[]) => void;
  setPersonalExpenses: (e: Expense[]) => void;
  setHouseholdExpenses: (e: Expense[]) => void;
  addPendingSync: (id: string) => void;
  removePendingSync: (id: string) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

export const useExpensesStore = create<ExpensesState>((set) => ({
  personalCategories: [],
  householdCategories: [],
  personalBudgets: [],
  householdBudgets: [],
  personalExpenses: [],
  householdExpenses: [],
  pendingSyncIds: new Set(),
  loading: false,
  error: null,

  setPersonalCategories: (cats) => set({ personalCategories: cats }),
  setHouseholdCategories: (cats) => set({ householdCategories: cats }),
  setPersonalBudgets: (b) => set({ personalBudgets: b }),
  setHouseholdBudgets: (b) => set({ householdBudgets: b }),
  setPersonalExpenses: (e) => set({ personalExpenses: e }),
  setHouseholdExpenses: (e) => set({ householdExpenses: e }),

  addPendingSync: (id) =>
    set((s) => {
      const n = new Set(s.pendingSyncIds);
      n.add(id);
      return { pendingSyncIds: n };
    }),

  removePendingSync: (id) =>
    set((s) => {
      const n = new Set(s.pendingSyncIds);
      n.delete(id);
      return { pendingSyncIds: n };
    }),

  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
}));
