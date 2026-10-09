import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Department, Post } from '../admin/types.js';
import { loadScopeContext } from './context.js';
import { resolveScope } from './resolve.js';
import type { Period, ScopeStore } from './types.js';

type Deps = ScopeStore & {
  getPeriod(): Promise<Period>;
  listSlots(): Promise<{ startsAt: Date }[]>;
  listDepartments(): Promise<Department[]>;
  listPosts(): Promise<Post[]>;
};

const dayText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const eventDaysBody = z.object({
  days: z
    .array(dayText)
    .min(1)
    .max(14)
    .refine((d) => new Set(d).size === d.length, { message: 'duplicate day' }),
});
const scopeBody = z
  .object({
    opensAt: z.coerce.date().nullable(),
    closesAt: z.coerce.date().nullable(),
    days: z.array(dayText).min(1).nullable(),
  })
  .refine((v) => (v.opensAt === null) === (v.closesAt === null), {
    message: '開始と締切は両方設定するか、両方空にしてください',
    path: ['closesAt'],
  })
  .refine((v) => !v.opensAt || !v.closesAt || v.closesAt > v.opensAt, {
    message: 'closesAt must be after opensAt',
    path: ['closesAt'],
  });

/** 管理者: イベントの日程と、部門・持ち場ごとの受付期間／調整対象日 */
export function scopeAdminRoutes(store: Deps, actorId: (c: Context) => number) {
  return new Hono()
    .get('/scopes', async (c) => {
      const [ctx, saved, departments, posts] = await Promise.all([
        loadScopeContext(store),
        store.getEventDays(),
        store.listDepartments(),
        store.listPosts(),
      ]);
      return c.json({
        eventDays: ctx.eventDays,
        eventDaysSaved: saved !== null,
        global: ctx.global,
        scopes: ctx.scopes,
        // 引き継ぎを反映した、実際に使われる設定
        departments: departments.map((d) => ({ id: d.id, ...resolveScope(ctx, d.id) })),
        posts: posts.map((p) => ({
          id: p.id,
          departmentId: p.departmentId,
          ...resolveScope(ctx, p.departmentId, p.id),
        })),
      });
    })
    .put('/event-days', zValidator('json', eventDaysBody), async (c) => {
      const days = [...c.req.valid('json').days].sort();
      await store.setEventDays(days, actorId(c));
      return c.json({ days });
    })
    .put('/scopes/:type{department|post}/:id{[0-9]+}', zValidator('json', scopeBody), async (c) => {
      const type = c.req.param('type') as 'department' | 'post';
      const id = Number(c.req.param('id'));
      const exists =
        type === 'department'
          ? (await store.listDepartments()).some((d) => d.id === id)
          : (await store.listPosts()).some((p) => p.id === id);
      if (!exists) return c.json({ error: 'not_found' }, 404);
      const body = c.req.valid('json');
      if (body.days) {
        const { eventDays } = await loadScopeContext(store);
        if (!body.days.every((d) => eventDays.includes(d)))
          return c.json({ error: 'day_not_in_event' }, 400);
      }
      await store.setScope(
        { type, id, ...body, days: body.days ? [...body.days].sort() : null },
        actorId(c),
      );
      return c.json({ ok: true });
    });
}
