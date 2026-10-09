import { canWorkPost } from '../admin/posts.js';
import type { Pair, SolveAvailability, SolveInput, SolveSlot, SolveUser } from './types.js';

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;
export const overlapMs = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

export type Violation = { userId: number; slotId: number; reason: Reason };
export type Reason =
  'not_in_department' | 'post_restricted' | 'unavailable' | 'double_booked' | 'over_capacity';

/** 1人がこの枠に入れない理由。入れるなら null（時間重複・定員は含まない） */
export function ineligibleReason(
  input: SolveInput,
  user: SolveUser,
  slot: SolveSlot,
): Reason | null {
  if (!user.departmentIds.includes(slot.departmentId)) return 'not_in_department';
  const post = input.posts.find((p) => p.id === slot.postId);
  if (post && !canWorkPost(post, { id: user.id, departmentIds: user.departmentIds }))
    return 'post_restricted';
  const blocked = input.availabilities.some(
    (a) => a.userId === user.id && a.type === 'ng' && overlaps(a, slot),
  );
  return blocked ? 'unavailable' : null;
}

/** 現在の割り当て全体に対する制約違反（手動編集時の警告・結果画面用） */
export function findViolations(input: SolveInput, pairs: Pair[]): Violation[] {
  const out: Violation[] = [];
  const slotById = new Map(input.slots.map((s) => [s.id, s]));
  const userById = new Map(input.users.map((u) => [u.id, u]));
  const count = new Map<number, number>();
  for (const p of pairs) count.set(p.slotId, (count.get(p.slotId) ?? 0) + 1);
  for (const p of pairs) {
    const slot = slotById.get(p.slotId);
    const user = userById.get(p.userId);
    if (!slot || !user) continue;
    const r = ineligibleReason(input, user, slot);
    if (r) out.push({ ...p, reason: r });
    if (
      pairs.some(
        (q) =>
          q.userId === p.userId &&
          q.slotId !== p.slotId &&
          overlaps(slotById.get(q.slotId) ?? { start: 0, end: 0 }, slot),
      )
    )
      out.push({ ...p, reason: 'double_booked' });
    if ((count.get(slot.id) ?? 0) > slot.maxPeople) out.push({ ...p, reason: 'over_capacity' });
  }
  return out;
}

/** 最低人数に足りない枠（解なしで止まらず、不足として一覧にする） */
export function findShortages(slots: SolveSlot[], pairs: Pair[]) {
  const count = new Map<number, number>();
  for (const p of pairs) count.set(p.slotId, (count.get(p.slotId) ?? 0) + 1);
  return slots
    .map((s) => ({ slotId: s.id, missing: s.minPeople - (count.get(s.id) ?? 0) }))
    .filter((s) => s.missing > 0);
}

export const wantMs = (avs: SolveAvailability[], user: number, slot: SolveSlot) =>
  avs
    .filter((a) => a.userId === user && a.type === 'want' && a.departmentId === slot.departmentId)
    .reduce((n, a) => n + overlapMs(a, slot), 0);
