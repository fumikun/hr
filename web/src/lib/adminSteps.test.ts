import { describe, expect, it } from 'vitest';
import { adminSteps } from './adminSteps';

type In = Parameters<typeof adminSteps>[0];
const base = (over: Partial<In> = {}): In =>
  ({
    period: { opensAt: null, closesAt: null },
    scopes: { departments: [], posts: [], scopes: [], eventDays: [] },
    status: [],
    slots: [],
    users: [{ id: 1 }],
    assign: { assignments: [], excludedSlotIds: [], shortages: [], violations: [] },
    run: null,
    ...over,
  }) as unknown as In;
const done = (d: In) => adminSteps(d).map((s) => s.done);
const current = (d: In) => adminSteps(d).find((s) => !s.done)?.title;

describe('adminSteps', () => {
  it('何も無ければ、最初の「ユーザーを登録する」が次', () => {
    expect(current(base())).toBe('ユーザーを登録する');
  });
  it('ユーザーが管理者1人だけでは完了にならない', () => {
    expect(done(base())[0]).toBe(false);
    expect(done(base({ users: [{ id: 1 }, { id: 2 }] as In['users'] }))[0]).toBe(true);
  });
  it('枠があれば「持ち場と枠」は完了', () => {
    expect(done(base({ slots: [{ id: 1 }] as In['slots'] }))[1]).toBe(true);
  });
  it('受付期間は、全部門に開始と締切があって初めて完了', () => {
    const dep = (o: string | null, c: string | null) => ({ opensAt: o, closesAt: c });
    const scopes = (deps: unknown[]) =>
      ({ departments: deps, posts: [], scopes: [], eventDays: [] }) as unknown as In['scopes'];
    expect(done(base({ scopes: scopes([dep('a', 'b'), dep('a', null)]) }))[2]).toBe(false);
    expect(done(base({ scopes: scopes([dep('a', 'b')]) }))[2]).toBe(true);
    expect(done(base({ scopes: scopes([]) }))[2]).toBe(false);
  });
  it('割り当てが完了していても、不足か未公開が残っていれば最後の手前は未完了', () => {
    const a = (status: string) => ({ userId: 1, slotId: 1, status });
    const assign = (assignments: unknown[], shortages: unknown[]) =>
      ({ assignments, excludedSlotIds: [], shortages, violations: [] }) as unknown as In['assign'];
    expect(done(base({ assign: assign([a('draft')], []) }))[5]).toBe(false);
    expect(done(base({ assign: assign([a('confirmed')], [{ slotId: 2, missing: 1 }]) }))[5]).toBe(
      false,
    );
    expect(done(base({ assign: assign([a('confirmed')], []) }))[5]).toBe(true);
  });
  it('割り当ては、実行が done のときだけ完了', () => {
    const run = (status: string) => ({ status, startedAt: '2026-10-10T00:00:00Z' }) as In['run'];
    expect(done(base({ run: run('failed') }))[4]).toBe(false);
    expect(done(base({ run: run('done') }))[4]).toBe(true);
  });
});
