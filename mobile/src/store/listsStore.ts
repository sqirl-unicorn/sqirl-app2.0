/**
 * Mobile lists store — zustand store for shopping lists and todo lists.
 *
 * In-memory only. Offline-first SQLite queue to be added once expo-sqlite
 * schema migrations are defined.
 */

import { create } from 'zustand';
import type { ShoppingList, ListItem, TodoTask } from '../lib/api';

interface ListsState {
  lists: ShoppingList[];
  activeListId: string | null;
  items: ListItem[];
  tasks: TodoTask[];
  loading: boolean;
  error: string | null;

  setLists(lists: ShoppingList[]): void;
  setActiveListId(id: string | null): void;
  setItems(items: ListItem[]): void;
  setTasks(tasks: TodoTask[]): void;
  setLoading(v: boolean): void;
  setError(e: string | null): void;
}

export const useListsStore = create<ListsState>((set) => ({
  lists: [],
  activeListId: null,
  items: [],
  tasks: [],
  loading: false,
  error: null,

  setLists: (lists) => set({ lists }),
  setActiveListId: (id) => set({ activeListId: id }),
  setItems: (items) => set({ items }),
  setTasks: (tasks) => set({ tasks }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
}));
