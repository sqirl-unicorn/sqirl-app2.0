/**
 * InvitePage — send an invitation to create or grow a household.
 *
 * If the user is not in a household: sends a "founding" invite (householdId = null).
 * If the user is an owner in a household: sends an invite into the existing household.
 * Includes expiry slider (1–30 days, default 7) and email/phone toggle.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useHouseholdStore } from '../../store/householdStore';

export default function InvitePage() {
  const navigate = useNavigate();
  const { household, setHousehold } = useHouseholdStore();

  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [inviteePhone, setInviteePhone] = useState('');
  const [expiryDays, setExpiryDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load household if not yet in store
  useEffect(() => {
    if (household === undefined) {
      void api.getHousehold().then(({ household: hh }) => setHousehold(hh));
    }
  }, [household, setHousehold]);

  async function handleSend() {
    setError(null);
    const contact = mode === 'email' ? inviteeEmail.trim() : inviteePhone.trim();
    if (!contact) {
      setError(`Please enter an ${mode === 'email' ? 'email' : 'phone number'}`);
      return;
    }

    try {
      setLoading(true);
      await api.sendInvite({
        ...(mode === 'email' ? { inviteeEmail: contact } : { inviteePhone: contact }),
        householdId: household?.id,
        expiryDays,
      });
      setSent(true);
    } catch (err) {
      const e = err as Error;
      if (e.message === 'SQIRL-HH-INVITE-004') {
        setError('A pending invitation already exists for this person.');
      } else if (e.message === 'SQIRL-HH-INVITE-002') {
        setError('Expiry must be between 1 and 30 days.');
      } else {
        setError('Failed to send invitation. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="p-8 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Invitation sent!</h2>
        </div>
        <p className="text-gray-500 mb-6">
          {household
            ? 'The invite has been sent. Once accepted, they\'ll join your household.'
            : 'Once they accept, a new household will be created for both of you.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { setSent(false); setInviteeEmail(''); setInviteePhone(''); }}
            className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600"
          >
            Send another
          </button>
          <button
            onClick={() => navigate('/household')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
          >
            Back to Household
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md">
      <button
        onClick={() => navigate('/household')}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Send Invitation</h1>
      <p className="text-gray-500 text-sm mb-6">
        {household
          ? `Invite someone to join ${household.name}`
          : 'Invite someone to start a household together'}
      </p>

      {/* Email / phone toggle */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
        {(['email', 'phone'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
              mode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}
          >
            {m === 'email' ? 'Email' : 'Phone'}
          </button>
        ))}
      </div>

      {mode === 'email' ? (
        <input
          type="email"
          value={inviteeEmail}
          onChange={(e) => setInviteeEmail(e.target.value)}
          placeholder="their@email.com"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 mb-4"
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
        />
      ) : (
        <input
          type="tel"
          value={inviteePhone}
          onChange={(e) => setInviteePhone(e.target.value)}
          placeholder="+1 555 000 0000"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 mb-4"
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
        />
      )}

      {/* Expiry slider */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-500 mb-2">
          Invite expires in <span className="text-gray-900 font-semibold">{expiryDays} day{expiryDays !== 1 ? 's' : ''}</span>
        </label>
        <input
          type="range"
          min={1}
          max={30}
          value={expiryDays}
          onChange={(e) => setExpiryDays(Number(e.target.value))}
          className="w-full accent-primary-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>1 day</span>
          <span>30 days</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      <button
        onClick={() => void handleSend()}
        disabled={loading}
        className="w-full py-3 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Sending…' : 'Send Invitation'}
      </button>
    </div>
  );
}
