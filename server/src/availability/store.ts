import { eq } from 'drizzle-orm';
import type { createDb } from '../db/client.js';
import { auditLogs, availabilities, settings, userRoles, users } from '../db/schema.js';
import type { AvailabilityStore, Period } from './types.js';

type Db = ReturnType<typeof createDb>['db'];

const PERIOD_KEY = 'availability_period';

export function createAvailabilityStore(db: Db): AvailabilityStore {
  return {
    async getPeriod() {
      const [row] = await db.select().from(settings).where(eq(settings.key, PERIOD_KEY));
      const v = row?.value as { opensAt: string | null; closesAt: string | null } | undefined;
      return {
        opensAt: v?.opensAt ? new Date(v.opensAt) : null,
        closesAt: v?.closesAt ? new Date(v.closesAt) : null,
      };
    },

    async setPeriod(period, actorId) {
      const before = await this.getPeriod();
      await db.transaction(async (tx) => {
        await tx
          .insert(settings)
          .values({ key: PERIOD_KEY, value: period })
          .onConflictDoUpdate({ target: settings.key, set: { value: period } });
        await tx.insert(auditLogs).values({
          actorId,
          action: 'settings.availability_period',
          target: PERIOD_KEY,
          before,
          after: period,
        });
      });
    },

    async getUserRoles(userId) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!u) return null;
      const rows = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
      return rows.map((r) => ({
        departmentId: r.departmentId,
        requiresAvailability: r.requiresAvailability,
      }));
    },

    async getAvailability(userId) {
      const [u] = await db
        .select({ at: users.availabilitySubmittedAt })
        .from(users)
        .where(eq(users.id, userId));
      const rows = await db
        .select()
        .from(availabilities)
        .where(eq(availabilities.userId, userId))
        .orderBy(availabilities.startsAt);
      return {
        submittedAt: u?.at ?? null,
        entries: rows.map((r) => ({
          type: r.type,
          departmentId: r.departmentId,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
        })),
      };
    },

    replaceAvailability: (userId, entries, actorId) =>
      db.transaction(async (tx) => {
        await tx.delete(availabilities).where(eq(availabilities.userId, userId));
        if (entries.length > 0)
          await tx.insert(availabilities).values(entries.map((e) => ({ ...e, userId })));
        await tx
          .update(users)
          .set({ availabilitySubmittedAt: new Date() })
          .where(eq(users.id, userId));
        // 本人の入力は件数のみ記録（監査ログの肥大化を避ける）。管理者による代理編集も同様。
        await tx.insert(auditLogs).values({
          actorId,
          action: actorId === userId ? 'availability.save' : 'availability.admin_edit',
          target: `user:${userId}`,
          after: { count: entries.length },
        });
      }),

    async listInputStatus() {
      const [us, roles, avs] = await Promise.all([
        db.select().from(users).orderBy(users.id),
        db.select().from(userRoles),
        db.select({ userId: availabilities.userId }).from(availabilities),
      ]);
      return us.map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        required: roles.some((r) => r.userId === u.id && r.requiresAvailability),
        submittedAt: u.availabilitySubmittedAt,
        entryCount: avs.filter((a) => a.userId === u.id).length,
      }));
    },
  };
}
export type { Period };
