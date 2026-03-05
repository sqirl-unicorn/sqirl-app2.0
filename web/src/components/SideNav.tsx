/**
 * SideNav Component — sqirl-app2
 *
 * Desktop-only floating side navigation panel (visible on lg+ screens).
 * Icon-only buttons with hover tooltip + submenu flyout.
 *
 * Nav order: Household, Expenses, Lists, Loyalty Cards, Gift Cards, Logout
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { NotificationsBell } from './NotificationsBell';
import { analytics } from '../lib/analyticsService';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

export function SideNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearAuth } = useAuthStore();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const handleLogout = () => {
    analytics.track('auth.logout', {});
    void analytics.flush();
    clearAuth();
    navigate('/login');
  };

  /** Returns true if the given path matches the current route */
  const isActive = (path: string): boolean => {
    if (path === '/dashboard') {
      return location.pathname === '/' ||
             location.pathname === '/dashboard' ||
             location.pathname.startsWith('/list/');
    }
    if (path === '/expenses') return location.pathname === '/expenses';
    if (path === '/expenses/budget') return location.pathname === '/expenses/budget';
    if (path === '/expenses/categories') return location.pathname === '/expenses/categories';
    if (path === '/gift-cards') {
      return location.pathname === '/gift-cards' && !location.pathname.includes('/archived');
    }
    if (path === '/gift-cards/archived') return location.pathname === '/gift-cards/archived';
    if (path === '/household') return location.pathname === '/household';
    if (path === '/household/invite') return location.pathname === '/household/invite';
    if (path === '/invitations') {
      return location.pathname === '/invitations' || location.pathname === '/household/invitations';
    }
    return location.pathname.startsWith(path);
  };

  const navItems: NavItem[] = [
    {
      label: 'Household',
      path: '/household',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      children: [
        {
          label: 'Sent Invites',
          path: '/household/invite',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          ),
        },
        {
          label: 'Received Invites',
          path: '/invitations',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ),
        },
      ],
    },
    {
      label: 'Expenses',
      path: '/expenses',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      children: [
        {
          label: 'Current Expenses',
          path: '/expenses',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          ),
        },
        {
          label: 'Budget',
          path: '/expenses/budget',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          ),
        },
        {
          label: 'Categories',
          path: '/expenses/categories',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          ),
        },
      ],
    },
    {
      label: 'Lists',
      path: '/dashboard',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: 'Loyalty Cards',
      path: '/loyalty-cards',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      label: 'Gift Cards',
      path: '/gift-cards',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      ),
      children: [
        {
          label: 'Active',
          path: '/gift-cards',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          ),
        },
        {
          label: 'Archived',
          path: '/gift-cards/archived',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50">
      <aside className="w-16 bg-gradient-to-b from-primary-500 to-primary-600 rounded-3xl shadow-xl flex flex-col items-center py-4 gap-2">
        <nav className="flex flex-col items-center gap-1 flex-1">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const isHovered = hoveredItem === item.label;
            const hasChildren = item.children && item.children.length > 0;

            return (
              <div
                key={item.label}
                className="relative pr-3"
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <button
                  onClick={() => navigate(item.path)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    active
                      ? 'bg-white text-primary-600 shadow-lg'
                      : 'text-white/80 hover:bg-white/20 hover:text-white'
                  }`}
                  title={item.label}
                >
                  {item.icon}
                </button>

                {/* Tooltip + submenu flyout on hover */}
                {isHovered && (
                  <div className="absolute left-full top-0 z-50">
                    <div className="bg-gray-900 text-white rounded-xl shadow-xl py-2 min-w-[160px]">
                      <button
                        onClick={() => navigate(item.path)}
                        className={`w-full px-4 py-2 text-left text-sm font-medium hover:bg-white/10 ${
                          active ? 'text-primary-300' : ''
                        }`}
                      >
                        {item.label}
                      </button>
                      {hasChildren && (
                        <>
                          <div className="h-px bg-white/20 mx-2 my-1" />
                          {item.children!.map((child) => {
                            const childActive = isActive(child.path);
                            return (
                              <button
                                key={child.path}
                                onClick={() => navigate(child.path)}
                                className={`w-full px-4 py-2 text-left text-sm hover:bg-white/10 flex items-center gap-2 ${
                                  childActive ? 'text-primary-300' : 'text-white/80'
                                }`}
                              >
                                {child.icon}
                                {child.label}
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                    {/* Arrow pointer */}
                    <div className="absolute left-0 top-3 -ml-2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-gray-900" />
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="w-8 h-px bg-white/30 mt-2" />

        {/* Notifications bell */}
        <div className="mt-2">
          <NotificationsBell />
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white transition-all duration-200 mt-2"
          title="Logout"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </aside>
    </div>
  );
}

export default SideNav;
