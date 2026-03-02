/**
 * Web app root — React Router setup.
 * Routes are expanded as features are built.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import { useAuthStore } from './store/authStore';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const tokens = useAuthStore((s) => s.tokens);
  return tokens ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* Protected routes — expand as features are added */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <div className="p-8 text-gray-700">Dashboard — coming soon</div>
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
