import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { availabilityAdminRoutes } from '../availability/routes.js';
import { parseUserCsv } from './csv.js';
import { findOverlaps, generateSlots, isFiveMinute } from './slots.js';
import type { AdminStore } from './types.js';

const userSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(1),
    isAdmin: z.boolean(),
    targetMinutes: z.number().int().min(0).nullable(),
    maxMinutes: z.number().int().min(0).nullable(),
    roles: z.array(z.object({ departmentId: z.number().int(), requiresAvailability: z.boolean() })),
  })
  .refine(
    (u) => u.targetMinutes === null || u.maxMinutes === null || u.maxMinutes >= u.targetMinutes,
    {
      message: 'maxMinutes must be >= targetMinutes',
      path: ['maxMinutes'],
    },
  )
  .refine((u) => new Set(u.roles.map((r) => r.departmentId)).size === u.roles.length, {
    message: 'duplicate department',
    path: ['roles'],
  });

const importSchema = z.object({
  csv: z.string().max(1_000_000),
  dryRun: z.boolean().default(false),
});

const date5 = z.coerce.date().refine(isFiveMinute, { message: 'must be 5-minute aligned' });
const people = {
  minPeople: z.number().int().min(0),
  maxPeople: z.number().int().min(1),
};
const minLeMax = (v: { minPeople: number; maxPeople: number }) => v.minPeople <= v.maxPeople;
const slotBody = z
  .object({ startsAt: date5, endsAt: date5, ...people })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
  .refine(minLeMax, { message: 'minPeople must be <= maxPeople', path: ['minPeople'] });
const generateBody = z
  .object({
    departmentId: z.number().int(),
    windows: z
      .array(z.object({ startsAt: date5, endsAt: date5 }).refine((w) => w.endsAt > w.startsAt))
      .min(1)
      .max(100),
    slotMinutes: z
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .refine((n) => n % 5 === 0),
    ...people,
  })
  .refine(minLeMax, { message: 'minPeople must be <= maxPeople', path: ['minPeople'] });

export function adminRoutes(store: AdminStore, actorId: (c: Context) => number) {
  return (
    new Hono()
      .route('/', availabilityAdminRoutes(store, actorId))
      .get('/departments', async (c) => c.json(await store.listDepartments()))
      .get('/slots', async (c) => {
        const dept = c.req.query('departmentId');
        return c.json(await store.listSlots(dept ? Number(dept) : undefined));
      })
      // 設定から枠を自動生成する。既存枠と重なる場合は何も作らず 409
      .post('/slots/generate', zValidator('json', generateBody), async (c) => {
        const input = c.req.valid('json');
        if (!(await store.listDepartments()).some((d) => d.id === input.departmentId))
          return c.json({ error: 'unknown_department' }, 400);
        const generated = generateSlots(input);
        const existing = await store.listSlots(input.departmentId);
        if (findOverlaps([...existing, ...generated]).length > 0)
          return c.json({ error: 'overlap' }, 409);
        return c.json(await store.createSlots(generated, actorId(c)), 201);
      })
      .post(
        '/slots',
        zValidator('json', slotBody.and(z.object({ departmentId: z.number().int() }))),
        async (c) => {
          const input = c.req.valid('json');
          if (!(await store.listDepartments()).some((d) => d.id === input.departmentId))
            return c.json({ error: 'unknown_department' }, 400);
          const existing = await store.listSlots(input.departmentId);
          if (findOverlaps([...existing, input]).length > 0)
            return c.json({ error: 'overlap' }, 409);
          const [created] = await store.createSlots([input], actorId(c));
          return c.json(created, 201);
        },
      )
      .put('/slots/:id{[0-9]+}', zValidator('json', slotBody), async (c) => {
        const id = Number(c.req.param('id'));
        const input = c.req.valid('json');
        const current = (await store.listSlots()).find((s) => s.id === id);
        if (!current) return c.json({ error: 'not_found' }, 404);
        const others = (await store.listSlots(current.departmentId)).filter((s) => s.id !== id);
        if (findOverlaps([...others, { ...input, departmentId: current.departmentId }]).length > 0)
          return c.json({ error: 'overlap' }, 409);
        return c.json(await store.updateSlot(id, input, actorId(c)));
      })
      .delete('/slots/:id{[0-9]+}', async (c) =>
        (await store.deleteSlot(Number(c.req.param('id')), actorId(c)))
          ? c.json({ ok: true })
          : c.json({ error: 'not_found' }, 404),
      )
      .get('/users', async (c) => c.json(await store.listUsers()))
      .post('/users', zValidator('json', userSchema), async (c) => {
        const created = await store.createUser(c.req.valid('json'), actorId(c));
        return created ? c.json(created, 201) : c.json({ error: 'email_taken' }, 409);
      })
      .put('/users/:id{[0-9]+}', zValidator('json', userSchema), async (c) => {
        const id = Number(c.req.param('id'));
        const input = c.req.valid('json');
        // 自分自身から管理者権限を外してロックアウトするのを防ぐ
        if (id === actorId(c) && !input.isAdmin)
          return c.json({ error: 'cannot_demote_self' }, 400);
        try {
          const updated = await store.updateUser(id, input, actorId(c));
          return updated ? c.json(updated) : c.json({ error: 'not_found' }, 404);
        } catch (e) {
          if (e instanceof Error && e.message === 'email_taken')
            return c.json({ error: 'email_taken' }, 409);
          throw e;
        }
      })
      .delete('/users/:id{[0-9]+}', async (c) => {
        const id = Number(c.req.param('id'));
        if (id === actorId(c)) return c.json({ error: 'cannot_delete_self' }, 400);
        return (await store.deleteUser(id, actorId(c)))
          ? c.json({ ok: true })
          : c.json({ error: 'not_found' }, 404);
      })
      // CSV一括登録: 1行でも不正なら何も登録しない（all-or-nothing）
      .post('/users/import', zValidator('json', importSchema), async (c) => {
        const { csv, dryRun } = c.req.valid('json');
        const { users, errors } = parseUserCsv(csv, await store.listDepartments());
        if (errors.length > 0) return c.json({ errors }, 422);
        if (dryRun) return c.json({ valid: users.length });
        return c.json(await store.importUsers(users, actorId(c)));
      })
  );
}
