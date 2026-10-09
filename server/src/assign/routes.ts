import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { findShortages, findViolations, ineligibleReason, overlaps, wantMs } from './model.js';
import type { AssignRunner } from './runner.js';
import type { AssignStore } from './types.js';

const pairBody = z.object({ userId: z.number().int(), slotId: z.number().int() });
const runBody = z.object({ timeLimitSeconds: z.number().int().min(5).max(300).default(60) });

export function assignRoutes(
  store: AssignStore,
  runner: AssignRunner,
  actorId: (c: Context) => number,
) {
  const pairParams = (c: Context) => ({
    userId: Number(c.req.param('userId')),
    slotId: Number(c.req.param('slotId')),
  });
  return (
    new Hono()
      .post('/assign/run', zValidator('json', runBody), async (c) => {
        const run = await runner.start(actorId(c), c.req.valid('json'));
        return run ? c.json(run, 202) : c.json({ error: 'already_running' }, 409);
      })
      .get('/assign/run', async (c) => c.json(await store.latestRun()))
      // 現在の割り当て・不足枠・制約違反（手動修正後の警告にも使う）
      .get('/assign', async (c) => {
        const [input, assignments] = await Promise.all([
          store.loadSolveInput(),
          store.listAssignments(),
        ]);
        return c.json({
          assignments,
          shortages: findShortages(input.slots, assignments),
          violations: findViolations(input, assignments),
        });
      })
      // 枠に入れる候補。入れる人を上に、警告つき（入れない時間帯・時間重複など）の人も理由つきで返す
      .get('/assign/candidates/:slotId{[0-9]+}', async (c) => {
        const slotId = Number(c.req.param('slotId'));
        const [input, assignments] = await Promise.all([
          store.loadSolveInput(),
          store.listAssignments(),
        ]);
        const slot = input.slots.find((s) => s.id === slotId);
        if (!slot) return c.json({ error: 'unknown_slot' }, 404);
        const slotById = new Map(input.slots.map((s) => [s.id, s]));
        const candidates = input.users
          .filter((u) => !assignments.some((a) => a.userId === u.id && a.slotId === slotId))
          .map((u) => {
            const reasons: string[] = [];
            const base = ineligibleReason(input, u, slot);
            if (base) reasons.push(base);
            if (
              assignments.some((a) => {
                const other = slotById.get(a.slotId);
                return a.userId === u.id && other && overlaps(other, slot);
              })
            )
              reasons.push('double_booked');
            const minutes = assignments
              .filter((a) => a.userId === u.id)
              .reduce((n, a) => {
                const s = slotById.get(a.slotId);
                return s ? n + (s.end - s.start) / 60_000 : n;
              }, 0);
            return {
              userId: u.id,
              reasons,
              wants: wantMs(input.availabilities, u.id, slot) > 0,
              assignedMinutes: minutes,
            };
          });
        return c.json(candidates);
      })
      // 手動追加は警告つきで許可する（管理者の判断を優先）。手動で入れたものは固定扱い
      .post('/assign/assignments', zValidator('json', pairBody), async (c) => {
        const pair = c.req.valid('json');
        const input = await store.loadSolveInput();
        if (!input.users.some((u) => u.id === pair.userId))
          return c.json({ error: 'unknown_user' }, 400);
        if (!input.slots.some((s) => s.id === pair.slotId))
          return c.json({ error: 'unknown_slot' }, 400);
        if ((await store.addManual(pair, actorId(c))) === 'exists')
          return c.json({ error: 'exists' }, 409);
        const all = await store.listAssignments();
        const warnings = findViolations(input, all).filter(
          (v) =>
            v.slotId === pair.slotId && (v.userId === pair.userId || v.reason === 'over_capacity'),
        );
        return c.json({ warnings }, 201);
      })
      .delete('/assign/assignments/:userId{[0-9]+}/:slotId{[0-9]+}', async (c) => {
        const result = await store.removeAssignment(pairParams(c), actorId(c));
        if (result === 'not_found') return c.json({ error: 'not_found' }, 404);
        if (result === 'confirmed') return c.json({ error: 'confirmed' }, 409);
        return c.json({ ok: true });
      })
      .put(
        '/assign/assignments/:userId{[0-9]+}/:slotId{[0-9]+}/lock',
        zValidator('json', z.object({ locked: z.boolean() })),
        async (c) =>
          (await store.setLocked(pairParams(c), c.req.valid('json').locked, actorId(c)))
            ? c.json({ ok: true })
            : c.json({ error: 'not_found' }, 404),
      )
  );
}
