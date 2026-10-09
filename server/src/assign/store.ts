import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { createDb } from '../db/client.js';
import {
  assignmentRuns,
  assignments,
  auditLogs,
  availabilities,
  postMembers,
  posts,
  shiftSlots,
  userRoles,
  users,
} from '../db/schema.js';
import type { AssignStore, AuditStore, Run, RunSummary } from './types.js';

type Db = ReturnType<typeof createDb>['db'];

const toRun = (r: typeof assignmentRuns.$inferSelect): Run => ({
  id: r.id,
  status: r.status as Run['status'],
  phase: r.phase,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  result: (r.result as RunSummary | null) ?? null,
  error: r.error,
});

export function createAssignStore(db: Db): AssignStore & AuditStore {
  return {
    async listAudit(limit, before) {
      const rows = await db
        .select({ log: auditLogs, actorName: users.name })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorId))
        .where(before === undefined ? undefined : lt(auditLogs.id, before))
        .orderBy(desc(auditLogs.id))
        .limit(limit);
      return rows.map(({ log, actorName }) => ({ ...log, actorName }));
    },

    setStatusAll: (status, actorId) =>
      db.transaction(async (tx) => {
        const from = status === 'confirmed' ? 'draft' : 'confirmed';
        const rows = await tx
          .update(assignments)
          .set({ status })
          .where(eq(assignments.status, from))
          .returning({ userId: assignments.userId });
        await tx.insert(auditLogs).values({
          actorId,
          action: status === 'confirmed' ? 'assign.confirm' : 'assign.unconfirm',
          target: 'assignments',
          after: { count: rows.length },
        });
        return rows.length;
      }),

    async loadSolveInput() {
      const [us, roles, ps, members, slots, avs, locked] = await Promise.all([
        db.select().from(users),
        db.select().from(userRoles),
        db.select().from(posts),
        db.select().from(postMembers),
        db.select().from(shiftSlots),
        db.select().from(availabilities),
        db
          .select()
          .from(assignments)
          .where(or(eq(assignments.locked, true), eq(assignments.status, 'confirmed'))),
      ]);
      return {
        users: us.map((u) => ({
          id: u.id,
          targetMinutes: u.targetMinutes,
          maxMinutes: u.maxMinutes,
          departmentIds: roles.filter((r) => r.userId === u.id).map((r) => r.departmentId),
        })),
        posts: ps.map((p) => ({
          id: p.id,
          departmentId: p.departmentId,
          restricted: p.restricted,
          memberIds: members.filter((m) => m.postId === p.id).map((m) => m.userId),
        })),
        slots: slots.map((s) => ({
          id: s.id,
          departmentId: s.departmentId,
          postId: s.postId,
          start: s.startsAt.getTime(),
          end: s.endsAt.getTime(),
          minPeople: s.minPeople,
          maxPeople: s.maxPeople,
        })),
        availabilities: avs.map((a) => ({
          userId: a.userId,
          type: a.type,
          departmentId: a.departmentId,
          start: a.startsAt.getTime(),
          end: a.endsAt.getTime(),
        })),
        locked: locked.map((l) => ({ userId: l.userId, slotId: l.slotId })),
      };
    },

    listAssignments: () =>
      db.select().from(assignments).orderBy(assignments.slotId, assignments.userId),

    replaceAutoAssignments: (pairs, actorId, summary) =>
      db.transaction(async (tx) => {
        await tx
          .delete(assignments)
          .where(and(eq(assignments.status, 'draft'), eq(assignments.locked, false)));
        if (pairs.length > 0)
          await tx
            .insert(assignments)
            .values(pairs.map((p) => ({ ...p, source: 'auto' as const, locked: false })))
            .onConflictDoNothing();
        await tx
          .insert(auditLogs)
          .values({ actorId, action: 'assign.run', target: 'assignments', after: summary });
      }),

    addManual: (pair, actorId) =>
      db.transaction(async (tx) => {
        const rows = await tx
          .insert(assignments)
          .values({ ...pair, source: 'manual', locked: true })
          .onConflictDoNothing()
          .returning();
        if (rows.length === 0) return 'exists';
        await tx
          .insert(auditLogs)
          .values({ actorId, action: 'assign.add', target: `user:${pair.userId}`, after: pair });
        return 'ok';
      }),

    removeAssignment: (pair, actorId) =>
      db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(assignments)
          .where(and(eq(assignments.userId, pair.userId), eq(assignments.slotId, pair.slotId)));
        if (!row) return 'not_found';
        if (row.status === 'confirmed') return 'confirmed';
        await tx
          .delete(assignments)
          .where(and(eq(assignments.userId, pair.userId), eq(assignments.slotId, pair.slotId)));
        await tx
          .insert(auditLogs)
          .values({ actorId, action: 'assign.remove', target: `user:${pair.userId}`, before: row });
        return 'ok';
      }),

    setLocked: (pair, locked, actorId) =>
      db.transaction(async (tx) => {
        const rows = await tx
          .update(assignments)
          .set({ locked })
          .where(and(eq(assignments.userId, pair.userId), eq(assignments.slotId, pair.slotId)))
          .returning();
        if (rows.length === 0) return false;
        await tx.insert(auditLogs).values({
          actorId,
          action: locked ? 'assign.lock' : 'assign.unlock',
          target: `user:${pair.userId}`,
          after: pair,
        });
        return true;
      }),

    createRun: (actorId, options) =>
      db.transaction(async (tx) => {
        const [running] = await tx
          .select()
          .from(assignmentRuns)
          .where(eq(assignmentRuns.status, 'running'));
        if (running) return null;
        const [row] = await tx
          .insert(assignmentRuns)
          .values({ status: 'running', startedBy: actorId, options })
          .returning();
        return toRun(row!);
      }),

    async updateRun(id, patch) {
      await db
        .update(assignmentRuns)
        .set({
          ...patch,
          ...(patch.status && patch.status !== 'running' ? { finishedAt: new Date() } : {}),
        })
        .where(eq(assignmentRuns.id, id));
    },

    async latestRun() {
      const [row] = await db
        .select()
        .from(assignmentRuns)
        .orderBy(desc(assignmentRuns.id))
        .limit(1);
      return row ? toRun(row) : null;
    },

    async failStaleRuns() {
      await db
        .update(assignmentRuns)
        .set({
          status: 'failed',
          phase: 'failed',
          error: 'サーバー再起動で中断されました',
          finishedAt: new Date(),
        })
        .where(eq(assignmentRuns.status, 'running'));
    },
  };
}
