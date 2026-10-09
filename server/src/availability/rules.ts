import type { AvailabilityEntry, Period } from './types.js';

const STEP_MS = 5 * 60_000;

/** 受付期間内か。開始・締切のどちらかが未設定なら受付していない扱い。 */
export function isPeriodOpen(period: Period, now: Date): boolean {
  if (!period.opensAt || !period.closesAt) return false;
  return period.opensAt <= now && now < period.closesAt;
}

export type EntryError = { index: number; reason: string };

/**
 * 希望入力の検証。
 * - 5分単位、終了 > 開始
 * - 「入れない」は全部門共通(departmentId=null)、「入りたい/入れる」は担当部門のみ
 * - 同じ区分(ng同士、同じ部門のwant/ok同士)で時間が重ならない
 */
export function validateEntries(
  entries: AvailabilityEntry[],
  allowedDepartmentIds: number[],
): EntryError[] {
  const errors: EntryError[] = [];
  entries.forEach((e, index) => {
    const bad = (reason: string) => errors.push({ index, reason });
    if (e.startsAt.getTime() % STEP_MS !== 0 || e.endsAt.getTime() % STEP_MS !== 0)
      bad('not_5_minute');
    if (e.endsAt <= e.startsAt) bad('end_before_start');
    if (e.type === 'ng') {
      if (e.departmentId !== null) bad('ng_must_be_global');
    } else if (e.departmentId === null) bad('department_required');
    else if (!allowedDepartmentIds.includes(e.departmentId)) bad('department_not_assigned');
  });
  const groups = new Map<string, number[]>();
  entries.forEach((e, i) => {
    const key = e.type === 'ng' ? 'ng' : `d${e.departmentId}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  for (const idx of groups.values()) {
    const sorted = [...idx].sort(
      (a, b) => entries[a]!.startsAt.getTime() - entries[b]!.startsAt.getTime(),
    );
    for (let k = 1; k < sorted.length; k++)
      if (entries[sorted[k]!]!.startsAt < entries[sorted[k - 1]!]!.endsAt)
        errors.push({ index: sorted[k]!, reason: 'overlap' });
  }
  return errors;
}
