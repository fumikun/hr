import { authHandler, initAuthConfig, verifyAuth } from '@hono/auth-js';
import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createAuthConfig } from './auth/index.js';
import { isDevLoginEnabled } from './auth/devLogin.js';
import type { AppUser, FindUser } from './auth/signIn.js';
import { availabilityUserRoutes } from './availability/routes.js';
import { adminRoutes } from './admin/routes.js';
import type { AdminStore } from './admin/types.js';

export type OnboardingRole = { departmentId: number; name: string; requiresAvailability: boolean };
export type Onboarding = { confirmedAt: Date | null; roles: OnboardingRole[] };

export type AppDeps = {
  env: Record<string, string | undefined>;
  findUser: FindUser;
  listUsers: () => Promise<AppUser[]>;
  getOnboarding: (userId: number) => Promise<Onboarding>;
  confirmOnboarding: (userId: number) => Promise<void>;
  adminStore: AdminStore;
};

export function createApp({
  env,
  findUser,
  listUsers,
  getOnboarding,
  confirmOnboarding,
  adminStore,
}: AppDeps) {
  const app = new Hono();
  const authConfig = createAuthConfig(env, findUser);

  app.use(
    '*',
    initAuthConfig(() => authConfig),
  );
  app.use('/api/auth/*', authHandler());

  app.get('/api/health', (c) => c.json({ ok: true }));

  // 開発用: ログイン画面に出すテストアカウント一覧。無効時は存在しないものとして扱う。
  if (isDevLoginEnabled(env)) {
    app.get('/api/dev/users', async (c) =>
      c.json([
        ...(await listUsers()),
        { id: 0, email: 'unregistered@example.test', name: '未登録ユーザー', isAdmin: false },
      ]),
    );
  }

  const sessionUserId = (c: Context): number =>
    Number((c.get('authUser')?.session.user as { id?: number } | undefined)?.id);

  app.get('/api/me', verifyAuth(), (c) => c.json(c.get('authUser')?.session.user ?? null));

  // 初回確認（F-07）: 確認済みになるまで、/api/me 系以外の業務 API を使わせない
  app.get('/api/me/onboarding', verifyAuth(), async (c) => {
    const { confirmedAt, roles } = await getOnboarding(sessionUserId(c));
    return c.json({ confirmed: confirmedAt !== null, roles });
  });
  app.post('/api/me/onboarding/confirm', verifyAuth(), async (c) => {
    await confirmOnboarding(sessionUserId(c));
    return c.json({ confirmed: true });
  });

  const requireConfirmed = createMiddleware(async (c, next) => {
    const { confirmedAt } = await getOnboarding(sessionUserId(c));
    if (confirmedAt === null) return c.json({ error: 'onboarding_required' }, 403);
    await next();
  });
  // 業務APIはここ以降に /api/app/* として載せる（認証＋初回確認が必須）
  app.use('/api/app/*', verifyAuth(), requireConfirmed);
  app.get('/api/app/ping', (c) => c.json({ pong: true }));
  app.route('/api/app', availabilityUserRoutes(adminStore, sessionUserId));

  // 管理者API: 権限判定はすべてサーバー側（セッションの isAdmin は JWT 更新のたびに DB から取り直す）
  const requireAdmin = createMiddleware(async (c, next) => {
    const user = c.get('authUser')?.session.user as { isAdmin?: boolean } | undefined;
    if (!user?.isAdmin) return c.json({ error: 'forbidden' }, 403);
    await next();
  });
  app.use('/api/admin/*', verifyAuth(), requireConfirmed, requireAdmin);
  app.route('/api/admin', adminRoutes(adminStore, sessionUserId));

  return app;
}
