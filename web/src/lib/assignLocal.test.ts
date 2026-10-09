import { describe, expect, it } from 'vitest';
import type { AssignData } from '../api';
import { shortagesOf, withLock, withoutPair, withPair } from './assignLocal';

const slots = [
  { id: 1, minPeople: 2 },
  { id: 2, minPeople: 1 },
];
const base: AssignData = {
  excludedSlotIds: [],
  assignments: [
    { userId: 10, slotId: 1, source: 'auto', locked: false, status: 'draft' },
    { userId: 11, slotId: 1, source: 'auto', locked: false, status: 'draft' },
  ],
  shortages: [{ slotId: 2, missing: 1 }],
  violations: [{ userId: 10, slotId: 1, reason: 'unavailable' }],
};

describe('assignLocal', () => {
  it('computes shortages from min people', () => {
    expect(shortagesOf(slots, base.assignments)).toEqual([{ slotId: 2, missing: 1 }]);
  });

  it('removing a person creates a shortage and drops that pair’s warnings', () => {
    const next = withoutPair(base, slots, 10, 1);
    expect(next.assignments).toHaveLength(1);
    expect(next.shortages).toEqual([
      { slotId: 1, missing: 1 },
      { slotId: 2, missing: 1 },
    ]);
    expect(next.violations).toEqual([]);
  });

  it('adding a person fills the shortage and marks the pair as manual and locked', () => {
    const next = withPair(base, slots, 12, 2);
    expect(next.shortages).toEqual([]);
    expect(next.assignments.at(-1)).toMatchObject({
      userId: 12,
      slotId: 2,
      source: 'manual',
      locked: true,
    });
  });

  it('does not duplicate an existing pair', () => {
    expect(withPair(base, slots, 10, 1)).toBe(base);
  });

  it('toggles only the chosen lock', () => {
    const next = withLock(base, 10, 1, true);
    expect(next.assignments.map((a) => a.locked)).toEqual([true, false]);
  });
});
