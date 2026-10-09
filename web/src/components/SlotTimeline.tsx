import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Post, Slot } from '../api';

const STEP = 5; // 分
const LABEL_PX = 112;
export const minToDate = (date: string, min: number) =>
  new Date(new Date(`${date}T00:00`).getTime() + min * 60_000);
const dayMinutes = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const fmt = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

type Range = { start: number; end: number };
type Drag =
  | { kind: 'create'; postId: number; anchor: number; range: Range; moved: boolean }
  | {
      kind: 'move' | 'left' | 'right';
      slot: Slot;
      grab: number;
      orig: Range;
      range: Range;
      moved: boolean;
    };

/**
 * 持ち場ごとの行に枠を並べる時間軸。
 * - 空き部分をドラッグ: 枠を新規作成（5分単位）。ドラッグせずクリック: その位置から1時間の枠
 * - 枠の本体をドラッグ: 移動 / 左右の端をドラッグ: 開始・終了の変更
 * - 枠をクリック: 詳細編集。同じ持ち場の枠と重なる操作は赤く表示して取り消す
 */
export function SlotTimeline({
  posts,
  slots,
  startHour,
  endHour,
  hourPx,
  selectedId,
  onCreate,
  onSelect,
  onChange,
  onReject,
}: {
  posts: Post[];
  slots: Slot[];
  startHour: number;
  endHour: number;
  hourPx: number;
  selectedId: number | null;
  onCreate: (postId: number, startMin: number, endMin: number) => void;
  onSelect: (slot: Slot) => void;
  onChange: (slot: Slot, startMin: number, endMin: number) => void;
  onReject: (message: string) => void;
}) {
  const minPx = hourPx / 60;
  const t0 = startHour * 60;
  const t1 = endHour * 60;
  const [drag, setDrag] = useState<Drag | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const snap = (min: number) => Math.min(t1, Math.max(t0, Math.round(min / STEP) * STEP));
  const minuteAt = (clientX: number) => {
    const rect = rowRef.current!.getBoundingClientRect();
    return t0 + (clientX - rect.left) / minPx;
  };
  const overlaps = (postId: number, r: Range, ignoreId?: number) =>
    slots.some(
      (s) =>
        s.postId === postId &&
        s.id !== ignoreId &&
        dayMinutes(s.startsAt) < r.end &&
        r.start < dayMinutes(s.endsAt),
    );

  function begin(e: React.PointerEvent<HTMLDivElement>, d: Drag) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    rowRef.current = e.currentTarget;
    setDrag(d);
  }
  function startCreate(e: React.PointerEvent<HTMLDivElement>, postId: number) {
    rowRef.current = e.currentTarget;
    const m = snap(minuteAt(e.clientX));
    begin(e, { kind: 'create', postId, anchor: m, range: { start: m, end: m }, moved: false });
  }
  function startSlotDrag(
    e: React.PointerEvent<HTMLElement>,
    slot: Slot,
    kind: 'move' | 'left' | 'right',
  ) {
    e.stopPropagation();
    const row = e.currentTarget.closest<HTMLDivElement>('[data-row]')!;
    rowRef.current = row;
    row.setPointerCapture(e.pointerId);
    const orig = { start: dayMinutes(slot.startsAt), end: dayMinutes(slot.endsAt) };
    setDrag({ kind, slot, grab: minuteAt(e.clientX), orig, range: orig, moved: false });
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const m = minuteAt(e.clientX);
    if (drag.kind === 'create') {
      const cur = snap(m);
      const range = { start: Math.min(drag.anchor, cur), end: Math.max(drag.anchor, cur) };
      setDrag({ ...drag, range, moved: drag.moved || range.end - range.start >= STEP });
      return;
    }
    const { orig } = drag;
    let range = orig;
    if (drag.kind === 'move') {
      const len = orig.end - orig.start;
      const start = Math.min(t1 - len, Math.max(t0, snap(orig.start + (m - drag.grab))));
      range = { start, end: start + len };
    } else if (drag.kind === 'left') {
      range = { start: Math.min(snap(m), orig.end - STEP), end: orig.end };
    } else {
      range = { start: orig.start, end: Math.max(snap(m), orig.start + STEP) };
    }
    setDrag({ ...drag, range, moved: drag.moved || Math.abs(m - drag.grab) * minPx > 4 });
  }
  function end() {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === 'create') {
      if (!d.moved) {
        // クリックのみ: クリック位置から1時間
        const start = Math.min(d.anchor, t1 - 60);
        const r = { start, end: start + 60 };
        if (overlaps(d.postId, r)) return onReject('その位置には既に枠があります');
        return onCreate(d.postId, r.start, r.end);
      }
      if (overlaps(d.postId, d.range)) return onReject('同じ持ち場の既存の枠と重なります');
      return onCreate(d.postId, d.range.start, d.range.end);
    }
    if (!d.moved) return onSelect(d.slot);
    if (d.range.start === d.orig.start && d.range.end === d.orig.end) return;
    if (overlaps(d.slot.postId, d.range, d.slot.id))
      return onReject('同じ持ち場の他の枠と重なるため、元に戻しました');
    onChange(d.slot, d.range.start, d.range.end);
  }

  return (
    <div className="bg-card overflow-x-auto rounded-lg border select-none">
      <div style={{ width: LABEL_PX + hours.length * hourPx }}>
        <div className="bg-card sticky top-0 z-10 flex border-b">
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
        {posts.map((post) => {
          const row = slots.filter((s) => s.postId === post.id);
          return (
            <div key={post.id} className="flex border-b last:border-b-0">
              <div
                className="bg-card sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r px-2 text-sm"
                style={{ width: LABEL_PX }}
              >
                <span className="truncate font-medium">{post.name}</span>
                <span className="text-muted-foreground text-xs">
                  {post.restricted ? `限定 ${post.memberIds.length}人` : '誰でも'}
                </span>
              </div>
              <div
                data-row
                className="relative h-14 cursor-crosshair"
                style={{
                  width: hours.length * hourPx,
                  // 1時間ごとの線 + 15分ごとの線 + 5分ごとの細線
                  backgroundImage: [
                    `repeating-linear-gradient(to right, rgb(0 0 0 / 0.3) 0 1px, transparent 1px ${hourPx}px)`,
                    `repeating-linear-gradient(to right, rgb(0 0 0 / 0.12) 0 1px, transparent 1px ${hourPx / 4}px)`,
                    `repeating-linear-gradient(to right, rgb(0 0 0 / 0.05) 0 1px, transparent 1px ${hourPx / 12}px)`,
                  ].join(','),
                }}
                onPointerDown={(e) => e.target === e.currentTarget && startCreate(e, post.id)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={() => setDrag(null)}
              >
                {row.map((s) => {
                  const dragging = drag && drag.kind !== 'create' && drag.slot.id === s.id;
                  const r = dragging
                    ? drag.range
                    : { start: dayMinutes(s.startsAt), end: dayMinutes(s.endsAt) };
                  const bad = dragging && overlaps(s.postId, r, s.id);
                  const wide = (r.end - r.start) * minPx;
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${fmt(r.start)}から${fmt(r.end)}、${s.minPeople}〜${s.maxPeople}人`}
                      className={cn(
                        'absolute inset-y-1 cursor-grab overflow-hidden rounded-md border px-2 py-0.5 text-xs shadow-sm',
                        selectedId === s.id
                          ? 'border-amber-500 bg-amber-100'
                          : 'border-sky-500 bg-sky-100',
                        bad && 'border-red-600 bg-red-200',
                        dragging && 'cursor-grabbing opacity-90',
                      )}
                      style={{ left: (r.start - t0) * minPx, width: wide }}
                      onPointerDown={(e) => startSlotDrag(e, s, 'move')}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(s)}
                    >
                      <div
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                        onPointerDown={(e) => startSlotDrag(e, s, 'left')}
                      />
                      <div
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                        onPointerDown={(e) => startSlotDrag(e, s, 'right')}
                      />
                      <div className="pointer-events-none truncate font-medium">
                        {fmt(r.start)}–{fmt(r.end)}
                      </div>
                      <div className="pointer-events-none truncate opacity-70">
                        {s.minPeople}〜{s.maxPeople}人
                      </div>
                    </div>
                  );
                })}
                {drag?.kind === 'create' && drag.postId === post.id && drag.moved && (
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-y-1 rounded-md border-2 border-dashed px-2 text-xs',
                      overlaps(post.id, drag.range)
                        ? 'border-red-600 bg-red-100'
                        : 'border-sky-600 bg-sky-50',
                    )}
                    style={{
                      left: (drag.range.start - t0) * minPx,
                      width: (drag.range.end - drag.range.start) * minPx,
                    }}
                  >
                    {fmt(drag.range.start)}–{fmt(drag.range.end)}（
                    {drag.range.end - drag.range.start}分）
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
