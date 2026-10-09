import { and, eq } from 'drizzle-orm';
import type { createDb } from '../db/client.js';
import { auditLogs, scopeSettings, settings } from '../db/schema.js';
import type { ScopeSetting, ScopeStore, ScopeType } from './types.js';

type Db = ReturnType<typeof createDb>['db'];
const EVENT_DAYS_KEY = 'event_days';

const toSetting = (r: typeof scopeSettings.$inferSelect): ScopeSetting => ({
  type: r.scopeType as ScopeType,
  id: r.scopeId,
  opensAt: r.opensAt,
  closesAt: r.closesAt,
  days: r.days,
});

export function createScopeStore(db: Db): ScopeStore {
  return {
    async getEventDays() {
      const [row] = await db.select().from(settings).where(eq(settings.key, EVENT_DAYS_KEY));
      return row ? (row.value as string[]) : null;
    },

    async setEventDays(days, actorId) {
      const before = await this.getEventDays();
      await db.transaction(async (tx) => {
        await tx
          .insert(settings)
          .values({ key: EVENT_DAYS_KEY, value: days })
          .onConflictDoUpdate({ target: settings.key, set: { value: days } });
        await tx.insert(auditLogs).values({
          actorId,
          action: 'settings.event_days',
          target: EVENT_DAYS_KEY,
          before: before ? { days: before } : null,
          after: { days },
        });
      });
    },

    async listScopes() {
      return (await db.select().from(scopeSettings)).map(toSetting);
    },

    setScope: (setting, actorId) =>
      db.transaction(async (tx) => {
        const key = and(
          eq(scopeSettings.scopeType, setting.type),
          eq(scopeSettings.scopeId, setting.id),
        );
        const [before] = await tx.select().from(scopeSettings).where(key);
        const empty = !setting.opensAt && !setting.closesAt && !setting.days;
        if (empty) await tx.delete(scopeSettings).where(key);
        else
          await tx
            .insert(scopeSettings)
            .values({
              scopeType: setting.type,
              scopeId: setting.id,
              opensAt: setting.opensAt,
              closesAt: setting.closesAt,
              days: setting.days,
            })
            .onConflictDoUpdate({
              target: [scopeSettings.scopeType, scopeSettings.scopeId],
              set: { opensAt: setting.opensAt, closesAt: setting.closesAt, days: setting.days },
            });
        await tx.insert(auditLogs).values({
          actorId,
          action: 'settings.scope',
          target: `${setting.type}:${setting.id}`,
          before: before ? toSetting(before) : null,
          after: empty ? null : setting,
        });
      }),
  };
}
