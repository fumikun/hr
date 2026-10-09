// 開発専用ログインの有効化条件。すべて満たす場合のみ true（PLAN.md 10.1）。
export function isDevLoginEnabled(env: Record<string, string | undefined>): boolean {
  if (env.AUTH_DEV_LOGIN !== 'true') return false;
  if (env.NODE_ENV !== 'development') return false;
  try {
    const host = new URL(env.AUTH_URL ?? '').hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}
