import { dateKey, dayStart } from './datetime';

export type AvailabilityType = 'want' | 'ok' | 'ng';
/** 時刻はミリ秒。departmentId は ng のとき null（全部門共通） */
export type PaintEntry = {
  type: AvailabilityType;
  departmentId: number | null;
  start: number;
  end: number;
};

/** 行の識別子: 「入れない」行は null、「入りたい/入れる」は部門ID */
export const rowOf = (e: PaintEntry): number | null => (e.type === 'ng' ? null : e.departmentId);

/**
 * 行 row の [start,end) を type で塗る（null なら消す）。
 * 同じ行の既存の入力は範囲部分だけ削り、同じ種類で隣接・重なる入力は結合する。
 * 他の行は変更しない。サーバーの「同じ行で重ならない」ルールを必ず満たす。
 */
export function paint(
  entries: PaintEntry[],
  row: number | null,
  range: { start: number; end: number },
  type: AvailabilityType | null,
): PaintEntry[] {
  if (range.end <= range.start) return entries;
  const others = entries.filter((e) => rowOf(e) !== row);
  const mine: PaintEntry[] = [];
  for (const e of entries.filter((e) => rowOf(e) === row)) {
    if (e.end <= range.start || e.start >= range.end) mine.push(e);
    else {
      if (e.start < range.start) mine.push({ ...e, end: range.start });
      if (e.end > range.end) mine.push({ ...e, start: range.end });
    }
  }
  if (type !== null) mine.push({ type, departmentId: type === 'ng' ? null : row, ...range });
  mine.sort((a, b) => a.start - b.start);
  const merged: PaintEntry[] = [];
  for (const e of mine) {
    const last = merged[merged.length - 1];
    if (last && last.type === e.type && e.start <= last.end) last.end = Math.max(last.end, e.end);
    else merged.push({ ...e });
  }
  return [...others, ...merged];
}

/**
 * from の日の入力を to の日にコピーする。to の日の既存の入力は置き換える。
 * 日付の差は 24 時間単位（日本は夏時間なし）。
 */
export function copyDay(
  entries: PaintEntry[],
  from: string,
  to: string,
  /** 受付が終わった行は変えない（false を返した行は、コピーも置き換えもしない） */
  canEdit: (row: number | null) => boolean = () => true,
): PaintEntry[] {
  const shift = dayStart(to).getTime() - dayStart(from).getTime();
  const copied = entries
    .filter((e) => dateKey(e.start) === from && canEdit(rowOf(e)))
    .map((e) => ({ ...e, start: e.start + shift, end: e.end + shift }));
  return [...entries.filter((e) => dateKey(e.start) !== to || !canEdit(rowOf(e))), ...copied];
}
