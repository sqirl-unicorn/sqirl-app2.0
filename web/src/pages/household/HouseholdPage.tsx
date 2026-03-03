/**
 * HouseholdPage — view and manage your household.
 *
 * Shows: household name (editable by owners), member list with roles,
 * promote/demote/remove actions (owner only), and link to exit flow.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type HouseholdMember } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useHouseholdStore } from '../../store/householdStore';

export default function HouseholdPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { household, setHousehold } = useHouseholdStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const myRole = household?.members.find((m) => m.userId === user?.id)?.role;
  const isOwner = myRole === 'owner';

  useEffect(() => {
    void (async () => {
      try {
        const { household: hh } = await api.getHousehold();
        setHousehold(hh);
        if (hh) setNewName(hh.name);
      } catch {
        setError('Failed to load household');
      } finally {
        setLoading(false);
      }
    })();
  }, [setHousehold]);

  async function handleRename() {
    if (!newName.trim()) return;
    try {
      setActionLoading('rename');
      const { household: hh } = await api.renameHousehold(newName.trim());
      setHousehold(hh);
      setRenaming(false);
    } catch {
      setError('Failed to rename household');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePromote(memberId: string) {
    try {
      setActionLoading(`promote-${memberId}`);
      await api.promoteMember(memberId);
      const { household: hh } = await api.getHousehold();
      setHousehold(hh);
    } catch {
      setError('Failed to promote member');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDemote(memberId: string) {
    try {
      setActionLoading(`demote-${memberId}`);
      await api.demoteMember(memberId);
      const { household: hh } = await api.getHousehold();
      setHousehold(hh);
    } catch (err) {
      const e = err as Error;
      setError(e.message === 'SQIRL-HH-MEMBER-001' ? 'Cannot demote the last owner' : 'Failed to demote member');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm('Remove this member? They will receive default data copies.')) return;
    try {
      setActionLoading(`remove-${memberId}`);
      const { autoDeleted } = await api.removeMember(memberId);
      if (autoDeleted) {
        setHousehold(null);
        navigate('/dashboard');
      } else {
        const { household: hh } = await api.getHousehold();
        setHousehold(hh);
      }
    } catch {
      setError('Failed to remove member');
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

  if (!household) {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Household</h1>
        <p className="text-gray-500 mb-6">You're not part of a household yet.</p>
        <p className="text-gray-500 text-sm mb-6">
          Invite someone to create a household together, or wait for an invitation.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/household/invite')}
            className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            Send Invitation
          </button>
          <button
            onClick={() => navigate('/invitations')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            View Invitations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {renaming && isOwner ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-xl font-bold text-gray-900 border-b-2 border-primary-400 outline-none bg-transparent flex-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(); if (e.key === 'Escape') setRenaming(false); }}
            />
            <button
              onClick={() => void handleRename()}
              disabled={actionLoading === 'rename'}
              className="text-sm text-primary-600 font-medium hover:text-primary-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => { setRenaming(false); setNewName(household.name); }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{household.name}</h1>
            {isOwner && (
              <button
                onClick={() => setRenaming(true)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
                title="Rename household"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {isOwner && (
            <button
              onClick={() => navigate('/household/invite')}
              className="px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
            >
              Invite
            </button>
          )}
          <button
            onClick={() => navigate('/household/exit')}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Exit
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {/* Members */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Members ({household.members.length})</h2>
          {isOwner && (
            <button
              onClick={() => navigate('/household/invite')}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              View sent invites
            </button>
          )}
        </div>
        <ul className="divide-y divide-gray-50">
          {household.members.map((member: HouseholdMember) => {
            const isMe = member.userId === user?.id;
            const loading = actionLoading?.startsWith(member.userId) ||
              actionLoading === `promote-${member.userId}` ||
              actionLoading === `demote-${member.userId}` ||
              actionLoading === `remove-${member.userId}`;

            return (
              <li key={member.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {member.firstName}{isMe ? ' (you)' : ''}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {member.email ?? member.phone ?? ''}
                  </span>
                  <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                    member.role === 'owner'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {member.role}
                  </span>
                </div>
                {isOwner && !isMe && (
                  <div className="flex items-center gap-1">
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        {member.role === 'member' ? (
                          <button
                            onClick={() => void handlePromote(member.userId)}
                            className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50"
                          >
                            Make owner
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleDemote(member.userId)}
                            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50"
                          >
                            Demote
                          </button>
                        )}
                        <button
                          onClick={() => void handleRemove(member.userId)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Copy requests (owners only) */}
      {isOwner && (
        <div className="mt-6">
          <button
            onClick={() => navigate('/household/copy-requests')}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View pending copy requests →
          </button>
        </div>
      )}
    </div>
  );
}
