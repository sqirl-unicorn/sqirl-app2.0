/**
 * Mobile household store — zustand, mirrors web store.
 * No persistence layer yet; SQLite offline queue to be added in sprint 2.
 */

import { create } from 'zustand';
import type { HouseholdResponse, InvitationResponse, NotificationResponse } from '../lib/api';

interface HouseholdState {
  household: HouseholdResponse | null;
  receivedInvitations: InvitationResponse[];
  notifications: NotificationResponse[];
  unreadCount: number;
  setHousehold(h: HouseholdResponse | null): void;
  setReceivedInvitations(invs: InvitationResponse[]): void;
  setNotifications(notifs: NotificationResponse[]): void;
  setUnreadCount(n: number): void;
  clearHousehold(): void;
}

export const useHouseholdStore = create<HouseholdState>((set) => ({
  household: null,
  receivedInvitations: [],
  notifications: [],
  unreadCount: 0,
  setHousehold: (h) => set({ household: h }),
  setReceivedInvitations: (invs) => set({ receivedInvitations: invs }),
  setNotifications: (notifs) => set({ notifications: notifs }),
  setUnreadCount: (n) => set({ unreadCount: n }),
  clearHousehold: () => set({ household: null, receivedInvitations: [] }),
}));
