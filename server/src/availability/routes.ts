import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { validateEntries } from './rules.js';
import type { Department, Post, Slot } from '../admin/types.js';
import { loadScopeContext } from '../scope/context.js';
import { departmentWindows, isSlotTargeted, type DepartmentWindow } from '../scope/resolve.js';
import type { ScopeStore } from '../scope/types.js';
import type { AvailabilityEntry, AvailabilityStore } from './types.js';

/** 画面に必要な部門名・持ち場・枠と、部門・持ち場ごとの受付設定 */
export type AvailabilityContext = ScopeStore & {
  listDepartments(): Promise<Department[]>;
  listPosts(): Promise<Post[]>;
  listSlots(): Promise<Slot[]>;
};
type Deps = AvailabilityStore & AvailabilityContext;

const entriesBody = z.object({
  entries: z
    .array(
      z.object({
        type: z.enum(['want', 'ok', 'ng']),
        departmentId: z.number().int().nullable(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
      }),
    )
    .max(2000),
});

const periodBody = z
  .object({ opensAt: z.coerce.date().nullable(), closesAt: z.coerce.date().nullable() })
  .refine((p) => !p.opensAt || !p.closesAt || p.closesAt > p.opensAt, {
    message: 'closesAt must be after opensAt',
    path: ['closesAt'],
  });

/** 本人が希望を入れる部門（希望入力が必要な役職の部門）ごとの受付状況 */
async function windowsFor(store: Deps, userId: number) {
  const [ctx, roles, posts] = await Promise.all([
    loadScopeContext(store),
    store.getUserRoles(userId),
    store.listPosts(),
  ]);
  const needed = (roles ?? []).filter((r) => r.requiresAvailability).map((r) => r.departmentId);
  return { ctx, posts, needed, windows: departmentWindows(ctx, needed, posts, userId, new Date()) };
}

/** 入力の行ごとの内容（比較用）。「入れない」は 'ng'、「入りたい／入れる」は部門ごと */
function rowsOf(entries: AvailabilityEntry[]): Map<string, string> {
  const rows = new Map<string, string[]>();
  for (const e of entries) {
    const key = e.type === 'ng' ? 'ng' : `d${e.departmentId}`;
    rows.set(key, [
      ...(rows.get(key) ?? []),
      `${e.type}|${e.startsAt.getTime()}|${e.endsAt.getTime()}`,
    ]);
  }
  return new Map([...rows].map(([k, v]) => [k, v.sort().join(',')]));
}

/**
 * 一般ユーザーの保存。受付が終わった部門の入力は変えられない（変えていない行は、そのままでよい）。
 * 「入れない」は全部門共通なので、どれかの部門が受付中なら編集できる。
 */
async function saveAsUser(store: Deps, c: Context, userId: number, entries: AvailabilityEntry[]) {
  const { windows } = await windowsFor(store, userId);
  const anyOpen = windows.some((w) => w.open);
  if (!anyOpen) return c.json({ error: 'period_closed', rows: [] }, 403);
  const openDept = new Map(windows.map((w) => [w.departmentId, w.open]));
  const before = rowsOf((await store.getAvailability(userId)).entries);
  const after = rowsOf(entries);
  const closed = [...new Set([...before.keys(), ...after.keys()])].filter((key) => {
    if (before.get(key) === after.get(key)) return false;
    return key === 'ng' ? !anyOpen : !(openDept.get(Number(key.slice(1))) ?? anyOpen);
  });
  if (closed.length > 0) return c.json({ error: 'period_closed', rows: closed }, 403);
  return save(store, c, userId, entries, userId);
}

/** 検証して保存する。対象ユーザーの担当部門に限る。 */
async function save(
  store: AvailabilityStore,
  c: Context,
  userId: number,
  entries: AvailabilityEntry[],
  actorId: number,
) {
  const roles = await store.getUserRoles(userId);
  if (!roles) return c.json({ error: 'not_found' }, 404);
  const errors = validateEntries(
    entries,
    roles.map((r) => r.departmentId),
  );
  if (errors.length > 0) return c.json({ errors }, 422);
  await store.replaceAvailability(userId, entries, actorId);
  return c.json({ ok: true });
}

/** 見出しに出す期間: 受付中の部門でいちばん早く締まるもの → 次に始まるもの → 最後に締まったもの */
function headline(windows: DepartmentWindow[]): { opensAt: Date | null; closesAt: Date | null } {
  const open = windows.filter((w) => w.open);
  if (open.length > 0) {
    const w = open.reduce((a, b) => (a.closesAt! <= b.closesAt! ? a : b));
    return { opensAt: w.opensAt, closesAt: w.closesAt };
  }
  const now = Date.now();
  const upcoming = windows.filter((w) => w.opensAt && w.opensAt.getTime() > now);
  if (upcoming.length > 0) {
    const w = upcoming.reduce((a, b) => (a.opensAt! <= b.opensAt! ? a : b));
    return { opensAt: w.opensAt, closesAt: w.closesAt };
  }
  const last = windows.reduce<DepartmentWindow | undefined>(
    (a, b) => ((a?.closesAt?.getTime() ?? 0) >= (b.closesAt?.getTime() ?? 0) ? a : b),
    undefined,
  );
  return { opensAt: last?.opensAt ?? null, closesAt: last?.closesAt ?? null };
}

/** 画面に必要な情報（受付状況・希望入力が必要な部門とその枠・保存済みの希望）をまとめる */
async function buildView(store: Deps, id: number) {
  const [{ ctx, posts, needed, windows }, mine, departments, allSlots] = await Promise.all([
    windowsFor(store, id),
    store.getAvailability(id),
    store.listDepartments(),
    store.listSlots(),
  ]);
  const winOf = new Map(windows.map((w) => [w.departmentId, w]));
  const postById = new Map(posts.map((p) => [p.id, p]));
  return {
    // 全体の見出し用。部門ごとの受付は departments[].open を見る
    period: headline(windows),
    open: windows.some((w) => w.open),
    departments: departments
      .filter((d) => needed.includes(d.id))
      .map((d) => {
        const w = winOf.get(d.id)!;
        return { ...d, open: w.open, opensAt: w.opensAt, closesAt: w.closesAt, days: w.days };
      }),
    days: [...new Set(windows.flatMap((w) => w.days))].sort(),
    // 本人が入れる持ち場の、調整対象日の枠だけを見せる
    slots: allSlots
      .filter((s) => needed.includes(s.departmentId))
      .filter((s) => {
        const p = postById.get(s.postId);
        return !p?.restricted || p.memberIds.includes(id);
      })
      .filter((s) => isSlotTargeted(ctx, s))
      .map((s) => ({ departmentId: s.departmentId, startsAt: s.startsAt, endsAt: s.endsAt })),
    ...mine,
  };
}

/** 一般ユーザー: 自分の希望の閲覧・保存（受付中の部門だけ変更できる） */
export function availabilityUserRoutes(store: Deps, userId: (c: Context) => number) {
  return new Hono()
    .get('/availability', async (c) => {
      const view = await buildView(store, userId(c));
      return c.json(view);
    })
    .put('/availability', zValidator('json', entriesBody), async (c) =>
      saveAsUser(store, c, userId(c), c.req.valid('json').entries),
    );
}

/** 管理者: 受付期間、入力状況、任意ユーザーの希望（期間外でも編集可） */
export function availabilityAdminRoutes(store: Deps, actorId: (c: Context) => number) {
  return new Hono()
    .get('/settings/availability-period', async (c) => c.json(await store.getPeriod()))
    .put('/settings/availability-period', zValidator('json', periodBody), async (c) => {
      const period = c.req.valid('json');
      await store.setPeriod(period, actorId(c));
      return c.json(period);
    })
    .get('/availability/status', async (c) => c.json(await store.listInputStatus()))
    .get('/users/:id{[0-9]+}/availability', async (c) => {
      const id = Number(c.req.param('id'));
      if (!(await store.getUserRoles(id))) return c.json({ error: 'not_found' }, 404);
      return c.json(await buildView(store, id));
    })
    .put('/users/:id{[0-9]+}/availability', zValidator('json', entriesBody), async (c) =>
      save(store, c, Number(c.req.param('id')), c.req.valid('json').entries, actorId(c)),
    );
}
