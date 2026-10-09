import { describe, expect, it } from 'vitest';
import { isPeriodOpen, validateEntries } from './rules.js';
import type { AvailabilityEntry } from './types.js';

const t = (s: string) => new Date(`2026-11-01T${s}:00+09:00`);
const e = (
  type: AvailabilityEntry['type'],
  departmentId: number | null,
  a: string,
  b: string,
): AvailabilityEntry => ({ type, departmentId, startsAt: t(a), endsAt: t(b) });
const reasons = (entries: AvailabilityEntry[], depts = [1, 2]) =>
  validateEntries(entries, depts).map((x) => x.reason);

describe('isPeriodOpen', () => {
  const opensAt = t('09:00');
  const closesAt = t('17:00');
  it('is open only between opensAt (inclusive) and closesAt (exclusive)', () => {
    expect(isPeriodOpen({ opensAt, closesAt }, t('09:00'))).toBe(true);
    expect(isPeriodOpen({ opensAt, closesAt }, t('08:59'))).toBe(false);
    expect(isPeriodOpen({ opensAt, closesAt }, t('17:00'))).toBe(false);
  });
  it('is closed when unset', () => {
    expect(isPeriodOpen({ opensAt: null, closesAt }, t('10:00'))).toBe(false);
  });
});

describe('validateEntries', () => {
  it('accepts valid input, including ng overlapping want in another dept', () => {
    expect(
      reasons([
        e('ng', null, '09:00', '10:00'),
        e('want', 1, '09:30', '11:00'),
        e('ok', 2, '09:30', '10:30'),
      ]),
    ).toEqual([]);
  });
  it('rejects non-5-minute and reversed ranges', () => {
    expect(reasons([e('ng', null, '09:03', '10:00')])).toContain('not_5_minute');
    expect(reasons([e('ng', null, '10:00', '10:00')])).toContain('end_before_start');
  });
  it('enforces department rules', () => {
    expect(reasons([e('ng', 1, '09:00', '10:00')])).toContain('ng_must_be_global');
    expect(reasons([e('want', null, '09:00', '10:00')])).toContain('department_required');
    expect(reasons([e('ok', 3, '09:00', '10:00')])).toContain('department_not_assigned');
  });
  it('rejects overlaps within the same group but allows adjacency', () => {
    expect(reasons([e('ng', null, '09:00', '10:00'), e('ng', null, '09:55', '11:00')])).toEqual([
      'overlap',
    ]);
    expect(reasons([e('want', 1, '09:00', '10:00'), e('ok', 1, '09:30', '11:00')])).toEqual([
      'overlap',
    ]);
    expect(reasons([e('want', 1, '09:00', '10:00'), e('ok', 1, '10:00', '11:00')])).toEqual([]);
  });
});
