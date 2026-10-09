import { authHandler, initAuthConfig, verifyAuth } from '@hono/auth-js';
import { Hono } from 'hono';
import { createAuthConfig } from './auth/index.js';
import { isDevLoginEnabled } from './auth/devLogin.js';
import type { AppUser, FindUser } from './auth/signIn.js';

export type AppDeps = {
  env: Record<string, string | undefined>;
  findUser: FindUser;
  listUsers: () => Promise<AppUser[]>;
};

export function createApp({ env, findUser, listUsers }: AppDeps) {
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

  app.get('/api/me', verifyAuth(), (c) => c.json(c.get('authUser')?.session.user ?? null));
  return app;
}
