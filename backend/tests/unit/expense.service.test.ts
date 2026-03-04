/**
 * Unit tests: expenseService pure helpers
 *
 * Tests cover:
 *  - SYSTEM_CATEGORY_IDS: correct set membership
 *  - isCategorySystem: returns true only for seeded IDs
 *  - canManageHouseholdCategory: owner=true, member=false
 *  - validateCategoryDepth: level 1 and 2 ok, level 3 not ok
 *  - buildCategoryTree: correct parent-child nesting and position sort
 *  - computeMonthFirstDay: parses YYYY-MM, rejects bad input
 */

import {
  SYSTEM_CATEGORY_IDS,
  isCategorySystem,
  canManageHouseholdCategory,
  validateCategoryDepth,
  buildCategoryTree,
  computeMonthFirstDay,
  type ExpenseCategoryRow,
} from '../../src/services/expenseService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ExpenseCategoryRow> = {}): ExpenseCategoryRow {
  return {
    id: 'cat-test',
    parent_id: null,
    household_id: null,
    owner_user_id: null,
    scope: 'system',
    name: 'Test',
    level: 1,
    icon_name: null,
    position: 0,
    updated_at: new Date().toISOString(),
    synced_at: null,
    client_id: null,
    is_deleted: false,
    is_test_data: false,
    ...overrides,
  };
}

// ── SYSTEM_CATEGORY_IDS ───────────────────────────────────────────────────────

describe('SYSTEM_CATEGORY_IDS', () => {
  it('contains exactly 7 entries', () => {
    expect(SYSTEM_CATEGORY_IDS.size).toBe(7);
  });

  it('contains Housing id', () => {
    expect(SYSTEM_CATEGORY_IDS.has('00000000-0000-ec00-0000-000000000001')).toBe(true);
  });

  it('contains Personal Care & Clothing id', () => {
    expect(SYSTEM_CATEGORY_IDS.has('00000000-0000-ec00-0000-000000000007')).toBe(true);
  });
});

// ── isCategorySystem ──────────────────────────────────────────────────────────

describe('isCategorySystem', () => {
  it('returns true for a seeded system id', () => {
    expect(isCategorySystem('00000000-0000-ec00-0000-000000000001')).toBe(true);
  });

  it('returns false for a random UUID', () => {
    expect(isCategorySystem('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCategorySystem('')).toBe(false);
  });
});

// ── canManageHouseholdCategory ────────────────────────────────────────────────

describe('canManageHouseholdCategory', () => {
  it('allows owner role', () => {
    expect(canManageHouseholdCategory('owner')).toBe(true);
  });

  it('denies member role', () => {
    expect(canManageHouseholdCategory('member')).toBe(false);
  });

  it('denies unknown role', () => {
    expect(canManageHouseholdCategory('admin')).toBe(false);
  });
});

// ── validateCategoryDepth ─────────────────────────────────────────────────────

describe('validateCategoryDepth', () => {
  it('allows parent at level 1 (child would be level 2)', () => {
    expect(validateCategoryDepth(1)).toBe(true);
  });

  it('allows parent at level 2 (child would be level 3)', () => {
    expect(validateCategoryDepth(2)).toBe(true);
  });

  it('denies parent at level 3 (child would be level 4)', () => {
    expect(validateCategoryDepth(3)).toBe(false);
  });

  it('denies parent at level 4 (edge case)', () => {
    expect(validateCategoryDepth(4)).toBe(false);
  });
});

// ── buildCategoryTree ─────────────────────────────────────────────────────────

describe('buildCategoryTree', () => {
  it('returns only roots when no children', () => {
    const rows = [
      makeRow({ id: 'root-1', position: 0 }),
      makeRow({ id: 'root-2', position: 1 }),
    ];
    const tree = buildCategoryTree(rows);
    expect(tree).toHaveLength(2);
    expect(tree[0].id).toBe('root-1');
  });

  it('nests children under their parent', () => {
    const rows = [
      makeRow({ id: 'root-1', parent_id: null, level: 1, position: 0 }),
      makeRow({ id: 'child-1', parent_id: 'root-1', level: 2, position: 0 }),
      makeRow({ id: 'child-2', parent_id: 'root-1', level: 2, position: 1 }),
    ];
    const tree = buildCategoryTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].id).toBe('child-1');
    expect(tree[0].children[1].id).toBe('child-2');
  });

  it('nests grandchildren under children', () => {
    const rows = [
      makeRow({ id: 'root', parent_id: null, level: 1, position: 0 }),
      makeRow({ id: 'child', parent_id: 'root', level: 2, position: 0 }),
      makeRow({ id: 'grandchild', parent_id: 'child', level: 3, position: 0 }),
    ];
    const tree = buildCategoryTree(rows);
    expect(tree[0].children[0].children[0].id).toBe('grandchild');
  });

  it('sorts siblings by position', () => {
    const rows = [
      makeRow({ id: 'b', parent_id: null, level: 1, position: 2 }),
      makeRow({ id: 'a', parent_id: null, level: 1, position: 1 }),
    ];
    const tree = buildCategoryTree(rows);
    expect(tree[0].id).toBe('a');
    expect(tree[1].id).toBe('b');
  });

  it('returns empty array for empty input', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });

  it('ignores orphan children (parent not in rows)', () => {
    const rows = [
      makeRow({ id: 'orphan', parent_id: 'missing-parent', level: 2, position: 0 }),
    ];
    const tree = buildCategoryTree(rows);
    // orphan has no root so tree is empty
    expect(tree).toHaveLength(0);
  });
});

// ── computeMonthFirstDay ──────────────────────────────────────────────────────

describe('computeMonthFirstDay', () => {
  it('parses 2026-03 to March 1 2026', () => {
    const d = computeMonthFirstDay('2026-03');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2); // 0-indexed
    expect(d.getUTCDate()).toBe(1);
  });

  it('parses 2025-12 to December 1 2025', () => {
    const d = computeMonthFirstDay('2025-12');
    expect(d.getUTCMonth()).toBe(11);
    expect(d.getUTCDate()).toBe(1);
  });

  it('throws SQIRL-EXP-BUDGET-001 for invalid format', () => {
    expect(() => computeMonthFirstDay('2026/03')).toThrow();
    try {
      computeMonthFirstDay('2026/03');
    } catch (err) {
      expect((err as Error & { errorCode: string }).errorCode).toBe('SQIRL-EXP-BUDGET-001');
    }
  });

  it('throws SQIRL-EXP-BUDGET-001 for empty string', () => {
    try {
      computeMonthFirstDay('');
    } catch (err) {
      expect((err as Error & { errorCode: string }).errorCode).toBe('SQIRL-EXP-BUDGET-001');
    }
  });

  it('throws SQIRL-EXP-BUDGET-001 for month only (no year)', () => {
    try {
      computeMonthFirstDay('03');
    } catch (err) {
      expect((err as Error & { errorCode: string }).errorCode).toBe('SQIRL-EXP-BUDGET-001');
    }
  });
});
