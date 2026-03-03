/**
 * Layout Component — sqirl-app2
 *
 * Wraps all authenticated pages with responsive navigation:
 * - Desktop (lg+): Floating SideNav panel on the left
 * - Mobile (<lg): Top header with hamburger button that opens MobileNav drawer
 *
 * Content area is offset to account for the nav on each breakpoint.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SideNav } from './SideNav';
import { MobileNav } from './MobileNav';
import { NotificationsBell } from './NotificationsBell';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Desktop: floating side nav — hidden on mobile */}
      <div className="hidden lg:block">
        <SideNav />
      </div>

      {/* Mobile: slide-in hamburger drawer — hidden on desktop */}
      <MobileNav open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Mobile top header — hidden on desktop */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
        {/* Hamburger button */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-1"
        >
          <span className="text-lg font-bold text-primary-500">Sqirl</span>
        </button>

        {/* Notifications bell (mobile header) */}
        <div className="flex items-center">
          <div className="bg-primary-500 rounded-xl p-1">
            <NotificationsBell />
          </div>
        </div>
      </header>

      {/* Main content — top padding on mobile for header, left margin on desktop for SideNav */}
      <main className="pt-14 lg:pt-0 lg:ml-24 min-h-screen">
        {children}
      </main>
    </div>
  );
}

export default Layout;
