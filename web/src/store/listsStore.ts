/**
 * Lists store — zustand store for shopping lists and todo lists.
 *
 * Holds all visible lists, the active list's items/tasks, and
 * loading/error state. Polling (every 30 s) provides near-real-time
 * updates for household members without requiring WebSockets.
 *
 * No persistence — lists are re-fetched on mount.
 * Future: offline queue via IndexedDB for full offline-first support.
 */

import { create } from 'zustand';
import type { ShoppingList, ListItem, TodoTask } from '@sqirl/shared';

interface ListsState {
  lists: ShoppingList[];
  activeListId: string | null;
  items: ListItem[];       // items for active shopping/grocery list
  tasks: TodoTask[];       // tasks for active todo list
  loading: boolean;
  error: string | null;

  setLists(lists: ShoppingList[]): void;
  setActiveListId(id: string | null): void;
  setItems(items: ListItem[]): void;
  setTasks(tasks: TodoTask[]): void;
  setLoading(v: boolean): void;
  setError(e: string | null): void;
  clearList(): void;
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
  clearList: () => set({ activeListId: null, items: [], tasks: [] }),
}));
