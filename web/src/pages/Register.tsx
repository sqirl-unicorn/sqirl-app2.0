/**
 * Multi-step registration screen.
 *
 * Step 1 — Identity: firstName, email OR phone, password, country (auto-detected)
 * Step 2 — Recovery: display 5 recovery keys in milder recovery (sage/teal) palette
 *           User must acknowledge saving them before continuing.
 *           Keys are viewable again later in Profile > Recovery.
 */

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { cryptoService } from '../lib/cryptoService';
import { useAuthStore } from '../store/authStore';
import type { Country } from '../lib/api';

type IdentifierMode = 'email' | 'phone';
type Step = 'identity' | 'recovery';

// ── Country detection via browser timezone / locale ──────────────────────────

function detectCountryFromBrowser(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('Australia')) return 'AU';
    if (tz.startsWith('America/')) return tz.includes('Toronto') || tz.includes('Vancouver') ? 'CA' : 'US';
    if (tz.startsWith('Europe/London')) return 'GB';
    if (tz.startsWith('Asia/Singapore')) return 'SG';
    if (tz.startsWith('Asia/Kolkata')) return 'IN';
    if (tz.startsWith('Asia/Tokyo')) return 'JP';
    if (tz.startsWith('Pacific/Auckland')) return 'NZ';
  } catch {
    // ignore
  }
  return 'AU';
}

// ── Copy to clipboard helper ─────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// ── Recovery key card ─────────────────────────────────────────────────────────

function RecoveryKeyCard({ index, formatted }: { index: number; formatted: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-recovery-50 border border-recovery-200 rounded-φ-md p-3 flex items-start gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-recovery-100 text-recovery-600 text-xs font-semibold flex items-center justify-center mt-0.5">
        {index + 1}
      </span>
      <code className="flex-1 text-xs text-recovery-900 font-mono leading-5 break-all">
        {formatted}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 text-xs text-recovery-500 hover:text-recovery-700 transition-colors"
        aria-label={`Copy key ${index + 1}`}
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Register() {
  const navigate = useNavigate();
  const { setAuth, setMasterKey } = useAuthStore();

  // Step state
  const [step, setStep] = useState<Step>('identity');

  // Step 1 fields
  const [mode, setMode] = useState<IdentifierMode>('email');
  const [identifier, setIdentifier] = useState('');
  const [firstName, setFirstName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [country, setCountry] = useState('AU');
  const [countries, setCountries] = useState<Country[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 2 state (generated in-memory during registration)
  const [recoveryKeys, setRecoveryKeys] = useState<string[]>([]);
  const [acknowledgedKeys, setAcknowledgedKeys] = useState(false);
  const [skipWarning, setSkipWarning] = useState(false);

  // Detect country on mount
  useEffect(() => {
    setCountry(detectCountryFromBrowser());
    api.getCountries().then(({ countries: list }) => setCountries(list)).catch(() => {});
  }, []);

  // ── Step 1: register + generate recovery keys ──────────────────────────────

  const handleIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const keys = await cryptoService.generateUserKeys(password);
      const recovery = cryptoService.generateRecoveryKeys(keys.masterKey);

      const payload = {
        ...(mode === 'email' ? { email: identifier } : { phone: identifier }),
        firstName,
        password,
        publicKey: keys.publicKey,
        encryptedPrivateKey: keys.encryptedPrivateKey,
        salt: keys.salt,
        country,
        recoveryKeySlots: recovery.slots,
      };

      const res = await api.register(payload);

      setAuth(res.user, res.tokens, keys.encryptedPrivateKey, keys.salt);
      setMasterKey(keys.masterKey);

      // Store formatted keys for step 2 display (in-memory, never persisted)
      setRecoveryKeys(recovery.keys.map((k) => cryptoService.formatRecoveryKey(k)));

      // Advance to recovery step
      setStep('recovery');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'SQIRL-AUTH-REG-002') setError('That email is already registered');
      else if (code === 'SQIRL-AUTH-REG-003') setError('That phone number is already registered');
      else setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: finish (keys already saved on server during registration) ───────

  const handleRecoveryFinish = () => navigate('/dashboard');

  // ── Render step 1 ──────────────────────────────────────────────────────────

  if (step === 'identity') {
    return (
      <div className="min-h-screen flex bg-white">
        {/* Left panel */}
        <div className="hidden lg:flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="w-48 h-48 mx-auto mb-6 bg-primary-400 rounded-full flex items-center justify-center">
              <img src="/logo_white_transparent.png" alt="Sqirl" className="w-28 h-28 object-contain" />
            </div>
            <h1 className="text-5xl font-bold text-primary-400 tracking-tight font-display">Sqirl</h1>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-full lg:w-[420px] xl:w-[460px] min-h-screen flex flex-col bg-gray-50 lg:rounded-l-3xl lg:shadow-xl overflow-y-auto">
          <div className="hidden lg:flex justify-center pt-4">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          </div>

          <div className="lg:hidden text-center pt-12 pb-6">
            <div className="w-24 h-24 mx-auto mb-3 bg-primary-400 rounded-full flex items-center justify-center">
              <img src="/logo_white_transparent.png" alt="Sqirl" className="w-14 h-14 object-contain" />
            </div>
            <h1 className="text-3xl font-bold text-primary-400">Sqirl</h1>
          </div>

          <div className="flex-1 flex flex-col justify-center px-8 py-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Create account</h2>
            <p className="text-sm text-gray-500 mb-6">Step 1 of 2 — Your details</p>

            <form onSubmit={handleIdentitySubmit} className="space-y-4">
              {/* First name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full h-11 px-4 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                  placeholder="Alice"
                  required
                  autoComplete="given-name"
                />
              </div>

              {/* Email / Phone toggle */}
              <div>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-2">
                  {(['email', 'phone'] as IdentifierMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMode(m); setIdentifier(''); }}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        mode === m ? 'bg-primary-400 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {m === 'email' ? 'Email' : 'Phone'}
                    </button>
                  ))}
                </div>
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

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-4 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 px-4 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>

              {/* Country */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full h-11 px-4 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                >
                  {countries.length > 0 ? (
                    countries.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))
                  ) : (
                    <option value={country}>{country}</option>
                  )}
                </select>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              {/* Terms */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 text-primary-400 border-gray-300 rounded focus:ring-primary-400"
                  required
                />
                <span className="text-sm text-gray-600 leading-5">
                  I agree to the{' '}
                  <a href="https://sqirl.net/terms.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 underline">Terms</a>
                  {' '}and{' '}
                  <a href="https://sqirl.net/privacy.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 underline">Privacy Policy</a>
                </span>
              </label>

              <button
                type="submit"
                disabled={loading || !acceptedTerms}
                className="w-full h-11 bg-primary-400 text-white text-sm font-semibold rounded-lg hover:bg-primary-500 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Creating account…' : 'Continue →'}
              </button>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-primary-400 font-medium hover:text-primary-500">Log in</Link>
              </p>

              <p className="text-center text-xs text-gray-400 leading-5">
                End-to-end encrypted · Server never sees your data
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Render step 2 — Recovery keys ─────────────────────────────────────────

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 items-center justify-center">
        <div className="text-center px-12">
          <div className="w-32 h-32 mx-auto mb-6 bg-recovery-100 rounded-full flex items-center justify-center">
            <svg className="w-16 h-16 text-recovery-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-recovery-700">Keep these safe</h2>
          <p className="mt-3 text-sm text-gray-500 leading-6 max-w-xs mx-auto">
            These keys can restore your account if you forget your password.
            Store them somewhere secure — a password manager or printed paper.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-[460px] xl:w-[500px] min-h-screen flex flex-col bg-gray-50 lg:rounded-l-3xl lg:shadow-xl overflow-y-auto">
        <div className="hidden lg:flex justify-center pt-4">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 py-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Save your recovery keys</h2>
          <p className="text-sm text-gray-500 mb-2">Step 2 of 2 — Account recovery</p>
          <p className="text-sm text-recovery-600 mb-5 leading-5">
            Any one of these 5 keys can restore access to your account.
            You can view them again in <strong>Profile → Recovery</strong>.
          </p>

          {/* Recovery key cards */}
          <div className="space-y-2 mb-5">
            {recoveryKeys.map((k, i) => (
              <RecoveryKeyCard key={i} index={i} formatted={k} />
            ))}
          </div>

          {/* Acknowledge checkbox */}
          <label className="flex items-start gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={acknowledgedKeys}
              onChange={(e) => setAcknowledgedKeys(e.target.checked)}
              className="mt-1 w-4 h-4 text-recovery-500 border-recovery-300 rounded focus:ring-recovery-400"
            />
            <span className="text-sm text-gray-700 leading-5">
              I've saved all 5 recovery keys in a secure location
            </span>
          </label>

          <button
            type="button"
            onClick={handleRecoveryFinish}
            disabled={!acknowledgedKeys}
            className="w-full h-11 bg-recovery-500 text-white text-sm font-semibold rounded-lg hover:bg-recovery-600 disabled:opacity-50 transition-colors"
          >
            Continue to app →
          </button>

          {/* Skip option — less prominent */}
          <div className="mt-4 text-center">
            {!skipWarning ? (
              <button
                type="button"
                onClick={() => setSkipWarning(true)}
                className="text-xs text-gray-400 hover:text-gray-500 underline"
              >
                Skip for now
              </button>
            ) : (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 leading-5">
                <p className="font-medium mb-1">Are you sure?</p>
                <p>Without recovery keys, a forgotten password means permanent loss of access to your encrypted data.</p>
                <button
                  type="button"
                  onClick={handleRecoveryFinish}
                  className="mt-2 text-amber-600 hover:text-amber-700 underline font-medium"
                >
                  I understand — skip anyway
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
