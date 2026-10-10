import { rowOf, type AvailabilityType, type PaintEntry } from './paint';

/** [start,end) ミリ秒 */
export type Span = { start: number; end: number };

/**
 * 枠の区切り時刻でマスを作る。枠の開始・終了のすべてで区切り、どれかの枠に含まれる区間だけを残す。
 * 枠どうしの区切りが揃っていれば、マス = 枠 になる。
 */
export function segments(spans: Span[]): Span[] {
  const cuts = [...new Set(spans.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
  const out: Span[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const seg = { start: cuts[i]!, end: cuts[i + 1]! };
    if (spans.some((s) => s.start <= seg.start && seg.end <= s.end)) out.push(seg);
  }
  return out;
}

/** マスの塗られ方。on: マス全体 / partial: 一部だけ（以前の自由な塗り方の名残など） / off: なし */
export type CellState = 'on' | 'partial' | 'off';

export function cellState(
  entries: PaintEntry[],
  row: number | null,
  type: AvailabilityType,
  cell: Span,
): CellState {
  // 同じ行の入力は重ならないので、重なっている長さの合計でマス全体かどうかが分かる
  const covered = entries
    .filter((e) => rowOf(e) === row && e.type === type)
    .reduce(
      (n, e) => n + Math.max(0, Math.min(e.end, cell.end) - Math.max(e.start, cell.start)),
      0,
    );
  if (covered === 0) return 'off';
  return covered >= cell.end - cell.start ? 'on' : 'partial';
}
