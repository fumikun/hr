import type { Period, ScopeSetting } from './types.js';

const JST_OFFSET_MS = 9 * 3_600_000;

/** 日本時間での日付（YYYY-MM-DD）。枠がどの日のものかの判定に使う */
export const jstDay = (d: Date) => new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);

export type ScopeLevel = 'global' | 'department' | 'post';
export type Resolved = {
  opensAt: Date | null;
  closesAt: Date | null;
  days: string[];
  periodFrom: ScopeLevel;
  daysFrom: ScopeLevel;
};

export type ScopeContext = {
  /** 全体の受付期間 */
  global: Period;
  /** イベントの日程（調整の対象にできる日） */
  eventDays: string[];
  scopes: ScopeSetting[];
};

const hasPeriod = (s?: ScopeSetting) => !!s && (s.opensAt !== null || s.closesAt !== null);

/** 持ち場 → 部門 → 全体の順に、最初に設定のあるものを採用する */
export function resolveScope(
  ctx: ScopeContext,
  departmentId: number,
  postId?: number | null,
): Resolved {
  const dept = ctx.scopes.find((s) => s.type === 'department' && s.id === departmentId);
  const post =
    postId == null ? undefined : ctx.scopes.find((s) => s.type === 'post' && s.id === postId);

  let period: Period = ctx.global;
  let periodFrom: ScopeLevel = 'global';
  if (hasPeriod(dept)) [period, periodFrom] = [dept!, 'department'];
  if (hasPeriod(post)) [period, periodFrom] = [post!, 'post'];

  let days: string[] | null = null;
  let daysFrom: ScopeLevel = 'global';
  if (dept?.days) [days, daysFrom] = [dept.days, 'department'];
  if (post?.days) [days, daysFrom] = [post.days, 'post'];

  return {
    opensAt: period.opensAt,
    closesAt: period.closesAt,
    // イベントの日程から外れた日は対象にしない
    days: (days ?? ctx.eventDays).filter((d) => ctx.eventDays.includes(d)).sort(),
    periodFrom,
    daysFrom,
  };
}

/** 受付中か。開始・締切のどちらかが未設定なら受付していない扱い */
export function isOpenAt(p: Period, now: Date): boolean {
  if (!p.opensAt || !p.closesAt) return false;
  return p.opensAt <= now && now < p.closesAt;
}

/** その枠の日が、枠の持ち場で調整の対象になっているか */
export function isSlotTargeted(
  ctx: ScopeContext,
  slot: { departmentId: number; postId: number; startsAt: Date },
): boolean {
  return resolveScope(ctx, slot.departmentId, slot.postId).days.includes(jstDay(slot.startsAt));
}

export type DepartmentWindow = {
  departmentId: number;
  /** 本人が入れる持ち場のどれかが受付中か */
  open: boolean;
  /** 画面に出す期間。受付中ならいちばん早く締まるもの、そうでなければ次の開始、なければ最後の締切 */
  opensAt: Date | null;
  closesAt: Date | null;
  /** 本人が入れる持ち場の対象日の合計 */
  days: string[];
};

/**
 * 本人が希望を入れる部門ごとの、受付状況と対象日。
 * 希望（入りたい/入れる）は部門ごとなので、部門の受付は「入れる持ち場のどれかが受付中」で判断する。
 */
export function departmentWindows(
  ctx: ScopeContext,
  departmentIds: number[],
  posts: { id: number; departmentId: number; restricted: boolean; memberIds: number[] }[],
  userId: number,
  now: Date,
): DepartmentWindow[] {
  return departmentIds.map((departmentId) => {
    const eligible = posts.filter(
      (p) => p.departmentId === departmentId && (!p.restricted || p.memberIds.includes(userId)),
    );
    // 持ち場がない部門は、部門の設定で判断する
    const resolved = eligible.length
      ? eligible.map((p) => resolveScope(ctx, departmentId, p.id))
      : [resolveScope(ctx, departmentId)];
    const open = resolved.filter((r) => isOpenAt(r, now));
    let shown: Resolved | undefined;
    if (open.length) {
      shown = open.reduce((a, b) => (a.closesAt! <= b.closesAt! ? a : b));
    } else {
      const upcoming = resolved.filter((r) => r.opensAt && r.opensAt > now);
      shown = upcoming.length
        ? upcoming.reduce((a, b) => (a.opensAt! <= b.opensAt! ? a : b))
        : resolved.reduce((a, b) =>
            (a.closesAt?.getTime() ?? 0) >= (b.closesAt?.getTime() ?? 0) ? a : b,
          );
    }
    return {
      departmentId,
      open: open.length > 0,
      opensAt: shown.opensAt,
      closesAt: shown.closesAt,
      days: [...new Set(resolved.flatMap((r) => r.days))].sort(),
    };
  });
}
