import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { paint, rowOf, type AvailabilityType, type PaintEntry } from '../lib/paint';

const STEP = 5 * 60_000;
const LABEL_PX = 112;
const CELL = 30 * 60_000; // クリック／タップで塗る単位

export type GridRow = { row: number | null; label: string; sub: string };
export type Tool = 'want' | 'ok' | 'erase';

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

const fmt = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 1日分の希望入力グリッド。行ごとにドラッグで塗る（5分単位）。
 * クリック／タップは30分の塗り・消しのトグル。薄い灰色の帯はその部門にシフト枠がある時間。
 */
export function AvailabilityGrid({
  dayStart,
  startHour,
  endHour,
  hourPx,
  rows,
  entries,
  shifts,
  tool,
  disabled,
  touchPaint,
  onChange,
}: {
  dayStart: number;
  startHour: number;
  endHour: number;
  hourPx: number;
  rows: GridRow[];
  entries: PaintEntry[];
  /** 部門ごとのシフト枠 [start,end) （ミリ秒） */
  shifts: Map<number, { start: number; end: number }[]>;
  tool: Tool;
  disabled: boolean;
  /** true: 指でのドラッグで塗る（スクロールは止まる）。false: 指のドラッグはスクロール、タップで30分を塗る */
  touchPaint: boolean;
  onChange: (next: PaintEntry[]) => void;
}) {
  const msPx = hourPx / 3_600_000;
  const t0 = dayStart + startHour * 3_600_000;
  const t1 = dayStart + endHour * 3_600_000;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const [drag, setDrag] = useState<{
    row: number | null;
    anchor: number;
    cur: number;
    moved: boolean;
  } | null>(null);
  const rowEl = useRef<HTMLDivElement | null>(null);

  const snap = (ms: number) => Math.min(t1, Math.max(t0, Math.round(ms / STEP) * STEP));
  const at = (clientX: number) =>
    t0 + (clientX - rowEl.current!.getBoundingClientRect().left) / msPx;
  const typeFor = (row: number | null): AvailabilityType | null =>
    tool === 'erase' ? null : row === null ? 'ng' : tool;

  function down(e: React.PointerEvent<HTMLDivElement>, row: number | null) {
    if (disabled || e.button !== 0) return;
    rowEl.current = e.currentTarget;
    e.currentTarget.setPointerCapture(e.pointerId);
    const m = snap(at(e.clientX));
    setDrag({ row, anchor: m, cur: m, moved: false });
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const cur = snap(at(e.clientX));
    setDrag({ ...drag, cur, moved: drag.moved || Math.abs(cur - drag.anchor) >= STEP });
  }
  function up() {
    const d = drag;
    setDrag(null);
    if (!d) return;
    const type = typeFor(d.row);
    if (d.moved) {
      return onChange(
        paint(
          entries,
          d.row,
          { start: Math.min(d.anchor, d.cur), end: Math.max(d.anchor, d.cur) },
          type,
        ),
      );
    }
    // クリック: 30分の枠で塗る。同じ種類で既に塗られていれば消す
    const start = Math.min(Math.floor((d.anchor - t0) / CELL) * CELL + t0, t1 - CELL);
    const cell = { start, end: start + CELL };
    const covered = entries.some(
      (e) => rowOf(e) === d.row && e.type === type && e.start <= cell.start && e.end >= cell.end,
    );
    onChange(paint(entries, d.row, cell, covered ? null : type));
  }

  return (
    <div className="bg-card overflow-x-auto rounded-lg border select-none">
      <div style={{ width: LABEL_PX + hours.length * hourPx }}>
        <div className="flex border-b">
          <div
            className="bg-card sticky left-0 z-20 shrink-0 border-r"
            style={{ width: LABEL_PX }}
          />
          {hours.map((h) => (
            <div
              key={h}
              className="text-muted-foreground border-foreground/30 box-border shrink-0 border-l px-1 py-0.5 text-xs"
              style={{ width: hourPx }}
            >
              {h}:00
            </div>
          ))}
        </div>
        {rows.map(({ row, label, sub }) => (
          <div key={String(row)} className="flex border-b last:border-b-0">
            <div
              className="bg-card sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r px-2 text-sm"
              style={{ width: LABEL_PX }}
            >
              <span className="truncate font-medium">{label}</span>
              <span className="text-muted-foreground truncate text-xs">{sub}</span>
            </div>
            <div
              className={cn(
                'relative h-14',
                disabled ? 'cursor-not-allowed' : 'cursor-crosshair',
                touchPaint && 'touch-none',
              )}
              style={{
                width: hours.length * hourPx,
                backgroundImage: [
                  `repeating-linear-gradient(to right, rgb(0 0 0 / 0.3) 0 1px, transparent 1px ${hourPx}px)`,
                  `repeating-linear-gradient(to right, rgb(0 0 0 / 0.12) 0 1px, transparent 1px ${hourPx / 4}px)`,
                ].join(','),
              }}
              onPointerDown={(e) => down(e, row)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => setDrag(null)}
            >
              {row !== null &&
                (shifts.get(row) ?? []).map((s, i) => (
                  <div
                    key={i}
                    className="bg-muted-foreground/15 pointer-events-none absolute inset-y-0"
                    style={{ left: (s.start - t0) * msPx, width: (s.end - s.start) * msPx }}
                  />
                ))}
              {entries
                .filter((e) => rowOf(e) === row && e.end > t0 && e.start < t1)
                .map((e) => (
                  <div
                    key={`${e.type}-${e.start}`}
                    className={cn(
                      'pointer-events-none absolute inset-y-2 overflow-hidden rounded border px-1 text-xs',
                      TYPE_STYLE[e.type],
                    )}
                    style={{ left: (e.start - t0) * msPx, width: (e.end - e.start) * msPx }}
                  >
                    {TYPE_LABEL[e.type]} {fmt(e.start)}–{fmt(e.end)}
                  </div>
                ))}
              {drag?.row === row && drag.moved && (
                <div
                  className="pointer-events-none absolute inset-y-1 rounded border-2 border-dashed border-black/50 bg-black/10 px-1 text-xs"
                  style={{
                    left: (Math.min(drag.anchor, drag.cur) - t0) * msPx,
                    width: Math.abs(drag.cur - drag.anchor) * msPx,
                  }}
                >
                  {fmt(Math.min(drag.anchor, drag.cur))}–{fmt(Math.max(drag.anchor, drag.cur))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
