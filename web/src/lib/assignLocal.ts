import type { AssignData, AssignmentRow } from '../api';

type SlotLike = { id: number; minPeople: number };

/** 割り当ての増減に合わせて、不足している枠を計算し直す（サーバーの結果を待たずに画面を更新するため） */
export function shortagesOf(
  slots: SlotLike[],
  assignments: Pick<AssignmentRow, 'slotId'>[],
): AssignData['shortages'] {
  const count = new Map<number, number>();
  for (const a of assignments) count.set(a.slotId, (count.get(a.slotId) ?? 0) + 1);
  return slots
    .map((s) => ({ slotId: s.id, missing: s.minPeople - (count.get(s.id) ?? 0) }))
    .filter((s) => s.missing > 0);
}

export function withLock(
  data: AssignData,
  userId: number,
  slotId: number,
  locked: boolean,
): AssignData {
  return {
    ...data,
    assignments: data.assignments.map((a) =>
      a.userId === userId && a.slotId === slotId ? { ...a, locked } : a,
    ),
  };
}

export function withoutPair(
  data: AssignData,
  slots: SlotLike[],
  userId: number,
  slotId: number,
): AssignData {
  const assignments = data.assignments.filter((a) => !(a.userId === userId && a.slotId === slotId));
  return {
    ...data,
    assignments,
    shortages: shortagesOf(slots, assignments),
    violations: data.violations.filter((v) => !(v.userId === userId && v.slotId === slotId)),
  };
}

/** 手動で追加した割り当て（固定・下書き）。違反の警告は、あとでサーバーの結果に置き換わる */
export function withPair(
  data: AssignData,
  slots: SlotLike[],
  userId: number,
  slotId: number,
): AssignData {
  if (data.assignments.some((a) => a.userId === userId && a.slotId === slotId)) return data;
  const assignments: AssignmentRow[] = [
    ...data.assignments,
    { userId, slotId, source: 'manual', locked: true, status: 'draft' },
  ];
  return { ...data, assignments, shortages: shortagesOf(slots, assignments) };
}
