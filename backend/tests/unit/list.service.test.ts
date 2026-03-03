/**
 * Unit tests: listService pure functions
 *
 * Tests cover the stateless helper functions that can run without a DB.
 * DB-dependent operations are covered in integration tests.
 */

import {
  computeProgress,
  validateSubtaskDueDate,
  canAccessList,
} from '../../src/services/listService';
import type { ListRow } from '../../src/services/listService';

// ── computeProgress ───────────────────────────────────────────────────────────

describe('computeProgress', () => {
  it('returns 0 when there are no subtasks', () => {
    expect(computeProgress([])).toBe(0);
  });

  it('returns 0 when no subtasks completed', () => {
    const subtasks = [
      { is_completed: false },
      { is_completed: false },
    ];
    expect(computeProgress(subtasks)).toBe(0);
  });

  it('returns 100 when all subtasks completed', () => {
    const subtasks = [
      { is_completed: true },
      { is_completed: true },
    ];
    expect(computeProgress(subtasks)).toBe(100);
  });

  it('returns 50 when half subtasks completed', () => {
    const subtasks = [
      { is_completed: true },
      { is_completed: false },
    ];
    expect(computeProgress(subtasks)).toBe(50);
  });

  it('rounds down to nearest integer', () => {
    const subtasks = [
      { is_completed: true },
      { is_completed: false },
      { is_completed: false },
    ];
    expect(computeProgress(subtasks)).toBe(33);
  });
});

// ── validateSubtaskDueDate ────────────────────────────────────────────────────

describe('validateSubtaskDueDate', () => {
  it('returns true when subtask has no due date', () => {
    expect(validateSubtaskDueDate(null, '2026-12-31')).toBe(true);
  });

  it('returns true when task has no due date', () => {
    expect(validateSubtaskDueDate('2026-06-01', null)).toBe(true);
  });

  it('returns true when subtask due date equals task due date', () => {
    expect(validateSubtaskDueDate('2026-06-01', '2026-06-01')).toBe(true);
  });

  it('returns true when subtask due date is before task due date', () => {
    expect(validateSubtaskDueDate('2026-05-01', '2026-06-01')).toBe(true);
  });

  it('returns false when subtask due date is after task due date', () => {
    expect(validateSubtaskDueDate('2026-07-01', '2026-06-01')).toBe(false);
  });
});

// ── canAccessList ─────────────────────────────────────────────────────────────

describe('canAccessList', () => {
  const makeList = (overrides: Partial<ListRow>): ListRow => ({
    id: 'list-1',
    household_id: null,
    owner_user_id: 'user-1',
    name: 'My List',
    list_type: 'general',
    updated_at: new Date().toISOString(),
    synced_at: null,
    client_id: null,
    is_deleted: false,
    is_test_data: false,
    ...overrides,
  });

  it('returns true when user owns the list', () => {
    const list = makeList({ owner_user_id: 'user-1' });
    expect(canAccessList('user-1', null, list)).toBe(true);
  });

  it('returns false when user does not own a personal list', () => {
    const list = makeList({ owner_user_id: 'user-2', household_id: null });
    expect(canAccessList('user-1', null, list)).toBe(false);
  });

  it('returns true when list belongs to user household', () => {
    const list = makeList({ household_id: 'hh-1', owner_user_id: 'user-2' });
    expect(canAccessList('user-1', 'hh-1', list)).toBe(true);
  });

  it('returns false when list belongs to different household', () => {
    const list = makeList({ household_id: 'hh-2', owner_user_id: 'user-2' });
    expect(canAccessList('user-1', 'hh-1', list)).toBe(false);
  });

  it('returns false when user has no household and list is household-scoped', () => {
    const list = makeList({ household_id: 'hh-1', owner_user_id: 'user-2' });
    expect(canAccessList('user-1', null, list)).toBe(false);
  });
});
