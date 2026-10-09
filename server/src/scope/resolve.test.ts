import { describe, expect, it } from 'vitest';
import {
  departmentWindows,
  isOpenAt,
  isSlotTargeted,
  jstDay,
  resolveScope,
  type ScopeContext,
} from './resolve.js';
import type { ScopeSetting } from './types.js';

const at = (s: string) => new Date(s);
const EVENT = ['2026-11-07', '2026-11-08'];
const ctx = (
  scopes: ScopeSetting[] = [],
  global = { opensAt: at('2026-10-12T00:00:00Z'), closesAt: at('2026-10-19T00:00:00Z') },
): ScopeContext => ({
  global,
  eventDays: EVENT,
  scopes,
});
const scope = (over: Partial<ScopeSetting>): ScopeSetting => ({
  type: 'department',
  id: 1,
  opensAt: null,
  closesAt: null,
  days: null,
  ...over,
});

describe('jstDay', () => {
  it('uses Japan time for the date', () => {
    expect(jstDay(at('2026-11-06T15:00:00Z'))).toBe('2026-11-07'); // 日本時間 0:00
    expect(jstDay(at('2026-11-06T14:59:00Z'))).toBe('2026-11-06');
  });
});

describe('resolveScope', () => {
  it('falls back to the global period and all event days', () => {
    const r = resolveScope(ctx(), 1, 10);
    expect(r).toMatchObject({ periodFrom: 'global', daysFrom: 'global', days: EVENT });
    expect(r.closesAt).toEqual(at('2026-10-19T00:00:00Z'));
  });

  it('prefers post over department over global', () => {
    const scopes = [
      scope({
        type: 'department',
        id: 1,
        closesAt: at('2026-10-20T00:00:00Z'),
        opensAt: at('2026-10-13T00:00:00Z'),
      }),
      scope({
        type: 'post',
        id: 10,
        closesAt: at('2026-10-25T00:00:00Z'),
        opensAt: at('2026-10-14T00:00:00Z'),
      }),
    ];
    expect(resolveScope(ctx(scopes), 1, 10)).toMatchObject({
      periodFrom: 'post',
      closesAt: at('2026-10-25T00:00:00Z'),
    });
    expect(resolveScope(ctx(scopes), 1, 11)).toMatchObject({
      periodFrom: 'department',
      closesAt: at('2026-10-20T00:00:00Z'),
    });
    expect(resolveScope(ctx(scopes), 2, 20)).toMatchObject({ periodFrom: 'global' });
  });

  it('resolves period and days independently', () => {
    const scopes = [scope({ type: 'post', id: 10, days: ['2026-11-08'] })];
    expect(resolveScope(ctx(scopes), 1, 10)).toMatchObject({
      periodFrom: 'global',
      daysFrom: 'post',
      days: ['2026-11-08'],
    });
  });

  it('ignores days that are no longer part of the event', () => {
    const scopes = [scope({ days: ['2026-11-08', '2026-12-01'] })];
    expect(resolveScope(ctx(scopes), 1).days).toEqual(['2026-11-08']);
  });
});

describe('isOpenAt', () => {
  it('needs both ends and treats the close time as exclusive', () => {
    const p = { opensAt: at('2026-10-12T00:00:00Z'), closesAt: at('2026-10-19T00:00:00Z') };
    expect(isOpenAt(p, at('2026-10-12T00:00:00Z'))).toBe(true);
    expect(isOpenAt(p, at('2026-10-19T00:00:00Z'))).toBe(false);
    expect(isOpenAt({ opensAt: null, closesAt: p.closesAt }, at('2026-10-13T00:00:00Z'))).toBe(
      false,
    );
  });
});

describe('isSlotTargeted', () => {
  it('excludes slots on days the post does not cover', () => {
    const scopes = [scope({ type: 'post', id: 10, days: ['2026-11-07'] })];
    const slot = (iso: string, postId: number) => ({ departmentId: 1, postId, startsAt: at(iso) });
    expect(isSlotTargeted(ctx(scopes), slot('2026-11-07T01:00:00Z', 10))).toBe(true);
    expect(isSlotTargeted(ctx(scopes), slot('2026-11-08T01:00:00Z', 10))).toBe(false);
    expect(isSlotTargeted(ctx(scopes), slot('2026-11-08T01:00:00Z', 11))).toBe(true); // 他の持ち場は全日程
  });
});

describe('departmentWindows', () => {
  const now = at('2026-10-15T00:00:00Z');
  const posts = [
    { id: 10, departmentId: 1, restricted: false, memberIds: [] },
    { id: 11, departmentId: 1, restricted: true, memberIds: [99] },
  ];

  it('is open when any post the user can work is open', () => {
    // 全体は締切済みだが、持ち場10だけ延長されている
    const c = ctx(
      [
        scope({
          type: 'post',
          id: 10,
          opensAt: at('2026-10-12T00:00:00Z'),
          closesAt: at('2026-10-30T00:00:00Z'),
        }),
      ],
      { opensAt: at('2026-10-01T00:00:00Z'), closesAt: at('2026-10-10T00:00:00Z') },
    );
    const [w] = departmentWindows(c, [1], posts, 5, now);
    expect(w).toMatchObject({ open: true, closesAt: at('2026-10-30T00:00:00Z') });
  });

  it('ignores restricted posts the user is not a member of', () => {
    const c = ctx(
      [
        scope({
          type: 'post',
          id: 11,
          opensAt: at('2026-10-12T00:00:00Z'),
          closesAt: at('2026-10-30T00:00:00Z'),
        }),
      ],
      { opensAt: at('2026-10-01T00:00:00Z'), closesAt: at('2026-10-10T00:00:00Z') },
    );
    expect(departmentWindows(c, [1], posts, 5, now)[0]!.open).toBe(false); // 非メンバー
    expect(departmentWindows(c, [1], posts, 99, now)[0]!.open).toBe(true); // メンバー
  });

  it('shows the soonest closing period and the union of target days', () => {
    const c = ctx([
      scope({
        type: 'post',
        id: 10,
        days: ['2026-11-07'],
        opensAt: at('2026-10-12T00:00:00Z'),
        closesAt: at('2026-10-18T00:00:00Z'),
      }),
      scope({ type: 'post', id: 11, days: ['2026-11-08'] }),
    ]);
    const [w] = departmentWindows(c, [1], posts, 99, now);
    expect(w).toMatchObject({ open: true, closesAt: at('2026-10-18T00:00:00Z'), days: EVENT });
  });

  it('falls back to the department setting when it has no posts', () => {
    const [w] = departmentWindows(ctx(), [7], [], 5, now);
    expect(w).toMatchObject({ departmentId: 7, open: true, days: EVENT });
  });
});
