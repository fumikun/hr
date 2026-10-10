import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { hm } from '@/lib/datetime';
import { paint, type AvailabilityType, type PaintEntry } from '../lib/paint';
import { cellState, segments, type CellState, type Span } from '../lib/slotCells';

/** locked: 受付が終わっていて変更できない列 */
export type GridRow = { row: number | null; label: string; sub: string; locked?: boolean };

export const TYPE_STYLE: Record<AvailabilityType, string> = {
  ng: 'border-red-500 bg-red-200/80 text-red-900',
  want: 'border-emerald-600 bg-emerald-200/80 text-emerald-900',
  ok: 'border-sky-500 bg-sky-200/80 text-sky-900',
};
export const TYPE_LABEL: Record<AvailabilityType, string> = {
  ng: '入れない',
  want: '入りたい',
  ok: '入れる',
};

type Drag = { col: number | null; fill: boolean };

/**
 * 1日分の希望入力。縦が時間（その日のシフト枠の区切り）、横が「入れない」と各部門の列。
 * マスをタップすると、その枠全体を塗る／消す。マウスなら同じ列をドラッグして続けて塗れる。
 * 「入れない」列は全部門共通、部門の列は「入りたい」。塗らないマスは「入れる」。
 */
export function AvailabilityGrid({
  rows,
  entries,
  shifts,
  disabled,
  onChange,
}: {
  rows: GridRow[];
  entries: PaintEntry[];
  /** 部門ごとのその日のシフト枠 */
  shifts: Map<number, Span[]>;
  disabled: boolean;
  onChange: (next: PaintEntry[]) => void;
}) {
  const drag = useRef<Drag | null>(null);
  // マウスで押した直後の click を二重に処理しないための印
  const handledByPointer = useRef(false);

  useEffect(() => {
    const stop = () => {
      drag.current = null;
      // 押した場所と離した場所が違うと click が来ないので、click の処理が済んだあとに印を戻す
      setTimeout(() => (handledByPointer.current = false), 0);
    };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  // 時間の行: すべての部門の枠の区切り。部門の列のマスは、その部門の枠の区切りで、行をまたいで置く
  const allSpans = [...shifts.values()].flat();
  const lines = segments(allSpans);
  const lineAt = new Map(lines.map((l, i) => [l.start, i]));
  const lineEnd = new Map(lines.map((l, i) => [l.end, i]));
  const deptRows = rows.filter((r) => r.row !== null);
  const ngRow = rows.find((r) => r.row === null);

  const typeOf = (col: number | null): AvailabilityType => (col === null ? 'ng' : 'want');
  const stateOf = (col: number | null, cell: Span) => cellState(entries, col, typeOf(col), cell);
  const ngState = (cell: Span) => cellState(entries, null, 'ng', cell);
  const locked = (col: number | null) => disabled || !!rows.find((r) => r.row === col)?.locked;
  const cellsOf = (col: number | null) => (col === null ? lines : segments(shifts.get(col) ?? []));

  const apply = (col: number | null, cell: Span, fill: boolean, base = entries) =>
    paint(base, col, cell, fill ? typeOf(col) : null);

  function toggleAll(col: number | null) {
    const cells = cellsOf(col).filter((c) => col === null || ngState(c) !== 'on');
    const fill = !cells.every((c) => stateOf(col, c) === 'on');
    onChange(cells.reduce((acc, c) => apply(col, c, fill, acc), entries));
  }

  if (lines.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        この日はまだシフト枠がありません。
      </p>
    );
  }

  // その日に枠がない部門は列を出さない（スマホで横にはみ出さないように）
  const idle = deptRows.filter((r) => cellsOf(r.row).length === 0);
  const cols = [ngRow, ...deptRows.filter((r) => !idle.includes(r))].filter(
    (r): r is GridRow => !!r,
  );

  return (
    <div className="space-y-1">
      {idle.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {idle.map((r) => r.label).join('・')}は、この日のシフト枠がありません。
        </p>
      )}
      <div className="bg-card overflow-x-auto rounded-lg border select-none">
        <div
          className="grid min-w-full"
          style={{
            gridTemplateColumns: `4.75rem repeat(${cols.length}, minmax(5.5rem, 1fr))`,
            gridTemplateRows: `auto repeat(${lines.length}, minmax(2.75rem, auto))`,
          }}
        >
          {/* 見出し行 */}
          <div className="bg-card sticky left-0 z-20 border-r border-b" />
          {cols.map((c, i) => {
            const cells = cellsOf(c.row);
            const all = cells.length > 0 && cells.every((x) => stateOf(c.row, x) === 'on');
            return (
              <div
                key={String(c.row)}
                className="bg-card flex flex-col items-center gap-1 border-b px-1 py-2 text-center"
                style={{ gridColumn: i + 2 }}
              >
                <span className="text-sm leading-tight font-medium">{c.label}</span>
                <span className="text-muted-foreground text-xs leading-tight">{c.sub}</span>
                {/* 「入れない」列は、上の「終日 ×」と同じなので出さない */}
                {c.row !== null && !locked(c.row) && cells.length > 0 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:bg-accent min-h-9 rounded border px-2.5 text-xs sm:min-h-0 sm:px-1.5"
                    onClick={() => toggleAll(c.row)}
                  >
                    {all ? 'すべて解除' : c.row === null ? 'すべて ×' : 'すべて ◎'}
                  </button>
                )}
              </div>
            );
          })}

          {/* 時刻の列 */}
          {lines.map((l, i) => (
            <div
              key={l.start}
              className={cn(
                // 横にスクロールしても時刻が見えるように、左に固定する
                'text-muted-foreground bg-card sticky left-0 z-10 flex flex-col justify-center border-r px-2 text-xs tabular-nums',
                i > 0 && 'border-t',
                // 前の枠と時間が空いている（休憩など）ときは線を太くする
                i > 0 && lines[i - 1]!.end !== l.start && 'border-t-foreground/40 border-t-2',
              )}
              style={{ gridColumn: 1, gridRow: i + 2 }}
            >
              <span>{hm(l.start)}</span>
              <span>–{hm(l.end)}</span>
            </div>
          ))}

          {/* マス */}
          {cols.map((c, ci) => {
            return cellsOf(c.row).map((cell) => {
              const from = lineAt.get(cell.start)!;
              const to = lineEnd.get(cell.end)!;
              return (
                <Cell
                  key={`${String(c.row)}-${cell.start}`}
                  col={c.row}
                  cell={cell}
                  label={c.label}
                  state={stateOf(c.row, cell)}
                  // 部門の列: 「入れない」で埋まっている時間は入りたいを選べない
                  blocked={c.row !== null && ngState(cell) === 'on'}
                  locked={locked(c.row)}
                  style={{ gridColumn: ci + 2, gridRow: `${from + 2} / ${to + 3}` }}
                  onPointerDown={(e) => {
                    if (e.pointerType !== 'mouse' || e.button !== 0) return;
                    handledByPointer.current = true;
                    const fill = stateOf(c.row, cell) !== 'on';
                    drag.current = { col: c.row, fill };
                    onChange(apply(c.row, cell, fill));
                  }}
                  onPointerEnter={(e) => {
                    const d = drag.current;
                    if (!d || d.col !== c.row || (e.buttons & 1) === 0) return;
                    if (c.row !== null && ngState(cell) === 'on') return;
                    onChange(apply(c.row, cell, d.fill));
                  }}
                  onClick={() => {
                    // タッチ・キーボードはここで切り替える（スクロールしたときは click が来ない）
                    if (handledByPointer.current) return;
                    onChange(apply(c.row, cell, stateOf(c.row, cell) !== 'on'));
                  }}
                />
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}

const MARK: Record<'ng' | 'want', Record<CellState, string>> = {
  ng: { on: '× 入れない', partial: '一部 ×', off: '○' },
  want: { on: '◎ 入りたい', partial: '一部 ◎', off: '○' },
};

function Cell({
  col,
  cell,
  label,
  state,
  blocked,
  locked,
  style,
  onPointerDown,
  onPointerEnter,
  onClick,
}: {
  col: number | null;
  cell: Span;
  label: string;
  state: CellState;
  blocked: boolean;
  locked: boolean;
  style: React.CSSProperties;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: (e: React.PointerEvent) => void;
  onClick: () => void;
}) {
  const kind = col === null ? 'ng' : 'want';
  const time = `${hm(cell.start)}から${hm(cell.end)}`;
  const now = blocked
    ? '入れない'
    : state === 'on'
      ? TYPE_LABEL[kind]
      : state === 'partial'
        ? `一部${TYPE_LABEL[kind]}`
        : '入れる';
  return (
    <div className="border-t border-l p-1" style={style}>
      <button
        type="button"
        disabled={locked || blocked}
        aria-pressed={state === 'on'}
        aria-label={`${time}、${label}：${now}`}
        className={cn(
          'flex h-full min-h-10 w-full items-center justify-center rounded-md border text-sm transition-colors',
          'disabled:cursor-not-allowed',
          blocked
            ? 'border-transparent bg-red-100/60 text-red-900/60'
            : state === 'on'
              ? cn(TYPE_STYLE[kind], 'font-medium')
              : state === 'partial'
                ? cn(TYPE_STYLE[kind], 'border-dashed opacity-70')
                : 'text-muted-foreground hover:bg-accent border-dashed',
          locked && !blocked && 'opacity-60',
        )}
        style={
          state === 'partial' && !blocked
            ? {
                backgroundImage:
                  'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.6) 0 4px, transparent 4px 10px)',
              }
            : undefined
        }
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onClick={onClick}
      >
        {blocked ? '—' : MARK[kind][state]}
      </button>
    </div>
  );
}
