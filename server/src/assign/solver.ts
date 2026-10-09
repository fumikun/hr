import highsModule from 'highs';
import { ineligibleReason, overlaps, wantMs } from './model.js';
import type { Pair, SolveInput, SolveOptions, SolveResult } from './types.js';

// highs は CommonJS。NodeNext 下では型が名前空間になるため、使う部分だけ型を付け直す
type HighsLoader = () => Promise<{
  solve(
    problem: string,
    options?: Record<string, unknown>,
  ): { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }> };
}>;
const highsLoader = highsModule as unknown as HighsLoader;

/** 目的関数の重み（1時間あたり）。不足の解消 ≫ 上限超過 ≫ 目標との差 > 希望 > 偏り */
export const WEIGHTS = { shortage: 50, maxExceed: 40, targetDev: 2, want: 1.5, balance: 0.3 };

const HOUR = 3_600_000;
const term = (c: number, v: string) => `${c < 0 ? '-' : '+'} ${Math.abs(c)} ${v}`;

/**
 * 整数計画で割り当てを求める（HiGHS WASM）。
 * ハード: 不可時間・時間重複・最大人数・所属部門・持ち場の限定。
 * ソフト: 最低人数（不足は slack）・目標勤務時間・上限・「入りたい」・偏り。
 * 固定された割り当ては定数として扱い、その分の定員・時間・時間帯を差し引く。
 */
export async function solve(input: SolveInput, options: SolveOptions = {}): Promise<SolveResult> {
  const slotById = new Map(input.slots.map((s) => [s.id, s]));
  const userById = new Map(input.users.map((u) => [u.id, u]));
  const lockedBy = new Map<number, Pair[]>();
  for (const l of input.locked) lockedBy.set(l.userId, [...(lockedBy.get(l.userId) ?? []), l]);
  const lockedCount = new Map<number, number>();
  for (const l of input.locked) lockedCount.set(l.slotId, (lockedCount.get(l.slotId) ?? 0) + 1);
  const lockedHours = (userId: number) =>
    (lockedBy.get(userId) ?? []).reduce((n, l) => {
      const s = slotById.get(l.slotId);
      return s ? n + (s.end - s.start) / HOUR : n;
    }, 0);

  // 変数: 入れる人 × 枠
  type Var = { name: string; userId: number; slotId: number; hours: number };
  const vars: Var[] = [];
  for (const slot of input.slots) {
    const room = slot.maxPeople - (lockedCount.get(slot.id) ?? 0);
    if (room <= 0) continue;
    for (const user of input.users) {
      if (ineligibleReason(input, user, slot)) continue;
      const mine = lockedBy.get(user.id) ?? [];
      if (mine.some((l) => l.slotId === slot.id)) continue;
      if (mine.some((l) => overlaps(slotById.get(l.slotId) ?? { start: 0, end: 0 }, slot)))
        continue;
      vars.push({
        name: `x_${user.id}_${slot.id}`,
        userId: user.id,
        slotId: slot.id,
        hours: (slot.end - slot.start) / HOUR,
      });
    }
  }
  if (vars.length === 0) return { assignments: [], status: 'Optimal', objective: 0 };

  const byUser = new Map<number, Var[]>();
  const bySlot = new Map<number, Var[]>();
  for (const v of vars) {
    byUser.set(v.userId, [...(byUser.get(v.userId) ?? []), v]);
    bySlot.set(v.slotId, [...(bySlot.get(v.slotId) ?? []), v]);
  }

  const obj: string[] = [];
  const cons: string[] = [];
  const bounds: string[] = [];
  const sum = (vs: Var[], coef: (v: Var) => number = () => 1) =>
    vs.map((v) => term(coef(v), v.name)).join(' ');
  let n = 0;

  // 希望: 「入りたい」時間が重なる分だけ報酬
  for (const v of vars) {
    const w = wantMs(input.availabilities, v.userId, slotById.get(v.slotId)!) / HOUR;
    if (w > 0) obj.push(term(-WEIGHTS.want * w, v.name));
  }

  for (const slot of input.slots) {
    const vs = bySlot.get(slot.id) ?? [];
    const locked = lockedCount.get(slot.id) ?? 0;
    if (vs.length > 0) cons.push(`cap${n++}: ${sum(vs)} <= ${slot.maxPeople - locked}`);
    const need = slot.minPeople - locked;
    if (need > 0) {
      const sh = `sh_${slot.id}`;
      bounds.push(`0 <= ${sh} <= ${need}`);
      obj.push(term(WEIGHTS.shortage * ((slot.end - slot.start) / HOUR), sh));
      cons.push(`min${n++}: ${sum(vs)} + 1 ${sh} >= ${need}`);
    }
  }

  // 同じ人は同時に2か所に入れない: 各枠の開始時刻に重なる枠は高々1つ
  for (const [userId, vs] of byUser) {
    for (const anchor of new Set(vs.map((v) => slotById.get(v.slotId)!.start))) {
      const cover = vs.filter((v) => {
        const s = slotById.get(v.slotId)!;
        return s.start <= anchor && anchor < s.end;
      });
      if (cover.length > 1) cons.push(`one${n++}: ${sum(cover)} <= 1`);
    }
    const user = userById.get(userId)!;
    const base = lockedHours(userId);
    const hoursExpr = sum(vs, (v) => v.hours);
    if (user.targetMinutes !== null) {
      const over = `ov_${userId}`;
      const under = `un_${userId}`;
      bounds.push(`0 <= ${over}`, `0 <= ${under}`);
      obj.push(term(WEIGHTS.targetDev, over), term(WEIGHTS.targetDev, under));
      cons.push(
        `tgt${n++}: ${hoursExpr} - 1 ${over} + 1 ${under} = ${user.targetMinutes / 60 - base}`,
      );
    }
    if (user.maxMinutes !== null) {
      const ex = `mx_${userId}`;
      bounds.push(`0 <= ${ex}`);
      obj.push(term(WEIGHTS.maxExceed, ex));
      cons.push(`cmax${n++}: ${hoursExpr} - 1 ${ex} <= ${user.maxMinutes / 60 - base}`);
    }
    cons.push(`bal${n++}: ${hoursExpr} - 1 maxh <= ${-base}`);
  }
  bounds.push('0 <= maxh');
  obj.push(term(WEIGHTS.balance, 'maxh'));

  const lp = [
    'Minimize',
    ` obj: ${obj.join(' ')}`,
    'Subject To',
    ...cons.map((c) => ` ${c}`),
    'Bounds',
    ...bounds.map((b) => ` ${b}`),
    'Binary',
    ...vars.map((v) => ` ${v.name}`),
    'End',
  ].join('\n');

  const highs = await highsLoader();
  const result = highs.solve(lp, {
    time_limit: options.timeLimitSeconds ?? 60,
    mip_rel_gap: 0.01,
  });
  if (result.Status !== 'Optimal' && result.Status !== 'Time limit reached')
    throw new Error(`ソルバーが解を得られませんでした: ${result.Status}`);

  const assignments = vars
    .filter((v) => (result.Columns[v.name]?.Primal ?? 0) > 0.5)
    .map((v) => ({ userId: v.userId, slotId: v.slotId }));
  return { assignments, status: result.Status, objective: result.ObjectiveValue };
}
