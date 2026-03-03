/**
 * InvitationsPage — received pending invitations for the authenticated user.
 *
 * Shows pending invites matched by email/phone.
 * Accept: joins (or creates) household.
 * Decline: removes from queue.
 * Notifies user they cannot accept while already in a household.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type InvitationResponse } from '../../lib/api';
import { useHouseholdStore } from '../../store/householdStore';

function formatExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

export default function InvitationsPage() {
  const navigate = useNavigate();
  const { household, setHousehold, setReceivedInvitations, receivedInvitations } = useHouseholdStore();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [invRes, hhRes] = await Promise.all([
          api.getMyInvitations(),
          api.getHousehold(),
        ]);
        setReceivedInvitations(invRes.invitations);
        setHousehold(hhRes.household);
      } catch {
        setError('Failed to load invitations');
      } finally {
        setLoading(false);
      }
    })();
  }, [setHousehold, setReceivedInvitations]);

  async function handleAccept(invite: InvitationResponse) {
    if (household) {
      setError('You are already in a household. Exit your current household before accepting a new invitation.');
      return;
    }
    try {
      setActionLoading(`accept-${invite.id}`);
      const { household: hh } = await api.acceptInvitation(invite.token);
      setHousehold(hh);
      setReceivedInvitations(receivedInvitations.filter((i) => i.id !== invite.id));
      navigate('/household');
    } catch (err) {
      const e = err as Error;
      if (e.message === 'SQIRL-HH-INVITE-006') {
        setError('You are already in a household. Exit first before accepting this invite.');
      } else if (e.message === 'SQIRL-HH-INVITE-005') {
        setError('This invitation has expired or is no longer valid.');
        setReceivedInvitations(receivedInvitations.filter((i) => i.id !== invite.id));
      } else {
        setError('Failed to accept invitation');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDecline(invite: InvitationResponse) {
    try {
      setActionLoading(`decline-${invite.id}`);
      await api.declineInvitation(invite.id);
      setReceivedInvitations(receivedInvitations.filter((i) => i.id !== invite.id));
    } catch {
      setError('Failed to decline invitation');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/household')}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Invitations</h1>
        {receivedInvitations.length > 0 && (
          <span className="bg-primary-100 text-primary-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {receivedInvitations.length}
          </span>
        )}
      </div>

      {household && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
          You're already in <strong>{household.name}</strong>. Exit your current household to accept a new invitation.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {receivedInvitations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">No pending invitations</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {receivedInvitations.map((invite) => {
            const accepting = actionLoading === `accept-${invite.id}`;
            const declining = actionLoading === `decline-${invite.id}`;
            return (
              <li
                key={invite.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4"
              >
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-900">
                    {invite.householdId ? 'Join household' : 'Create new household together'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatExpiry(invite.expiresAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleAccept(invite)}
                    disabled={!!actionLoading || !!household}
                    className="flex-1 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
                  >
                    {accepting ? 'Accepting…' : 'Accept'}
                  </button>
                  <button
                    onClick={() => void handleDecline(invite)}
                    disabled={!!actionLoading}
                    className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    {declining ? 'Declining…' : 'Decline'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
