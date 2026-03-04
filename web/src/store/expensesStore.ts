/**
 * Expenses store — in-memory state for personal and household expenses.
 *
 * Holds categories, budgets, and expenses for the active scope/month.
 * pendingSyncIds tracks local mutations not yet confirmed by the server
 * (visual-only this sprint; no persistence across page refresh).
 *
 * Offline pattern:
 *   1. Optimistically apply change to store + add clientId to pendingSyncIds
 *   2. On API success: replace temp record with server response, remove from pending
 *   3. On API failure: keep in store as pending (displayed with sync indicator)
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
  /** IDs of records not yet confirmed by the server (current session only). */
  pendingSyncIds: Set<string>;
  loading: boolean;
  error: string | null;

  setPersonalCategories: (cats: ExpenseCategory[]) => void;
  setHouseholdCategories: (cats: ExpenseCategory[]) => void;
  setPersonalBudgets: (budgets: ExpenseBudget[]) => void;
  setHouseholdBudgets: (budgets: ExpenseBudget[]) => void;
  setPersonalExpenses: (expenses: Expense[]) => void;
  setHouseholdExpenses: (expenses: Expense[]) => void;
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
  setPersonalBudgets: (budgets) => set({ personalBudgets: budgets }),
  setHouseholdBudgets: (budgets) => set({ householdBudgets: budgets }),
  setPersonalExpenses: (expenses) => set({ personalExpenses: expenses }),
  setHouseholdExpenses: (expenses) => set({ householdExpenses: expenses }),

  addPendingSync: (id) =>
    set((s) => {
      const next = new Set(s.pendingSyncIds);
      next.add(id);
      return { pendingSyncIds: next };
    }),

  removePendingSync: (id) =>
    set((s) => {
      const next = new Set(s.pendingSyncIds);
      next.delete(id);
      return { pendingSyncIds: next };
    }),

  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
}));
