import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createAdminStore } from './admin/store.js';
import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { departments, userRoles, users } from './db/schema.js';

const { db } = createDb();

const app = createApp({
  env: process.env,
  adminStore: createAdminStore(db),
  findUser: async (email) =>
    (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null,
  listUsers: () => db.select().from(users),
  getOnboarding: async (userId) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const roles = await db
      .select({
        departmentId: userRoles.departmentId,
        name: departments.name,
        requiresAvailability: userRoles.requiresAvailability,
      })
      .from(userRoles)
      .innerJoin(departments, eq(departments.id, userRoles.departmentId))
      .where(and(eq(userRoles.userId, userId), eq(userRoles.requiresAvailability, true)));
    return { confirmedAt: u?.firstLoginConfirmedAt ?? null, roles };
  },
  confirmOnboarding: async (userId) => {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ firstLoginConfirmedAt: now }).where(eq(users.id, userId));
      await tx.update(userRoles).set({ confirmedAt: now }).where(eq(userRoles.userId, userId));
    });
  },
});

const root = new Hono();
root.route('/', app);
// ビルド済みSPAの静的配信（未知のパスは index.html にフォールバック）
root.use('*', serveStatic({ root: '../web/dist' }));
root.get('*', serveStatic({ path: '../web/dist/index.html' }));

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: root.fetch, port });
console.log(`listening on :${port}`);
