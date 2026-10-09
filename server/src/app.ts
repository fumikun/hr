import { authHandler, initAuthConfig, verifyAuth } from '@hono/auth-js';
import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createTtlCache } from './cache.js';
import { createAuthConfig } from './auth/index.js';
import { isDevLoginEnabled } from './auth/devLogin.js';
import type { AppUser, FindUser } from './auth/signIn.js';
import { availabilityUserRoutes } from './availability/routes.js';
import { myShiftRoutes } from './assign/myShifts.js';
import { createAssignRunner } from './assign/runner.js';
import { solveInWorker, type Solver } from './assign/workerSolver.js';
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
  /** 自動割り当てのソルバー。省略時は別スレッドの HiGHS */
  solver?: Solver;
  /**
   * ログイン中ユーザーの情報（管理者か・初回確認済みか）を覚えておく時間。省略時は30秒。
   * ユーザーの編集・削除・インポートと初回確認の完了では、すぐに破棄する。
   */
  userCacheTtlMs?: number;
};

export function createApp({
  env,
  findUser: findUserUncached,
  listUsers,
  getOnboarding,
  confirmOnboarding: confirmOnboardingUncached,
  adminStore: adminStoreUncached,
  solver = solveInWorker,
  userCacheTtlMs = 30_000,
}: AppDeps) {
  const app = new Hono();

  // すべての API が毎回 DB に聞いていた「ユーザー情報」と「初回確認済みか」を短時間覚えておく。
  // 管理者権限の変更・ユーザー削除は、下のラッパーですぐ破棄するので、反映は遅れない。
  const userCache = createTtlCache<string, AppUser>(userCacheTtlMs);
  const confirmedCache = createTtlCache<number, true>(userCacheTtlMs);
  const dropCaches = () => {
    userCache.clear();
    confirmedCache.clear();
  };
  const findUser: FindUser = (email) => userCache.get(email, () => findUserUncached(email));
  const isConfirmed = async (userId: number) =>
    (await confirmedCache.get(userId, async () =>
      (await getOnboarding(userId)).confirmedAt !== null ? true : null,
    )) === true;
  const confirmOnboarding = async (userId: number) => {
    await confirmOnboardingUncached(userId);
    confirmedCache.delete(userId);
  };
  const adminStore: AdminStore = {
    ...adminStoreUncached,
    createUser: async (...a) => {
      const r = await adminStoreUncached.createUser(...a);
      dropCaches();
      return r;
    },
    updateUser: async (...a) => {
      const r = await adminStoreUncached.updateUser(...a);
      dropCaches();
      return r;
    },
    deleteUser: async (...a) => {
      const r = await adminStoreUncached.deleteUser(...a);
      dropCaches();
      return r;
    },
    importUsers: async (...a) => {
      const r = await adminStoreUncached.importUsers(...a);
      dropCaches();
      return r;
    },
  };

  const assignRunner = createAssignRunner(adminStore, solver);
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

  // 画面の最初の確認用。ログイン状態と「初回確認済みか」を1回で返す（往復を減らすため）
  app.get('/api/me', verifyAuth(), async (c) =>
    c.json({
      ...c.get('authUser')?.session.user,
      confirmed: await isConfirmed(sessionUserId(c)),
    }),
  );

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
    if (!(await isConfirmed(sessionUserId(c))))
      return c.json({ error: 'onboarding_required' }, 403);
    await next();
  });
  // 業務APIはここ以降に /api/app/* として載せる（認証＋初回確認が必須）
  app.use('/api/app/*', verifyAuth(), requireConfirmed);
  app.get('/api/app/ping', (c) => c.json({ pong: true }));
  app.route('/api/app', availabilityUserRoutes(adminStore, sessionUserId));
  app.route('/api/app', myShiftRoutes(adminStore, sessionUserId));

  // 管理者API: 権限判定はすべてサーバー側（セッションの isAdmin は JWT 更新のたびに DB から取り直す）
  const requireAdmin = createMiddleware(async (c, next) => {
    const user = c.get('authUser')?.session.user as { isAdmin?: boolean } | undefined;
    if (!user?.isAdmin) return c.json({ error: 'forbidden' }, 403);
    await next();
  });
  app.use('/api/admin/*', verifyAuth(), requireConfirmed, requireAdmin);
  app.route('/api/admin', adminRoutes(adminStore, assignRunner, sessionUserId));

  return app;
}
