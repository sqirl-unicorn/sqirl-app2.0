/**
 * Login screen — email or phone + password.
 * Same split-screen design as v1: white left panel (logo) + right card panel.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { cryptoService } from '../lib/cryptoService';
import { useAuthStore } from '../store/authStore';

type IdentifierMode = 'email' | 'phone';

export default function Login() {
  const navigate = useNavigate();
  const { setAuth, setMasterKey } = useAuthStore();

  const [mode, setMode] = useState<IdentifierMode>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload =
        mode === 'email'
          ? { email: identifier, password }
          : { phone: identifier, password };

      const res = await api.login(payload);

      const { masterKey } = await cryptoService.unlockPrivateKey(
        password,
        res.encryptedPrivateKey,
        res.salt
      );

      setAuth(res.user, res.tokens, res.encryptedPrivateKey, res.salt);
      setMasterKey(masterKey);

      navigate(res.user.isAdmin ? '/admin' : '/dashboard');
    } catch (err) {
      const code = err instanceof Error ? err.message : 'LOGIN_FAILED';
      if (code === 'SQIRL-AUTH-CRYPTO-001') {
        setError('Incorrect password');
      } else if (code === 'SQIRL-AUTH-LOGIN-002') {
        setError('Email or password is incorrect');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left — logo on white */}
      <div className="hidden lg:flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="w-48 h-48 mx-auto mb-6 bg-primary-400 rounded-full flex items-center justify-center">
            <img src="/logo_white_transparent.png" alt="Sqirl" className="w-28 h-28 object-contain" />
          </div>
          <h1 className="text-5xl font-bold text-primary-400 tracking-tight font-display">Sqirl</h1>
        </div>
      </div>

      {/* Right — card panel */}
      <div className="w-full lg:w-[380px] xl:w-[420px] min-h-screen flex flex-col bg-gray-50 lg:rounded-l-3xl lg:shadow-xl">
        <div className="hidden lg:flex justify-center pt-4">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Mobile logo */}
        <div className="lg:hidden text-center pt-12 pb-6">
          <div className="w-24 h-24 mx-auto mb-3 bg-primary-400 rounded-full flex items-center justify-center">
            <img src="/logo_white_transparent.png" alt="Sqirl" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-primary-400 tracking-tight">Sqirl</h1>
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 py-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Log in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email / Phone toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-1">
              {(['email', 'phone'] as IdentifierMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setIdentifier(''); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    mode === m
                      ? 'bg-primary-400 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m === 'email' ? 'Email' : 'Phone'}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {mode === 'email' ? 'Email address' : 'Phone number'}
              </label>
              <input
                type={mode === 'email' ? 'email' : 'tel'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full h-11 px-4 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                placeholder={mode === 'email' ? 'you@example.com' : '+61 412 000 000'}
                required
                autoComplete={mode === 'email' ? 'email' : 'tel'}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <Link to="/reset-password" className="text-xs text-primary-400 hover:text-primary-500">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary-400 text-white text-sm font-semibold rounded-lg hover:bg-primary-500 disabled:opacity-60 transition-colors mt-2"
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>

            <p className="text-center text-sm text-gray-500 pt-2">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-400 font-medium hover:text-primary-500">
                Sign up
              </Link>
            </p>

            <p className="text-center text-xs text-gray-400 leading-5">
              End-to-end encrypted · Your data stays private
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
