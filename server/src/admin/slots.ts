import type { SlotInput } from './types.js';

const STEP_MS = 5 * 60_000;

export type GenerateParams = {
  departmentId: number;
  /** 稼働する日付・時間帯（日ごとに1件以上） */
  windows: { startsAt: Date; endsAt: Date }[];
  slotMinutes: number;
  minPeople: number;
  maxPeople: number;
};

export const isFiveMinute = (d: Date) => d.getTime() % STEP_MS === 0;

/** 各稼働時間帯を slotMinutes ごとに区切る。端数（slotMinutes に満たない残り）は枠にしない。 */
export function generateSlots(p: GenerateParams): SlotInput[] {
  if (!Number.isInteger(p.slotMinutes) || p.slotMinutes <= 0 || p.slotMinutes % 5 !== 0)
    throw new Error('slotMinutes must be a positive multiple of 5');
  const out: SlotInput[] = [];
  for (const w of p.windows) {
    const len = p.slotMinutes * 60_000;
    for (let t = w.startsAt.getTime(); t + len <= w.endsAt.getTime(); t += len) {
      out.push({
        departmentId: p.departmentId,
        startsAt: new Date(t),
        endsAt: new Date(t + len),
        minPeople: p.minPeople,
        maxPeople: p.maxPeople,
      });
    }
  }
  return out;
}

/** 同一部門内で時間が重なる枠の組を返す（隣接は重なりではない） */
export function findOverlaps(slots: { departmentId: number; startsAt: Date; endsAt: Date }[]) {
  const byDept = new Map<number, typeof slots>();
  for (const s of slots) byDept.set(s.departmentId, [...(byDept.get(s.departmentId) ?? []), s]);
  const overlaps: [number, number][] = [];
  for (const list of byDept.values()) {
    const sorted = list
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s.startsAt.getTime() - b.s.startsAt.getTime());
    for (let a = 0; a < sorted.length; a++)
      for (let b = a + 1; b < sorted.length; b++) {
        if (sorted[b]!.s.startsAt >= sorted[a]!.s.endsAt) break;
        overlaps.push([sorted[a]!.i, sorted[b]!.i]);
      }
  }
  return overlaps;
}
