import { describe, expect, it } from 'vitest';
import { findOverlaps, generateSlots } from './slots.js';

const d = (s: string) => new Date(`2026-11-01T${s}:00+09:00`);

describe('generateSlots', () => {
  const base = { departmentId: 1, minPeople: 2, maxPeople: 4 };
  it('tiles a window and drops the remainder', () => {
    const slots = generateSlots({
      ...base,
      windows: [{ startsAt: d('09:00'), endsAt: d('12:00') }],
      slotMinutes: 125,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ startsAt: d('09:00'), endsAt: d('11:05'), minPeople: 2 });
  });
  it('handles several windows', () => {
    const slots = generateSlots({
      ...base,
      windows: [
        { startsAt: d('09:00'), endsAt: d('10:30') },
        { startsAt: d('13:00'), endsAt: d('14:30') },
      ],
      slotMinutes: 45,
    });
    expect(slots.map((s) => s.startsAt)).toEqual([d('09:00'), d('09:45'), d('13:00'), d('13:45')]);
  });
  it('rejects non-5-minute sizes', () => {
    expect(() => generateSlots({ ...base, windows: [], slotMinutes: 42 })).toThrow();
  });
});

describe('findOverlaps', () => {
  it('ignores adjacency and other departments', () => {
    const s = (departmentId: number, a: string, b: string) => ({
      departmentId,
      startsAt: d(a),
      endsAt: d(b),
    });
    expect(
      findOverlaps([s(1, '09:00', '10:00'), s(1, '10:00', '11:00'), s(2, '09:30', '10:30')]),
    ).toEqual([]);
    expect(findOverlaps([s(1, '09:00', '10:00'), s(1, '09:55', '11:00')])).toEqual([[0, 1]]);
  });
});
