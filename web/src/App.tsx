/**
 * Web app root — React Router setup.
 *
 * ProtectedRoute wraps authenticated pages with Layout (side nav + mobile nav).
 * Lists pages are now fully implemented; household pages retain their implementation.
 */

import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import { Layout } from './components/Layout';
import { useAuthStore } from './store/authStore';
import HouseholdPage from './pages/household/HouseholdPage';
import InvitePage from './pages/household/InvitePage';
import InvitationsPage from './pages/household/InvitationsPage';
import ExitPage from './pages/household/ExitPage';
import ListsPage from './pages/lists/ListsPage';
import ListDetailPage from './pages/lists/ListDetailPage';
import TodoDetailPage from './pages/lists/TodoDetailPage';
import LoyaltyCardsPage from './pages/loyalty-cards/LoyaltyCardsPage';
import { useListsStore } from './store/listsStore';

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

/**
 * Route-level guard: renders TodoDetailPage for todo lists and
 * ListDetailPage for general/grocery lists. Reads list type from the store.
 */
function ListRouter() {
  const { listId } = useParams<{ listId: string }>();
  const lists = useListsStore((s) => s.lists);
  const list = lists.find((l) => l.id === listId);
  if (list?.listType === 'todo') return <TodoDetailPage />;
  return <ListDetailPage />;
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
        <Route path="/dashboard" element={<PrivateRoute><ListsPage /></PrivateRoute>} />
        <Route path="/list/:listId" element={<PrivateRoute><ListRouter /></PrivateRoute>} />

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
        <Route path="/loyalty-cards" element={<PrivateRoute><LoyaltyCardsPage /></PrivateRoute>} />

        {/* Gift Cards */}
        <Route path="/gift-cards" element={<PrivateRoute><Placeholder title="Gift Cards — Active" /></PrivateRoute>} />
        <Route path="/gift-cards/archived" element={<PrivateRoute><Placeholder title="Gift Cards — Archived" /></PrivateRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
