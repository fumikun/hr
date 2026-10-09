import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { isPeriodOpen, validateEntries } from './rules.js';
import type { Department, Slot } from '../admin/types.js';
import type { AvailabilityEntry, AvailabilityStore } from './types.js';

/** 画面に必要な部門名と枠（シフトがある時間帯の表示用） */
export type AvailabilityContext = {
  listDepartments(): Promise<Department[]>;
  listSlots(): Promise<Slot[]>;
};

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

/** 画面に必要な情報（受付期間・希望入力が必要な部門とその枠・保存済みの希望）をまとめる */
async function buildView(store: AvailabilityStore & AvailabilityContext, id: number) {
  const [period, roles, mine, departments, allSlots] = await Promise.all([
    store.getPeriod(),
    store.getUserRoles(id),
    store.getAvailability(id),
    store.listDepartments(),
    store.listSlots(),
  ]);
  // 希望入力が必要な部門だけを返す（入力不要の部門は画面に出さない）
  const needed = (roles ?? []).filter((r) => r.requiresAvailability).map((r) => r.departmentId);
  return {
    period,
    open: isPeriodOpen(period, new Date()),
    departments: departments.filter((d) => needed.includes(d.id)),
    slots: allSlots
      .filter((s) => needed.includes(s.departmentId))
      .map((s) => ({ departmentId: s.departmentId, startsAt: s.startsAt, endsAt: s.endsAt })),
    ...mine,
  };
}

/** 一般ユーザー: 自分の希望の閲覧・保存（受付期間内のみ保存可） */
export function availabilityUserRoutes(
  store: AvailabilityStore & AvailabilityContext,
  userId: (c: Context) => number,
) {
  return new Hono()
    .get('/availability', async (c) => {
      const view = await buildView(store, userId(c));
      return c.json(view);
    })
    .put('/availability', zValidator('json', entriesBody), async (c) => {
      if (!isPeriodOpen(await store.getPeriod(), new Date()))
        return c.json({ error: 'period_closed' }, 403);
      return save(store, c, userId(c), c.req.valid('json').entries, userId(c));
    });
}

/** 管理者: 受付期間、入力状況、任意ユーザーの希望（期間外でも編集可） */
export function availabilityAdminRoutes(
  store: AvailabilityStore & AvailabilityContext,
  actorId: (c: Context) => number,
) {
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
