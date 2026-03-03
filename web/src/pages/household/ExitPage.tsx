/**
 * ExitPage — voluntary exit flow with optional copy request.
 *
 * Step 1: Choose exit type (immediate or with copies).
 * Step 2 (copies): Review default copy scope, optionally adjust, submit request.
 *   - If request is pending, show status.
 *   - Once approved, user can confirm exit.
 * Step 3: Confirmation.
 *
 * Rules enforced:
 *   - Sole owner with other members must promote another owner first.
 *   - Last member auto-deletes household (always gets copies, no request needed).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type CopyScope, type CopyRequestResponse } from '../../lib/api';
import { useHouseholdStore } from '../../store/householdStore';
import { useAuthStore } from '../../store/authStore';

type Step = 'choose' | 'scope' | 'pending' | 'done';

const DEFAULT_SCOPE: CopyScope = {
  lists: 'all',
  giftCards: 'active_only',
  loyaltyCards: 'all',
  expenses: '12months',
};

export default function ExitPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { household, setHousehold } = useHouseholdStore();

  const [step, setStep] = useState<Step>('choose');
  const [loading, setLoading] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyRequest, setCopyRequest] = useState<CopyRequestResponse | null>(null);
  const [scope, setScope] = useState<CopyScope>({ ...DEFAULT_SCOPE });

  const myMembership = household?.members.find((m) => m.userId === user?.id);
  const isOwner = myMembership?.role === 'owner';
  const memberCount = household?.members.length ?? 0;
  const ownerCount = household?.members.filter((m) => m.role === 'owner').length ?? 0;
  const isSoleOwner = isOwner && ownerCount === 1;
  const isLastMember = memberCount === 1;
  const mustPromoteFirst = isSoleOwner && !isLastMember;

  useEffect(() => {
    void (async () => {
      try {
        const { household: hh } = await api.getHousehold();
        setHousehold(hh);
      } finally {
        setLoading(false);
      }
    })();
  }, [setHousehold]);

  async function handleImmediateExit() {
    try {
      setExiting(true);
      setError(null);
      const { autoDeleted } = await api.exitHousehold();
      setHousehold(null);
      if (autoDeleted) {
        setStep('done');
      } else {
        setStep('done');
      }
    } catch (err) {
      const e = err as Error;
      if (e.message === 'SQIRL-HH-EXIT-001') {
        setError('You are the only owner. Promote another member to owner before exiting.');
      } else {
        setError('Failed to exit household. Please try again.');
      }
    } finally {
      setExiting(false);
    }
  }

  async function handleSubmitCopyRequest() {
    try {
      setExiting(true);
      setError(null);
      const { copyRequest: cr } = await api.createCopyRequest(scope);
      setCopyRequest(cr);
      setStep('pending');
    } catch (err) {
      const e = err as Error;
      if (e.message === 'SQIRL-HH-COPY-001') {
        setError('Invalid copy scope selection.');
      } else {
        setError('Failed to submit copy request.');
      }
    } finally {
      setExiting(false);
    }
  }

  async function handleExitAfterApproval() {
    try {
      setExiting(true);
      await api.exitHousehold();
      setHousehold(null);
      setStep('done');
    } catch {
      setError('Failed to exit household.');
    } finally {
      setExiting(false);
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
      <div className="p-8 max-w-md">
        <p className="text-gray-500">You are not currently in a household.</p>
        <button onClick={() => navigate('/household')} className="mt-4 text-primary-600 text-sm hover:underline">
          Back to Household
        </button>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="p-8 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">You've left the household</h2>
        </div>
        <p className="text-gray-500 mb-6 text-sm">
          You no longer have access to household data. Any granted copies are now in your personal account.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg">
      <button
        onClick={() => navigate('/household')}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Exit Household</h1>
      <p className="text-sm text-gray-500 mb-6">
        Leaving <strong>{household.name}</strong>
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {mustPromoteFirst && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <p className="font-medium mb-1">You must promote another owner first</p>
          <p>You are the only owner. Promote another member to owner before you can exit.</p>
          <button
            onClick={() => navigate('/household')}
            className="mt-2 text-amber-700 font-medium hover:underline text-xs"
          >
            Go to member list →
          </button>
        </div>
      )}

      {step === 'choose' && !mustPromoteFirst && (
        <div className="space-y-3">
          {isLastMember && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm mb-4">
              You are the last member. Exiting will delete the household and give you full copies of all data.
            </div>
          )}

          <button
            onClick={() => void handleImmediateExit()}
            disabled={exiting}
            className="w-full text-left p-4 bg-white border border-gray-200 rounded-2xl hover:border-primary-300 hover:bg-primary-50 transition-all group"
          >
            <p className="font-medium text-gray-900 group-hover:text-primary-700">Exit without copies</p>
            <p className="text-sm text-gray-500 mt-0.5">Immediate. You lose access to all household data instantly.</p>
          </button>

          {!isLastMember && (
            <button
              onClick={() => setStep('scope')}
              className="w-full text-left p-4 bg-white border border-gray-200 rounded-2xl hover:border-primary-300 hover:bg-primary-50 transition-all group"
            >
              <p className="font-medium text-gray-900 group-hover:text-primary-700">Exit with copies</p>
              <p className="text-sm text-gray-500 mt-0.5">Request copies of your data. An owner must approve before you leave.</p>
            </button>
          )}
        </div>
      )}

      {step === 'scope' && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Choose what to copy</h2>
          <div className="space-y-3 mb-6">
            {/* Lists */}
            <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
              <span className="text-sm text-gray-700">Lists</span>
              <select
                value={scope.lists}
                onChange={(e) => setScope({ ...scope, lists: e.target.value as CopyScope['lists'] })}
                className="text-sm border-0 outline-none text-primary-600 font-medium"
              >
                <option value="all">All items</option>
                <option value="none">None</option>
              </select>
            </div>
            {/* Gift cards */}
            <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
              <span className="text-sm text-gray-700">Gift Cards</span>
              <select
                value={scope.giftCards}
                onChange={(e) => setScope({ ...scope, giftCards: e.target.value as CopyScope['giftCards'] })}
                className="text-sm border-0 outline-none text-primary-600 font-medium"
              >
                <option value="active_only">Active only</option>
                <option value="none">None</option>
              </select>
            </div>
            {/* Loyalty cards */}
            <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
              <span className="text-sm text-gray-700">Loyalty Cards</span>
              <select
                value={scope.loyaltyCards}
                onChange={(e) => setScope({ ...scope, loyaltyCards: e.target.value as CopyScope['loyaltyCards'] })}
                className="text-sm border-0 outline-none text-primary-600 font-medium"
              >
                <option value="all">All cards</option>
                <option value="none">None</option>
              </select>
            </div>
            {/* Expenses */}
            <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
              <span className="text-sm text-gray-700">Expenses</span>
              <select
                value={scope.expenses}
                onChange={(e) => setScope({ ...scope, expenses: e.target.value as CopyScope['expenses'] })}
                className="text-sm border-0 outline-none text-primary-600 font-medium"
              >
                <option value="12months">Last 12 months</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('choose')}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
            >
              Back
            </button>
            <button
              onClick={() => void handleSubmitCopyRequest()}
              disabled={exiting}
              className="flex-1 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
            >
              {exiting ? 'Submitting…' : 'Request & wait for approval'}
            </button>
          </div>
        </div>
      )}

      {step === 'pending' && copyRequest && (
        <div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl mb-6">
            <p className="text-sm font-medium text-blue-800 mb-1">
              {copyRequest.status === 'pending' ? 'Waiting for owner approval' : `Request ${copyRequest.status}`}
            </p>
            <p className="text-xs text-blue-600">
              {copyRequest.status === 'pending'
                ? 'An owner must approve your copy request. You can exit now without copies, or wait.'
                : copyRequest.status === 'approved'
                  ? 'Your request was approved. Click below to complete your exit.'
                  : 'Your request was denied. You can still exit without copies.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => void handleImmediateExit()}
              disabled={exiting}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              Exit without copies
            </button>
            {copyRequest.status === 'approved' && (
              <button
                onClick={() => void handleExitAfterApproval()}
                disabled={exiting}
                className="flex-1 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
              >
                {exiting ? 'Exiting…' : 'Exit with copies'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
