import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { compress } from 'hono/compress';
import { createAdminStore } from './admin/store.js';
import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { departments, userRoles, users } from './db/schema.js';

const { db } = createDb();

const adminStore = createAdminStore(db);
await adminStore.failStaleRuns();

const app = createApp({
  env: process.env,
  adminStore,
  findUser: async (email) =>
    (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null,
  listUsers: () => db.select().from(users),
  getOnboarding: async (userId) => {
    const [[u], roles] = await Promise.all([
      db
        .select({ at: users.firstLoginConfirmedAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      db
        .select({
          departmentId: userRoles.departmentId,
          name: departments.name,
          requiresAvailability: userRoles.requiresAvailability,
        })
        .from(userRoles)
        .innerJoin(departments, eq(departments.id, userRoles.departmentId))
        .where(and(eq(userRoles.userId, userId), eq(userRoles.requiresAvailability, true))),
    ]);
    return { confirmedAt: u?.at ?? null, roles };
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
// 処理時間を Server-Timing ヘッダ（ブラウザの開発者ツールで見られる）と、遅いリクエストのログに出す
const slowMs = Number(process.env.SLOW_REQUEST_MS ?? 300);
root.use('/api/*', async (c, next) => {
  const start = performance.now();
  await next();
  const ms = performance.now() - start;
  c.header('Server-Timing', `app;dur=${ms.toFixed(1)}`);
  if (ms >= slowMs) console.warn(`slow request: ${c.req.method} ${c.req.path} ${ms.toFixed(0)}ms`);
});
// JS・CSS・JSON を gzip で配信する（本番を Traefik で圧縮するなら、どちらか一方だけにする）
root.use('*', compress());
root.route('/', app);
// ビルド済みSPAの静的配信（未知のパスは index.html にフォールバック）。
// /assets/* はファイル名にハッシュが付くので長期キャッシュ、index.html は毎回確認して新しい版にすぐ切り替える。
const cacheHeaders = (path: string, c: Context) => {
  c.header(
    'Cache-Control',
    path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
};
// Entra ID のパブリッシャードメイン検証は拡張子なしのURLも取りに来るため、両方を application/json で返す
for (const path of [
  '/.well-known/microsoft-identity-association',
  '/.well-known/microsoft-identity-association.json',
]) {
  root.get(
    path,
    serveStatic({
      path: '../web/dist/.well-known/microsoft-identity-association.json',
      onFound: (_p, c) => {
        c.header('Content-Type', 'application/json');
        c.header('Cache-Control', 'no-cache');
      },
    }),
  );
}
root.use('*', serveStatic({ root: '../web/dist', onFound: cacheHeaders }));
root.get('*', serveStatic({ path: '../web/dist/index.html', onFound: cacheHeaders }));

const port = Number(process.env.PORT ?? 3001);
const server = serve({ fetch: root.fetch, port });
console.log(`listening on :${port}`);

// ローリング更新時: SIGTERMで新規接続の受付を止め、処理中のリクエストを終えてから終了する
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
  // 長く掴まれた接続があっても猶予時間内に必ず終了する
  setTimeout(() => process.exit(0), 20_000).unref();
});
