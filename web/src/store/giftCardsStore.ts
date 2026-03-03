/**
 * Gift Cards store — zustand store for household gift cards and transactions.
 *
 * Holds the full list of gift cards (active + archived), the currently
 * selected card's transaction history, and loading/error state.
 * Polls every 30 s to keep all household members in sync.
 *
 * No persistence — re-fetched on mount.
 * Future: offline queue via IndexedDB for full offline-first support.
 */

import { create } from 'zustand';
import type { GiftCard, GiftCardTransaction } from '@sqirl/shared';

interface GiftCardsState {
  cards: GiftCard[];
  activeCardId: string | null;
  transactions: GiftCardTransaction[];
  loading: boolean;
  error: string | null;

  setCards(cards: GiftCard[]): void;
  setActiveCardId(id: string | null): void;
  setTransactions(txns: GiftCardTransaction[]): void;
  setLoading(v: boolean): void;
  setError(e: string | null): void;
}

export const useGiftCardsStore = create<GiftCardsState>((set) => ({
  cards: [],
  activeCardId: null,
  transactions: [],
  loading: false,
  error: null,

  setCards: (cards) => set({ cards }),
  setActiveCardId: (id) => set({ activeCardId: id }),
  setTransactions: (transactions) => set({ transactions }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
}));
