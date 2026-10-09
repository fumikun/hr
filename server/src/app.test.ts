import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { solve } from './assign/solver.js';
import { isDevLoginEnabled } from './auth/devLogin.js';
import { isSignInAllowed, type AppUser } from './auth/signIn.js';
import { createMemoryStore } from './admin/testStore.js';

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
const confirmedAt = new Map<number, Date>();
let store = createMemoryStore();
const makeApp = (env: Record<string, string | undefined>) => {
  confirmedAt.clear();
  store = createMemoryStore([
    {
      id: 1,
      email: admin.email,
      name: admin.name,
      isAdmin: true,
      targetMinutes: null,
      maxMinutes: null,
      roles: [],
    },
  ]);
  return createApp({
    env,
    adminStore: store,
    solver: solve,
    findUser,
    listUsers: () => Promise.resolve(all),
    getOnboarding: (id) =>
      Promise.resolve({
        confirmedAt: confirmedAt.get(id) ?? null,
        roles: [{ departmentId: 1, name: '模擬店部', requiresAvailability: true }],
      }),
    confirmOnboarding: (id) => {
      confirmedAt.set(id, new Date());
      return Promise.resolve();
    },
  });
};

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

describe('onboarding (F-07)', () => {
  it('requires login', async () => {
    const app = makeApp(devEnv);
    expect((await app.request('/api/me/onboarding')).status).toBe(401);
    expect((await app.request('/api/app/ping')).status).toBe(401);
  });
  it('blocks business APIs until confirmed, then allows them', async () => {
    const app = makeApp(devEnv);
    const { cookie } = await devLogin(app, general.email);
    const headers = { cookie };

    const before = await app.request('/api/me/onboarding', { headers });
    expect(await before.json()).toMatchObject({
      confirmed: false,
      roles: [{ name: '模擬店部' }],
    });
    expect((await app.request('/api/app/ping', { headers })).status).toBe(403);

    const res = await app.request('/api/me/onboarding/confirm', { method: 'POST', headers });
    expect(res.status).toBe(200);
    expect(confirmedAt.has(general.id)).toBe(true);
    expect((await app.request('/api/app/ping', { headers })).status).toBe(200);
  });
});

describe('admin API', () => {
  const json = (cookie: string, method: string, body?: unknown) => ({
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const newUser = {
    email: 'New@Example.test',
    name: '新規',
    isAdmin: false,
    targetMinutes: 120,
    maxMinutes: null,
    roles: [{ departmentId: 1, requiresAvailability: true }],
  };

  async function loginConfirmed(app: ReturnType<typeof makeApp>, email: string) {
    const { cookie } = await devLogin(app, email);
    await app.request('/api/me/onboarding/confirm', { method: 'POST', headers: { cookie } });
    return cookie;
  }

  it('rejects anonymous and non-admin users', async () => {
    const app = makeApp(devEnv);
    expect((await app.request('/api/admin/users')).status).toBe(401);
    const cookie = await loginConfirmed(app, general.email);
    expect((await app.request('/api/admin/users', { headers: { cookie } })).status).toBe(403);
    const res = await app.request('/api/admin/users', json(cookie, 'POST', newUser));
    expect(res.status).toBe(403);
    expect(store.users).toHaveLength(1);
  });

  it('requires onboarding even for admins', async () => {
    const app = makeApp(devEnv);
    const { cookie } = await devLogin(app, admin.email);
    expect((await app.request('/api/admin/users', { headers: { cookie } })).status).toBe(403);
  });

  it('lets an admin create, update and delete users', async () => {
    const app = makeApp(devEnv);
    const cookie = await loginConfirmed(app, admin.email);

    const created = await app.request('/api/admin/users', json(cookie, 'POST', newUser));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: number };
    expect(store.users.find((u) => u.id === id)?.email).toBe('new@example.test');

    expect((await app.request('/api/admin/users', json(cookie, 'POST', newUser))).status).toBe(409);
    const bad = { ...newUser, email: 'x@example.test', targetMinutes: 60, maxMinutes: 30 };
    expect((await app.request('/api/admin/users', json(cookie, 'POST', bad))).status).toBe(400);

    const put = await app.request(
      `/api/admin/users/${id}`,
      json(cookie, 'PUT', { ...newUser, name: '改名' }),
    );
    expect(put.status).toBe(200);
    expect(store.users.find((u) => u.id === id)?.name).toBe('改名');

    expect((await app.request(`/api/admin/users/${id}`, json(cookie, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/admin/users/${id}`, json(cookie, 'DELETE'))).status).toBe(404);
  });

  it('prevents an admin from deleting or demoting themselves', async () => {
    const app = makeApp(devEnv);
    const cookie = await loginConfirmed(app, admin.email);
    expect((await app.request('/api/admin/users/1', json(cookie, 'DELETE'))).status).toBe(400);
    const demote = { ...newUser, email: admin.email, isAdmin: false };
    expect((await app.request('/api/admin/users/1', json(cookie, 'PUT', demote))).status).toBe(400);
  });

  it('imports CSV all-or-nothing, with dry run', async () => {
    const app = makeApp(devEnv);
    const cookie = await loginConfirmed(app, admin.email);
    const head = 'email,name,departments\n';
    const good = head + 'a@example.test,A,総務部\nb@example.test,B,模擬店部:no\n';

    const dry = await app.request(
      '/api/admin/users/import',
      json(cookie, 'POST', { csv: good, dryRun: true }),
    );
    expect(await dry.json()).toEqual({ valid: 2 });
    expect(store.users).toHaveLength(1);

    const bad = head + 'a@example.test,A,総務部\nbroken,B,\n';
    const rejected = await app.request(
      '/api/admin/users/import',
      json(cookie, 'POST', { csv: bad }),
    );
    expect(rejected.status).toBe(422);
    expect(store.users).toHaveLength(1);

    const ok = await app.request('/api/admin/users/import', json(cookie, 'POST', { csv: good }));
    expect(await ok.json()).toEqual({ created: 2, updated: 0 });
    expect(store.users).toHaveLength(3);
  });
  it('generates, edits and deletes slots with validation', async () => {
    const app = makeApp(devEnv);
    const cookie = await loginConfirmed(app, admin.email);
    const mk = await app.request(
      '/api/admin/departments/1/posts',
      json(cookie, 'POST', { name: '全体', restricted: false, memberIds: [] }),
    );
    const postId = ((await mk.json()) as { id: number }).id;
    const gen = {
      postId,
      windows: [{ startsAt: '2026-11-01T09:00:00+09:00', endsAt: '2026-11-01T12:00:00+09:00' }],
      slotMinutes: 90,
      minPeople: 1,
      maxPeople: 3,
    };
    const res = await app.request('/api/admin/slots/generate', json(cookie, 'POST', gen));
    expect(res.status).toBe(201);
    expect(store.slots).toHaveLength(2);

    // 既存枠と重なる生成は拒否（何も作らない）
    const dup = await app.request('/api/admin/slots/generate', json(cookie, 'POST', gen));
    expect(dup.status).toBe(409);
    expect(store.slots).toHaveLength(2);

    const bad = await app.request(
      '/api/admin/slots/generate',
      json(cookie, 'POST', { ...gen, slotMinutes: 42 }),
    );
    expect(bad.status).toBe(400);
    const unknown = await app.request(
      '/api/admin/slots/generate',
      json(cookie, 'POST', { ...gen, postId: 99 }),
    );
    expect(unknown.status).toBe(400);

    const id = store.slots[0]!.id;
    const edit = {
      startsAt: '2026-11-01T09:00:00+09:00',
      endsAt: '2026-11-01T09:45:00+09:00',
      minPeople: 2,
      maxPeople: 2,
    };
    expect((await app.request(`/api/admin/slots/${id}`, json(cookie, 'PUT', edit))).status).toBe(
      200,
    );
    // 次の枠(10:30-12:00)と重なる編集は拒否、5分単位でない時刻も拒否
    const overlap = { ...edit, endsAt: '2026-11-01T10:35:00+09:00' };
    expect((await app.request(`/api/admin/slots/${id}`, json(cookie, 'PUT', overlap))).status).toBe(
      409,
    );
    const odd = { ...edit, endsAt: '2026-11-01T09:47:00+09:00' };
    expect((await app.request(`/api/admin/slots/${id}`, json(cookie, 'PUT', odd))).status).toBe(
      400,
    );

    expect((await app.request(`/api/admin/slots/${id}`, json(cookie, 'DELETE'))).status).toBe(200);
    expect(store.slots).toHaveLength(1);
  });

  it('forbids slot changes for non-admins', async () => {
    const app = makeApp(devEnv);
    const cookie = await loginConfirmed(app, general.email);
    expect((await app.request('/api/admin/slots', { headers: { cookie } })).status).toBe(403);
  });

  describe('availability', () => {
    const entry = (over: object = {}) => ({
      type: 'want',
      departmentId: 1,
      startsAt: '2026-11-01T09:00:00+09:00',
      endsAt: '2026-11-01T10:00:00+09:00',
      ...over,
    });
    const setup = async (user: AppUser, open: boolean) => {
      const app = makeApp(devEnv);
      store.users.push({
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        targetMinutes: null,
        maxMinutes: null,
        roles: [{ departmentId: 1, requiresAvailability: true }],
      });
      const now = Date.now();
      store.setPeriodDirect({
        opensAt: new Date(now + (open ? -3_600_000 : 3_600_000)),
        closesAt: new Date(now + 7_200_000),
      });
      return { app, cookie: await loginConfirmed(app, user.email) };
    };

    it('lets a user save and re-save during the period, replacing entries', async () => {
      const { app, cookie } = await setup(general, true);
      const slot = {
        postId: 1,
        minPeople: 1,
        maxPeople: 1,
        startsAt: new Date(),
        endsAt: new Date(),
      };
      store.slots.push({ id: 1, departmentId: 1, ...slot }, { id: 2, departmentId: 2, ...slot });
      const put = (entries: unknown[]) =>
        app.request('/api/app/availability', json(cookie, 'PUT', { entries }));
      expect(
        (
          await put([
            entry(),
            entry({
              type: 'ng',
              departmentId: null,
              startsAt: '2026-11-01T12:00:00+09:00',
              endsAt: '2026-11-01T13:00:00+09:00',
            }),
          ])
        ).status,
      ).toBe(200);
      expect((await put([entry({ type: 'ok' })])).status).toBe(200);
      const got = (await (
        await app.request('/api/app/availability', { headers: { cookie } })
      ).json()) as { submittedAt: string | null; slots: unknown[] };
      expect(got).toMatchObject({ open: true, entries: [{ type: 'ok' }] });
      // 入力が必要な部門の名前と枠だけが返る
      expect(got).toMatchObject({
        departments: [{ id: 1 }],
        slots: [{ departmentId: 1 }],
      });
      expect(got.submittedAt).not.toBeNull();
    });

    it('rejects saving outside the period', async () => {
      const { app, cookie } = await setup(general, false);
      const res = await app.request('/api/app/availability', json(cookie, 'PUT', { entries: [] }));
      expect(res.status).toBe(403);
      expect(store.avail.size).toBe(0);
    });

    it('rejects invalid entries without saving', async () => {
      const { app, cookie } = await setup(general, true);
      const res = await app.request(
        '/api/app/availability',
        json(cookie, 'PUT', { entries: [entry({ departmentId: 2 })] }),
      );
      expect(res.status).toBe(422);
      expect(store.avail.size).toBe(0);
    });

    it('lets admins set the period, see status and edit anyone outside the period', async () => {
      const { app, cookie } = await setup(general, false);
      const adminCookie = await loginConfirmed(app, admin.email);
      expect(
        (await app.request('/api/admin/availability/status', { headers: { cookie } })).status,
      ).toBe(403);

      const period = { opensAt: '2026-10-12T00:00:00Z', closesAt: '2026-10-11T00:00:00Z' };
      expect(
        (
          await app.request(
            '/api/admin/settings/availability-period',
            json(adminCookie, 'PUT', period),
          )
        ).status,
      ).toBe(400);

      const put = await app.request(
        `/api/admin/users/${general.id}/availability`,
        json(adminCookie, 'PUT', { entries: [entry()] }),
      );
      expect(put.status).toBe(200);
      const status = (await (
        await app.request('/api/admin/availability/status', { headers: { cookie: adminCookie } })
      ).json()) as { userId: number; entryCount: number }[];
      expect(status.find((s) => s.userId === general.id)?.entryCount).toBe(1);
      const missing = await app.request('/api/admin/users/999/availability', {
        headers: { cookie: adminCookie },
      });
      expect(missing.status).toBe(404);
    });
  });

  it('manages posts: open and restricted, with member validation', async () => {
    const app = makeApp(devEnv);
    const cookie = await loginConfirmed(app, admin.email);
    store.users.push(
      {
        ...newUser,
        id: 10,
        email: 'm@example.test',
        roles: [{ departmentId: 1, requiresAvailability: true }],
      },
      {
        ...newUser,
        id: 11,
        email: 'o@example.test',
        roles: [{ departmentId: 2, requiresAvailability: true }],
      },
    );
    const post = (body: unknown) =>
      app.request('/api/admin/departments/1/posts', json(cookie, 'POST', body));

    const open = await post({ name: '受付', restricted: false, memberIds: [] });
    expect(open.status).toBe(201);
    expect((await post({ name: '受付', restricted: false, memberIds: [] })).status).toBe(409);
    // 制限付きなのにメンバーなし、他部門の人をメンバーにする、はどちらも拒否
    expect((await post({ name: '調理', restricted: true, memberIds: [] })).status).toBe(400);
    expect((await post({ name: '調理', restricted: true, memberIds: [11] })).status).toBe(400);
    const restricted = await post({ name: '調理', restricted: true, memberIds: [10, 10] });
    expect(restricted.status).toBe(201);
    const created = (await restricted.json()) as { id: number; memberIds: number[] };
    expect(created.memberIds).toEqual([10]);

    // 同じ時間帯でも持ち場が違えば枠は重ならない。同じ持ち場なら重なる
    const slot = (postId: number) =>
      app.request(
        '/api/admin/slots',
        json(cookie, 'POST', {
          postId,
          startsAt: '2026-11-01T09:00:00+09:00',
          endsAt: '2026-11-01T10:00:00+09:00',
          minPeople: 1,
          maxPeople: 2,
        }),
      );
    const openId = ((await open.json()) as { id: number }).id;
    expect((await slot(openId)).status).toBe(201);
    expect((await slot(created.id)).status).toBe(201);
    expect((await slot(created.id)).status).toBe(409);
    expect(store.slots.every((s) => s.departmentId === 1)).toBe(true);

    // 枠のある持ち場は削除できない
    expect(
      (await app.request(`/api/admin/posts/${created.id}`, json(cookie, 'DELETE'))).status,
    ).toBe(409);
    const edit = await app.request(
      `/api/admin/posts/${created.id}`,
      json(cookie, 'PUT', { name: '調理', restricted: false, memberIds: [] }),
    );
    expect(edit.status).toBe(200);
  });

  describe('auto assignment', () => {
    const iso = (h: number) => new Date(Date.UTC(2026, 10, 1, h - 9)).toISOString();
    const seed = () => {
      const member = (id: number) => ({
        ...newUser,
        id,
        email: `m${id}@example.test`,
        roles: [{ departmentId: 1, requiresAvailability: true }],
      });
      store.users.push(member(10), member(11));
      store.posts.push({ id: 1, departmentId: 1, name: '全体', restricted: false, memberIds: [] });
      const slot = (id: number, a: number, b: number, min: number) => ({
        id,
        departmentId: 1,
        postId: 1,
        startsAt: new Date(iso(a)),
        endsAt: new Date(iso(b)),
        minPeople: min,
        maxPeople: 2,
      });
      store.slots.push(slot(1, 9, 10, 1), slot(2, 10, 11, 3));
    };
    const finish = async (app: ReturnType<typeof makeApp>, cookie: string) => {
      for (let i = 0; i < 100; i++) {
        const run = (await (
          await app.request('/api/admin/assign/run', { headers: { cookie } })
        ).json()) as {
          status: string;
        };
        if (run.status !== 'running') return run;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('run did not finish');
    };

    it('is admin-only', async () => {
      const app = makeApp(devEnv);
      const cookie = await loginConfirmed(app, general.email);
      expect((await app.request('/api/admin/assign/run', json(cookie, 'POST', {}))).status).toBe(
        403,
      );
    });

    it('runs asynchronously, reports shortages and keeps locked assignments on re-run', async () => {
      const app = makeApp(devEnv);
      const cookie = await loginConfirmed(app, admin.email);
      seed();
      const started = await app.request('/api/admin/assign/run', json(cookie, 'POST', {}));
      expect(started.status).toBe(202);
      // 実行中の再実行は拒否
      expect((await app.request('/api/admin/assign/run', json(cookie, 'POST', {}))).status).toBe(
        409,
      );
      expect(await finish(app, cookie)).toMatchObject({
        status: 'done',
        result: { shortageSlots: 1, shortagePeople: 1 },
      });

      const got = (await (
        await app.request('/api/admin/assign', { headers: { cookie } })
      ).json()) as {
        assignments: { userId: number; slotId: number }[];
        shortages: { slotId: number; missing: number }[];
        violations: unknown[];
      };
      expect(got.shortages).toEqual([{ slotId: 2, missing: 1 }]);
      expect(got.violations).toEqual([]);

      // 手動追加（固定）は再実行で維持される。まず枠1の自動割り当てを外して手動で入れ直す
      for (const a of got.assignments.filter((x) => x.slotId === 1))
        await app.request(
          `/api/admin/assign/assignments/${a.userId}/${a.slotId}`,
          json(cookie, 'DELETE'),
        );
      await app.request(
        '/api/admin/assign/assignments',
        json(cookie, 'POST', { userId: 10, slotId: 1 }),
      );
      await app.request('/api/admin/assign/run', json(cookie, 'POST', {}));
      await finish(app, cookie);
      expect(store.assignments.find((a) => a.userId === 10 && a.slotId === 1)).toMatchObject({
        source: 'manual',
        locked: true,
      });
    });

    it('warns on rule-breaking manual edits but still allows them', async () => {
      const app = makeApp(devEnv);
      const cookie = await loginConfirmed(app, admin.email);
      seed();
      const add = (userId: number, slotId: number) =>
        app.request('/api/admin/assign/assignments', json(cookie, 'POST', { userId, slotId }));
      // 他部門の人: 警告つきで追加できる
      store.users.push({ ...newUser, id: 12, email: 'x@example.test', roles: [] });
      const res = await add(12, 1);
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ warnings: [{ reason: 'not_in_department' }] });
      expect((await add(12, 1)).status).toBe(409);
      expect((await add(999, 1)).status).toBe(400);

      const lock = await app.request(
        '/api/admin/assign/assignments/12/1/lock',
        json(cookie, 'PUT', { locked: false }),
      );
      expect(lock.status).toBe(200);
      expect(store.assignments[0]!.locked).toBe(false);
    });
  });
});
