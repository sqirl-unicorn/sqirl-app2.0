/**
 * NotificationsBell — header bell icon with unread badge and dropdown.
 *
 * Polls unread count on mount and on visibility change.
 * Opens a dropdown list of recent notifications with mark-read actions.
 */

import { useEffect, useRef, useState } from 'react';
import { api, type NotificationResponse } from '../lib/api';
import { useHouseholdStore } from '../store/householdStore';
import * as wsClient from '../lib/wsClient';

export function NotificationsBell() {
  const { unreadCount, setUnreadCount, setNotifications, notifications } = useHouseholdStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load unread count on mount + re-fetch on WS notification event
  useEffect(() => {
    void api.getUnreadCount().then(({ unreadCount: n }) => setUnreadCount(n)).catch(() => {});
    return wsClient.on('notifications:changed', () => {
      void api.getUnreadCount().then(({ unreadCount: n }) => setUnreadCount(n)).catch(() => {});
    });
  }, [setUnreadCount]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleOpen() {
    setOpen((o) => !o);
    if (!open) {
      setLoading(true);
      try {
        const { notifications: notifs } = await api.getNotifications();
        setNotifications(notifs);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleMarkRead(id: string) {
    await api.markNotificationRead(id).catch(() => {});
    setNotifications(notifications.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(Math.max(0, unreadCount - 1));
  }

  async function handleMarkAll() {
    await api.markAllNotificationsRead().catch(() => {});
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => void handleOpen()}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/20 transition-all"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => void handleMarkAll()}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No notifications</div>
            ) : (
              <ul>
                {notifications.map((notif: NotificationResponse) => (
                  <li
                    key={notif.id}
                    className={`px-4 py-3 border-b border-gray-50 last:border-0 flex items-start gap-3 ${
                      !notif.read ? 'bg-primary-50/40' : ''
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      notif.read ? 'bg-gray-200' : 'bg-primary-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{notif.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(notif.createdAt)}</p>
                    </div>
                    {!notif.read && (
                      <button
                        onClick={() => void handleMarkRead(notif.id)}
                        className="flex-shrink-0 text-[10px] text-primary-500 hover:text-primary-700 font-medium"
                      >
                        Read
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
