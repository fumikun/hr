import { describe, expect, it } from 'vitest';
import { findShortages, findViolations } from './model.js';
import { solve } from './solver.js';
import type { SolveInput, SolveSlot, SolveUser } from './types.js';

const H = 3_600_000;
const t = (h: number) => new Date('2026-11-01T00:00:00+09:00').getTime() + h * H;
const user = (id: number, over: Partial<SolveUser> = {}): SolveUser => ({
  id,
  targetMinutes: null,
  maxMinutes: null,
  departmentIds: [1],
  ...over,
});
const slot = (id: number, a: number, b: number, over: Partial<SolveSlot> = {}): SolveSlot => ({
  id,
  departmentId: 1,
  postId: 1,
  start: t(a),
  end: t(b),
  minPeople: 1,
  maxPeople: 2,
  ...over,
});
const base = (over: Partial<SolveInput>): SolveInput => ({
  users: [],
  posts: [{ id: 1, departmentId: 1, restricted: false, memberIds: [] }],
  slots: [],
  availabilities: [],
  locked: [],
  ...over,
});
const pairs = (r: { assignments: { userId: number; slotId: number }[] }) =>
  r.assignments.map((a) => `${a.userId}:${a.slotId}`).sort();

describe('solve: hard constraints', () => {
  it('never assigns someone during an ng period', async () => {
    const input = base({
      users: [user(1), user(2)],
      slots: [slot(1, 9, 10, { maxPeople: 1 })],
      availabilities: [{ userId: 1, type: 'ng', departmentId: null, start: t(9.5), end: t(11) }],
    });
    expect(pairs(await solve(input))).toEqual(['2:1']);
  });

  it('does not double-book overlapping slots, even across departments', async () => {
    const input = base({
      users: [user(1, { departmentIds: [1, 2] })],
      posts: [
        { id: 1, departmentId: 1, restricted: false, memberIds: [] },
        { id: 2, departmentId: 2, restricted: false, memberIds: [] },
      ],
      slots: [slot(1, 9, 11), slot(2, 10, 12, { departmentId: 2, postId: 2 })],
    });
    const r = await solve(input);
    expect(r.assignments).toHaveLength(1);
    expect(findViolations(input, r.assignments)).toEqual([]);
    expect(findShortages(input.slots, r.assignments)).toHaveLength(1);
  });

  it('allows back-to-back slots', async () => {
    const input = base({ users: [user(1)], slots: [slot(1, 9, 10), slot(2, 10, 11)] });
    expect(pairs(await solve(input))).toEqual(['1:1', '1:2']);
  });

  it('respects max people', async () => {
    const input = base({
      users: [user(1), user(2), user(3)],
      slots: [slot(1, 9, 10, { minPeople: 3, maxPeople: 2 })],
    });
    expect((await solve(input)).assignments).toHaveLength(2);
  });

  it('only uses people registered in the slot department', async () => {
    const input = base({
      users: [user(1, { departmentIds: [2] }), user(2)],
      slots: [slot(1, 9, 10, { minPeople: 2 })],
    });
    expect(pairs(await solve(input))).toEqual(['2:1']);
  });

  it('keeps restricted posts to their members', async () => {
    const input = base({
      users: [user(1), user(2)],
      posts: [{ id: 1, departmentId: 1, restricted: true, memberIds: [2] }],
      slots: [slot(1, 9, 10, { minPeople: 2 })],
    });
    expect(pairs(await solve(input))).toEqual(['2:1']);
  });
});

describe('solve: shortages instead of failing', () => {
  it('returns a partial result and reports the missing people', async () => {
    const input = base({
      users: [user(1)],
      slots: [slot(1, 9, 10, { minPeople: 3, maxPeople: 3 })],
    });
    const r = await solve(input);
    expect(pairs(r)).toEqual(['1:1']);
    expect(findShortages(input.slots, r.assignments)).toEqual([{ slotId: 1, missing: 2 }]);
  });

  it('works with no candidates at all', async () => {
    const input = base({ users: [], slots: [slot(1, 9, 10)] });
    const r = await solve(input);
    expect(r.assignments).toEqual([]);
    expect(findShortages(input.slots, r.assignments)).toEqual([{ slotId: 1, missing: 1 }]);
  });
});

describe('solve: locked assignments', () => {
  it('counts locked people toward the slot and blocks their other slots', async () => {
    const input = base({
      users: [user(1), user(2)],
      slots: [slot(1, 9, 11, { minPeople: 1, maxPeople: 1 }), slot(2, 10, 12, { minPeople: 1 })],
      locked: [{ userId: 1, slotId: 1 }],
    });
    const r = await solve(input);
    // 枠1は固定で満員。ユーザー1は枠2と重なるので入れない
    expect(pairs(r)).toEqual(['2:2']);
  });
});

describe('solve: soft constraints', () => {
  it('moves people toward their target hours', async () => {
    const input = base({
      users: [user(1, { targetMinutes: 120 }), user(2, { targetMinutes: 60 })],
      slots: [
        slot(1, 9, 10, { minPeople: 0 }),
        slot(2, 10, 11, { minPeople: 0 }),
        slot(3, 11, 12, { minPeople: 0 }),
      ],
    });
    const r = await solve(input);
    const hours = (id: number) => r.assignments.filter((a) => a.userId === id).length;
    expect(hours(1)).toBe(2);
    expect(hours(2)).toBe(1);
  });

  it('avoids exceeding a max when others can cover', async () => {
    const input = base({
      users: [user(1, { maxMinutes: 60 }), user(2)],
      slots: [slot(1, 9, 10, { maxPeople: 1 }), slot(2, 10, 11, { maxPeople: 1 })],
    });
    const r = await solve(input);
    expect(r.assignments.filter((a) => a.userId === 1).length).toBeLessThanOrEqual(1);
    expect(findShortages(input.slots, r.assignments)).toEqual([]);
  });

  it('prefers people who want the slot', async () => {
    const input = base({
      users: [user(1), user(2)],
      slots: [slot(1, 9, 10, { minPeople: 1, maxPeople: 1 })],
      availabilities: [{ userId: 2, type: 'want', departmentId: 1, start: t(9), end: t(10) }],
    });
    // 最低人数だけを満たせば足りるので、希望者が選ばれる
    expect(pairs(await solve(input))).toEqual(['2:1']);
  });

  it('spreads the load instead of piling it on one person', async () => {
    const input = base({
      users: [user(1), user(2)],
      slots: [slot(1, 9, 10, { maxPeople: 1 }), slot(2, 10, 11, { maxPeople: 1 })],
    });
    const r = await solve(input);
    expect(new Set(r.assignments.map((a) => a.userId)).size).toBe(2);
  });
});

describe('findViolations', () => {
  it('flags manual edits that break the rules', () => {
    const input = base({
      users: [user(1), user(2, { departmentIds: [2] })],
      slots: [slot(1, 9, 11, { maxPeople: 1 }), slot(2, 10, 12)],
      availabilities: [{ userId: 1, type: 'ng', departmentId: null, start: t(8), end: t(9.5) }],
    });
    const v = findViolations(input, [
      { userId: 1, slotId: 1 },
      { userId: 1, slotId: 2 },
      { userId: 2, slotId: 1 },
    ]);
    const reasons = v.map((x) => `${x.userId}:${x.slotId}:${x.reason}`);
    expect(reasons).toContain('1:1:unavailable');
    expect(reasons).toContain('1:1:double_booked');
    expect(reasons).toContain('2:1:not_in_department');
    expect(reasons).toContain('1:1:over_capacity');
  });
});
