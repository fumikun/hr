import type { AuthConfig } from '@auth/core';
import Credentials from '@auth/core/providers/credentials';
import MicrosoftEntraID from '@auth/core/providers/microsoft-entra-id';
import { isDevLoginEnabled } from './devLogin.js';
import { isSignInAllowed, type FindUser } from './signIn.js';

export function createAuthConfig(
  env: Record<string, string | undefined>,
  findUser: FindUser,
): AuthConfig {
  const allowedTids = (env.ALLOWED_TENANT_IDS ?? '').split(',').filter(Boolean);
  const providers: AuthConfig['providers'] = [];

  // 開発用ログイン: 条件を満たさない場合はプロバイダ自体を登録しない
  if (isDevLoginEnabled(env)) {
    providers.push(
      Credentials({
        credentials: { email: {} },
        authorize: async (credentials) => {
          const email = typeof credentials.email === 'string' ? credentials.email : '';
          const user = await findUser(email.toLowerCase());
          return user ? { id: String(user.id), email: user.email, name: user.name } : null;
        },
      }),
    );
  }
  // Microsoft Entra ID: クライアントID/シークレットが揃っているときだけ登録する。
  // テナントが1つだけ許可されている場合は、そのテナントを issuer に固定する。
  const clientId = env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const clientSecret = env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  if (clientId && clientSecret) {
    const issuer =
      env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ??
      (allowedTids.length === 1
        ? `https://login.microsoftonline.com/${allowedTids[0]}/v2.0`
        : undefined);
    providers.push(MicrosoftEntraID({ clientId, clientSecret, ...(issuer ? { issuer } : {}) }));
  }
  // TODO: Email プロバイダ

  return {
    secret: env.AUTH_SECRET,
    basePath: '/api/auth',
    pages: { signIn: '/login', error: '/login' },
    trustHost: true,
    providers,
    session: { strategy: 'jwt' },
    callbacks: {
      signIn: ({ user, profile }) =>
        isSignInAllowed(
          { email: user.email, tid: (profile as { tid?: string } | undefined)?.tid ?? null },
          findUser,
          allowedTids,
        ),
      jwt: async ({ token }) => {
        const user = token.email ? await findUser(token.email) : null;
        token.uid = user?.id ?? null;
        token.isAdmin = user?.isAdmin ?? false;
        return token;
      },
      session: ({ session, token }) => {
        Object.assign(session.user, { id: token.uid, isAdmin: token.isAdmin });
        return session;
      },
    },
  };
}
