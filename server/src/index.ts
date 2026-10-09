import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { users } from './db/schema.js';

const { db } = createDb();

const app = createApp({
  env: process.env,
  findUser: async (email) =>
    (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null,
  listUsers: () => db.select().from(users),
});

const root = new Hono();
root.route('/', app);
// ビルド済みSPAの静的配信（未知のパスは index.html にフォールバック）
root.use('*', serveStatic({ root: '../web/dist' }));
root.get('*', serveStatic({ path: '../web/dist/index.html' }));

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: root.fetch, port });
console.log(`listening on :${port}`);
