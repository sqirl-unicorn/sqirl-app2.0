/**
 * Web app root — React Router setup.
 *
 * ProtectedRoute wraps authenticated pages with Layout (side nav + mobile nav).
 * Household pages replace placeholder divs now that they are implemented.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import { Layout } from './components/Layout';
import { useAuthStore } from './store/authStore';
import HouseholdPage from './pages/household/HouseholdPage';
import InvitePage from './pages/household/InvitePage';
import InvitationsPage from './pages/household/InvitationsPage';
import ExitPage from './pages/household/ExitPage';

/** Redirects to /login when the user has no tokens */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const tokens = useAuthStore((s) => s.tokens);
  return tokens ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
}

/** Minimal placeholder used until a real page component is built */
function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-8 text-gray-500 text-lg">
      {title} — coming soon
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Dashboard / Lists */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<PrivateRoute><Placeholder title="Lists" /></PrivateRoute>} />
        <Route path="/list/:listId" element={<PrivateRoute><Placeholder title="List Detail" /></PrivateRoute>} />

        {/* Household */}
        <Route path="/household" element={<PrivateRoute><HouseholdPage /></PrivateRoute>} />
        <Route path="/household/invite" element={<PrivateRoute><InvitePage /></PrivateRoute>} />
        <Route path="/household/exit" element={<PrivateRoute><ExitPage /></PrivateRoute>} />
        <Route path="/household/invitations" element={<PrivateRoute><InvitationsPage /></PrivateRoute>} />
        <Route path="/invitations" element={<PrivateRoute><InvitationsPage /></PrivateRoute>} />

        {/* Expenses */}
        <Route path="/expenses" element={<PrivateRoute><Placeholder title="Current Expenses" /></PrivateRoute>} />
        <Route path="/expenses/budget" element={<PrivateRoute><Placeholder title="Budget" /></PrivateRoute>} />
        <Route path="/expenses/categories" element={<PrivateRoute><Placeholder title="Categories" /></PrivateRoute>} />

        {/* Loyalty Cards */}
        <Route path="/loyalty-cards" element={<PrivateRoute><Placeholder title="Loyalty Cards" /></PrivateRoute>} />

        {/* Gift Cards */}
        <Route path="/gift-cards" element={<PrivateRoute><Placeholder title="Gift Cards — Active" /></PrivateRoute>} />
        <Route path="/gift-cards/archived" element={<PrivateRoute><Placeholder title="Gift Cards — Archived" /></PrivateRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
