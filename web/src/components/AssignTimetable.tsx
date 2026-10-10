import { Lock, LockOpen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { candidatesApi, type AdminUser, type AssignmentRow, type Post, type Slot } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pickRecommendation } from '@/lib/assignNav';
import { hm, hoursLabel } from '@/lib/datetime';
import { cn } from '@/lib/utils';

const HOUR_PX = 168;
const LABEL_PX = 112;
const CHIP_PX = 28;
const t = (iso: string) => new Date(iso).getTime();

type Props = {
  posts: Post[];
  slots: Slot[];
  assignments: AssignmentRow[];
  userById: Map<number, AdminUser>;
  missingOf: (slotId: number) => number;
  /** その人のその枠の警告の文言 */
  warningsOf: (userId: number, slotId: number) => string[];
  selected: number | null;
  disabled: boolean;
  onSelect: (slotId: number | null) => void;
  onMove: (userId: number, from: number, to: number) => void;
  onRemove: (userId: number, slotId: number) => void;
  onToggleLock: (a: AssignmentRow) => void;
  /** スマホ表示で、選んだ枠のすぐ下に出す操作パネル */
  renderPanel?: (slotId: number, compact: boolean) => ReactNode;
};

/**
 * 1部門・1日分の割り当て。スマホでは持ち場ごとの縦の一覧、sm 以上では横が時刻の時間割。
 */
export function AssignTimetable(props: Props) {
  return (
    <>
      <div className="sm:hidden">
        <AssignList {...props} />
      </div>
      <div className="hidden sm:block">
        <Timetable {...props} />
      </div>
    </>
  );
}

/**
 * スマホ用。持ち場ごとに、枠を時刻順の縦の一覧にする。タップした枠のすぐ下に操作パネルを出す。
 * タッチではドラッグで移せないので、移すときは「外す」→ 移したい枠で追加、の順に行う。
 */
function AssignList({
  posts,
  slots,
  assignments,
  userById,
  missingOf,
  warningsOf,
  selected,
  disabled,
  onSelect,
  onRemove,
  onToggleLock,
  renderPanel,
}: Props) {
  const selectedEl = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    selectedEl.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);
  return (
    <div className="space-y-4">
      {posts
        .filter((p) => slots.some((s) => s.postId === p.id))
        .map((post) => (
          <section key={post.id} className="space-y-2">
            <h3 className="text-sm font-semibold">
              {post.name}
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                {post.restricted ? `限定 ${post.memberIds.length}人` : '部門の誰でも'}
              </span>
            </h3>
            <ul className="space-y-2">
              {slots
                .filter((s) => s.postId === post.id)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                .map((s) => {
                  const people = assignments.filter((a) => a.slotId === s.id);
                  const missing = missingOf(s.id);
                  const isSel = selected === s.id;
                  return (
                    <li
                      key={s.id}
                      ref={isSel ? selectedEl : undefined}
                      className={cn(
                        // 下に固定した公開バーに隠れないよう、スクロールで寄せるときに余白をとる
                        'bg-card scroll-mt-16 scroll-mb-44 rounded-lg border',
                        missing > 0 && 'border-red-400',
                        isSel && 'ring-primary ring-2',
                      )}
                    >
                      <button
                        type="button"
                        aria-expanded={isSel}
                        className="flex min-h-12 w-full items-center justify-between gap-2 px-3 py-2 text-left"
                        onClick={() => onSelect(isSel ? null : s.id)}
                      >
                        <span className="font-medium tabular-nums">
                          {hm(s.startsAt)}–{hm(s.endsAt)}
                        </span>
                        <span className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground tabular-nums">
                            {people.length}/{s.minPeople}〜{s.maxPeople}人
                          </span>
                          {missing > 0 && <Badge variant="destructive">⚠ あと{missing}人</Badge>}
                        </span>
                      </button>
                      {people.length > 0 && (
                        <ul className="space-y-1 px-3 pb-2">
                          {people.map((a) => {
                            const name = userById.get(a.userId)?.name ?? '?';
                            const warns = warningsOf(a.userId, s.id);
                            return (
                              <li
                                key={a.userId}
                                className={cn(
                                  'flex items-center gap-1 rounded-md border pl-2 text-sm',
                                  warns.length > 0 ? 'border-red-300 bg-red-50' : 'bg-background',
                                )}
                              >
                                <span className="min-w-0 flex-1 py-1">
                                  <span className="block truncate">
                                    {name}
                                    {a.status === 'confirmed' && (
                                      <span className="text-muted-foreground text-xs"> ・公開</span>
                                    )}
                                  </span>
                                  {warns.length > 0 && (
                                    <span className="block text-xs text-red-700">
                                      ⚠ {warns.join('、')}
                                    </span>
                                  )}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={disabled}
                                  aria-pressed={a.locked}
                                  aria-label={`${name}さんをピン留め${a.locked ? '解除' : ''}`}
                                  className={a.locked ? 'text-amber-600' : 'text-muted-foreground'}
                                  onClick={() => onToggleLock(a)}
                                >
                                  {a.locked ? <Lock /> : <LockOpen />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={disabled}
                                  aria-label={`${name}さんを外す`}
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => onRemove(a.userId, s.id)}
                                >
                                  ×
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {isSel && renderPanel && (
                        <div className="border-t p-2">{renderPanel(s.id, true)}</div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
    </div>
  );
}

/**
 * sm 以上。1部門・1日分の時間割。横が時刻、縦が持ち場。名前をドラッグして別の枠に移せる。
 * 不足している枠は赤く、枠をクリックすると下に操作パネル（おすすめの追加など）が開く。
 */
function Timetable({
  posts,
  slots,
  assignments,
  userById,
  missingOf,
  warningsOf,
  selected,
  disabled,
  onSelect,
  onMove,
  onRemove,
  onToggleLock,
}: Props) {
  const drag = useRef<{ userId: number; from: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const selectedEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    selectedEl.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selected]);

  const range = useMemo(() => {
    const t0 = Math.min(...slots.map((s) => t(s.startsAt)));
    const t1 = Math.max(...slots.map((s) => t(s.endsAt)));
    const h = 3_600_000;
    const start = Math.floor(t0 / h) * h;
    const end = Math.ceil(t1 / h) * h;
    return {
      start,
      end,
      hours: Array.from({ length: (end - start) / h }, (_, i) => start + i * h),
    };
  }, [slots]);
  const px = (ms: number) => ((ms - range.start) / 3_600_000) * HOUR_PX;
  const rowsWithSlots = posts.filter((p) => slots.some((s) => s.postId === p.id));

  return (
    <div className="bg-card overflow-x-auto rounded-lg border">
      <div style={{ width: LABEL_PX + px(range.end) }}>
        <div className="flex border-b">
          <div
            className="bg-card sticky left-0 z-20 shrink-0 border-r"
            style={{ width: LABEL_PX }}
          />
          {range.hours.map((h) => (
            <div
              key={h}
              className="text-muted-foreground border-foreground/20 box-border shrink-0 border-l px-1 py-0.5 text-xs"
              style={{ width: HOUR_PX }}
            >
              {hm(h)}
            </div>
          ))}
        </div>
        {rowsWithSlots.map((post) => {
          const mine = slots.filter((s) => s.postId === post.id);
          const height = 36 + CHIP_PX * Math.max(...mine.map((s) => Math.max(s.maxPeople, 1)));
          return (
            <div key={post.id} className="flex border-b last:border-b-0">
              <div
                className="bg-card sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r px-2 text-sm"
                style={{ width: LABEL_PX }}
              >
                <span className="truncate font-medium">{post.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {post.restricted ? `限定 ${post.memberIds.length}人` : '部門の誰でも'}
                </span>
              </div>
              <div
                className="relative shrink-0"
                style={{
                  width: px(range.end),
                  height,
                  backgroundImage: `repeating-linear-gradient(to right, rgb(0 0 0 / 0.12) 0 1px, transparent 1px ${HOUR_PX}px)`,
                }}
              >
                {mine.map((s) => {
                  const people = assignments.filter((a) => a.slotId === s.id);
                  const missing = missingOf(s.id);
                  const isSel = selected === s.id;
                  return (
                    <div
                      key={s.id}
                      ref={isSel ? selectedEl : undefined}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSel}
                      aria-label={`${hm(s.startsAt)}から${hm(s.endsAt)}、${people.length}人${missing > 0 ? `、あと${missing}人必要` : ''}`}
                      className={cn(
                        'absolute inset-y-1 cursor-pointer overflow-hidden rounded-md border p-1 text-xs',
                        missing > 0 ? 'border-red-400 bg-red-50' : 'bg-background',
                        over === s.id && 'ring-primary ring-2',
                        isSel && 'ring-primary ring-2',
                      )}
                      style={{
                        left: px(t(s.startsAt)),
                        width: px(t(s.endsAt)) - px(t(s.startsAt)),
                      }}
                      onClick={() => onSelect(isSel ? null : s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(isSel ? null : s.id);
                        }
                      }}
                      onDragOver={(e) => {
                        if (!drag.current || drag.current.from === s.id) return;
                        e.preventDefault();
                        setOver(s.id);
                      }}
                      onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const d = drag.current;
                        drag.current = null;
                        setOver(null);
                        if (d && d.from !== s.id) onMove(d.userId, d.from, s.id);
                      }}
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-1">
                        <span className="text-muted-foreground tabular-nums">
                          {hm(s.startsAt)}–{hm(s.endsAt)}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 tabular-nums',
                            missing > 0 ? 'font-bold text-red-700' : 'text-muted-foreground',
                          )}
                        >
                          {people.length}/{s.minPeople}
                          {missing > 0 && ` ⚠${missing}`}
                        </span>
                      </div>
                      <ul className="space-y-0.5">
                        {people.map((a) => {
                          const name = userById.get(a.userId)?.name ?? '?';
                          const warns = warningsOf(a.userId, s.id);
                          const canDrag = !disabled && a.status !== 'confirmed';
                          return (
                            <li
                              key={a.userId}
                              draggable={canDrag}
                              title={
                                warns.length
                                  ? `要確認: ${warns.join('、')}`
                                  : canDrag
                                    ? 'ドラッグして別の枠へ移せます'
                                    : '公開済みの割り当ては移せません'
                              }
                              className={cn(
                                'flex items-center gap-0.5 rounded border px-1 leading-6',
                                canDrag && 'cursor-grab active:cursor-grabbing',
                                warns.length > 0 ? 'border-red-300 bg-red-100' : 'bg-card',
                              )}
                              onClick={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                drag.current = { userId: a.userId, from: s.id };
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', name);
                              }}
                              onDragEnd={() => {
                                drag.current = null;
                                setOver(null);
                              }}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {warns.length > 0 && '⚠'}
                                {name}
                                {a.status === 'confirmed' && (
                                  <span className="text-muted-foreground"> ・公開</span>
                                )}
                              </span>
                              <button
                                type="button"
                                disabled={disabled}
                                aria-pressed={a.locked}
                                aria-label={`${name}さんをピン留め${a.locked ? '解除' : ''}`}
                                className={cn(
                                  'shrink-0 p-0.5',
                                  a.locked ? 'text-amber-600' : 'text-muted-foreground',
                                )}
                                onClick={() => onToggleLock(a)}
                              >
                                {a.locked ? (
                                  <Lock className="size-3" />
                                ) : (
                                  <LockOpen className="size-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={disabled}
                                aria-label={`${name}さんを外す`}
                                className="text-muted-foreground hover:text-destructive shrink-0 px-0.5"
                                onClick={() => onRemove(a.userId, s.id)}
                              >
                                ×
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 選んだ枠の操作パネル。不足していれば、おすすめの1人をワンボタンで追加できる */
export function SlotPanel({
  slot,
  postName,
  assigned,
  users,
  missing,
  disabled,
  onAdd,
  onPick,
  compact = false,
}: {
  /** 枠のカードの中に出すとき。時刻・人数の見出しを省く */
  compact?: boolean;
  slot: Slot;
  postName: string;
  assigned: number[];
  users: AdminUser[];
  missing: number;
  disabled: boolean;
  onAdd: (userId: number) => void;
  onPick: () => void;
}) {
  const [best, setBest] = useState<
    | {
        user: AdminUser;
        wants: boolean;
        assignedMinutes: number;
      }
    | null
    | undefined
  >(undefined);
  const key = assigned.join(',');
  useEffect(() => {
    if (missing <= 0) return setBest(null);
    let alive = true;
    setBest(undefined);
    void candidatesApi(slot.id).then((cands) => {
      if (!alive) return;
      const byId = new Map(users.map((u) => [u.id, u]));
      const top = pickRecommendation(
        cands.filter((c) => byId.has(c.userId)),
        (id) => byId.get(id)?.targetMinutes,
      );
      setBest(top ? { user: byId.get(top.userId)!, ...top } : null);
    });
    return () => {
      alive = false;
    };
  }, [slot.id, key, missing, users]);

  const remain =
    best && best.user.targetMinutes !== null
      ? best.user.targetMinutes - best.assignedMinutes
      : null;
  return (
    <div className="bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      {!compact && (
        <>
          <span className="font-medium">
            {postName} {hm(slot.startsAt)}–{hm(slot.endsAt)}
          </span>
          <span className="text-muted-foreground">
            {assigned.length}/{slot.minPeople}〜{slot.maxPeople}人
          </span>
          {missing > 0 && <Badge variant="destructive">あと {missing} 人必要</Badge>}
        </>
      )}
      {missing > 0 && best === undefined && (
        <span className="text-muted-foreground">候補を探しています…</span>
      )}
      {missing > 0 && best && (
        <Button
          size="sm"
          className="h-auto min-h-8 py-1.5 text-left whitespace-normal"
          disabled={disabled}
          onClick={() => onAdd(best.user.id)}
        >
          おすすめ：{best.user.name}（{best.wants ? '入りたい・' : ''}
          {remain !== null && remain > 0
            ? `目標まであと${hoursLabel(remain)}`
            : `現在${hoursLabel(best.assignedMinutes)}`}
          ）を追加
        </Button>
      )}
      {missing > 0 && best === null && (
        <span className="text-muted-foreground">警告なしで入れる人がいません</span>
      )}
      <Button size="sm" variant="outline" disabled={disabled} onClick={onPick}>
        ほかの人を選ぶ
      </Button>
    </div>
  );
}
