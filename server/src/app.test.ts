import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { isDevLoginEnabled } from './auth/devLogin.js';
import { isSignInAllowed, type AppUser } from './auth/signIn.js';

const admin: AppUser = { id: 1, email: 'admin@example.test', name: '管理者', isAdmin: true };
const general: AppUser = { id: 2, email: 'user@example.test', name: '一般', isAdmin: false };
const all = [admin, general];
const findUser = (email: string) => Promise.resolve(all.find((u) => u.email === email) ?? null);

const devEnv = {
  NODE_ENV: 'development',
  AUTH_DEV_LOGIN: 'true',
  AUTH_URL: 'http://localhost:3000',
  AUTH_SECRET: 'test-secret',
};
const makeApp = (env: Record<string, string | undefined>) =>
  createApp({ env, findUser, listUsers: () => Promise.resolve(all) });

async function devLogin(app: ReturnType<typeof makeApp>, email: string) {
  const csrfRes = await app.request('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookie = csrfRes.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const res = await app.request('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
    body: new URLSearchParams({ csrfToken, email }),
  });
  const cookie = [csrfCookie, ...res.headers.getSetCookie().map((c) => c.split(';')[0])].join('; ');
  return { res, cookie };
}

describe('health', () => {
  it('returns ok', async () => {
    const res = await makeApp(devEnv).request('/api/health');
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('isDevLoginEnabled', () => {
  it('requires every condition', () => {
    expect(isDevLoginEnabled(devEnv)).toBe(true);
    expect(isDevLoginEnabled({ ...devEnv, NODE_ENV: 'production' })).toBe(false);
    expect(isDevLoginEnabled({ ...devEnv, NODE_ENV: undefined })).toBe(false);
    expect(isDevLoginEnabled({ ...devEnv, AUTH_DEV_LOGIN: undefined })).toBe(false);
    expect(isDevLoginEnabled({ ...devEnv, AUTH_URL: 'https://hr.nara-kosensai.com' })).toBe(false);
    expect(isDevLoginEnabled({ ...devEnv, AUTH_URL: undefined })).toBe(false);
  });
});

describe('isSignInAllowed', () => {
  it('rejects unregistered email', async () => {
    expect(await isSignInAllowed({ email: 'x@example.test' }, findUser, [])).toBe(false);
  });
  it('rejects tid outside allow list', async () => {
    expect(await isSignInAllowed({ email: admin.email, tid: 'bad' }, findUser, ['ok'])).toBe(false);
  });
  it('allows registered user with allowed tid', async () => {
    expect(await isSignInAllowed({ email: admin.email, tid: 'ok' }, findUser, ['ok'])).toBe(true);
  });
  it('allows registered user without tid (one-time code)', async () => {
    expect(await isSignInAllowed({ email: general.email }, findUser, ['ok'])).toBe(true);
  });
});

describe('dev login', () => {
  it('logs in a registered user and exposes isAdmin via /api/me', async () => {
    const app = makeApp(devEnv);
    const { cookie } = await devLogin(app, admin.email);
    const me = await app.request('/api/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: admin.email, isAdmin: true, id: 1 });
  });
  it('does not authenticate an unregistered user', async () => {
    const app = makeApp(devEnv);
    const { cookie } = await devLogin(app, 'unregistered@example.test');
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401);
  });
  it('is not registered in production', async () => {
    const app = makeApp({ ...devEnv, NODE_ENV: 'production' });
    expect((await app.request('/api/dev/users')).status).toBe(404);
    const { cookie } = await devLogin(app, admin.email).catch(() => ({ cookie: '' }));
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401);
  });
});
