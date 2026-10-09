import { and, eq, inArray } from 'drizzle-orm';
import type { createDb } from '../db/client.js';
import {
  auditLogs,
  departments,
  postMembers,
  posts,
  shiftSlots,
  userRoles,
  users,
} from '../db/schema.js';
import { createAvailabilityStore } from '../availability/store.js';
import type { AdminStore, AdminUser, Post, PostInput, UserInput } from './types.js';

type Db = ReturnType<typeof createDb>['db'];
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function loadUsers(db: Db | Tx, ids?: number[]): Promise<AdminUser[]> {
  const rows = ids
    ? await db.select().from(users).where(inArray(users.id, ids))
    : await db.select().from(users);
  const roles = ids
    ? await db.select().from(userRoles).where(inArray(userRoles.userId, ids))
    : await db.select().from(userRoles);
  return rows
    .sort((a, b) => a.id - b.id)
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isAdmin: u.isAdmin,
      targetMinutes: u.targetMinutes,
      maxMinutes: u.maxMinutes,
      roles: roles
        .filter((r) => r.userId === u.id)
        .map((r) => ({
          departmentId: r.departmentId,
          requiresAvailability: r.requiresAvailability,
        })),
    }));
}

const columns = (i: UserInput) => ({
  email: i.email,
  name: i.name,
  isAdmin: i.isAdmin,
  targetMinutes: i.targetMinutes,
  maxMinutes: i.maxMinutes,
});

// 役職は差分更新する（残る役職の confirmed_at は保持）
async function setRoles(tx: Tx, userId: number, roles: UserInput['roles']) {
  const current = await tx.select().from(userRoles).where(eq(userRoles.userId, userId));
  const wanted = new Set(roles.map((r) => r.departmentId));
  const existing = new Set(current.map((c) => c.departmentId));
  const removed = [...existing].filter((d) => !wanted.has(d));
  if (removed.length > 0) {
    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), inArray(userRoles.departmentId, removed)));
    // 部門を外れた人は、その部門の持ち場のメンバーからも外す
    const stale = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(inArray(posts.departmentId, removed));
    if (stale.length > 0)
      await tx.delete(postMembers).where(
        and(
          eq(postMembers.userId, userId),
          inArray(
            postMembers.postId,
            stale.map((p) => p.id),
          ),
        ),
      );
  }
  for (const r of roles) {
    if (existing.has(r.departmentId)) {
      await tx
        .update(userRoles)
        .set({ requiresAvailability: r.requiresAvailability })
        .where(and(eq(userRoles.userId, userId), eq(userRoles.departmentId, r.departmentId)));
    } else {
      await tx.insert(userRoles).values({ userId, ...r });
    }
  }
}

async function audit(
  tx: Tx,
  actorId: number,
  action: string,
  target: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(auditLogs).values({ actorId, action, target, before, after });
}

async function loadPosts(db: Db | Tx, departmentId?: number): Promise<Post[]> {
  const rows = await db
    .select()
    .from(posts)
    .where(departmentId === undefined ? undefined : eq(posts.departmentId, departmentId))
    .orderBy(posts.departmentId, posts.id);
  if (rows.length === 0) return [];
  const members = await db
    .select()
    .from(postMembers)
    .where(
      inArray(
        postMembers.postId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => ({
    ...r,
    memberIds: members
      .filter((m) => m.postId === r.id)
      .map((m) => m.userId)
      .sort((a, b) => a - b),
  }));
}

async function setMembers(tx: Tx, postId: number, input: PostInput) {
  await tx.delete(postMembers).where(eq(postMembers.postId, postId));
  // 制限なしの持ち場にはメンバー名簿を持たない
  if (input.restricted && input.memberIds.length > 0)
    await tx.insert(postMembers).values(input.memberIds.map((userId) => ({ postId, userId })));
}

export function createAdminStore(db: Db): AdminStore {
  return {
    ...createAvailabilityStore(db),
    listPosts: (departmentId) => loadPosts(db, departmentId),

    createPost: (departmentId, input, actorId) =>
      db.transaction(async (tx) => {
        const [dup] = await tx
          .select()
          .from(posts)
          .where(and(eq(posts.departmentId, departmentId), eq(posts.name, input.name)));
        if (dup) return null;
        const [row] = await tx
          .insert(posts)
          .values({ departmentId, name: input.name, restricted: input.restricted })
          .returning();
        await setMembers(tx, row!.id, input);
        const [created] = (await loadPosts(tx, departmentId)).filter((p) => p.id === row!.id);
        await audit(tx, actorId, 'post.create', `post:${row!.id}`, null, created);
        return created!;
      }),

    updatePost: (id, input, actorId) =>
      db.transaction(async (tx) => {
        const [row] = await tx.select().from(posts).where(eq(posts.id, id));
        if (!row) return null;
        const before = (await loadPosts(tx, row.departmentId)).find((p) => p.id === id);
        const [dup] = await tx
          .select()
          .from(posts)
          .where(and(eq(posts.departmentId, row.departmentId), eq(posts.name, input.name)));
        if (dup && dup.id !== id) return 'name_taken';
        await tx
          .update(posts)
          .set({ name: input.name, restricted: input.restricted })
          .where(eq(posts.id, id));
        await setMembers(tx, id, input);
        const after = (await loadPosts(tx, row.departmentId)).find((p) => p.id === id);
        await audit(tx, actorId, 'post.update', `post:${id}`, before, after);
        return after!;
      }),

    deletePost: (id, actorId) =>
      db.transaction(async (tx) => {
        const [row] = await tx.select().from(posts).where(eq(posts.id, id));
        if (!row) return 'not_found';
        const [used] = await tx
          .select({ id: shiftSlots.id })
          .from(shiftSlots)
          .where(eq(shiftSlots.postId, id))
          .limit(1);
        if (used) return 'has_slots';
        const before = (await loadPosts(tx, row.departmentId)).find((p) => p.id === id);
        await tx.delete(posts).where(eq(posts.id, id));
        await audit(tx, actorId, 'post.delete', `post:${id}`, before, null);
        return 'ok';
      }),

    listSlots: (departmentId) =>
      db
        .select()
        .from(shiftSlots)
        .where(departmentId === undefined ? undefined : eq(shiftSlots.departmentId, departmentId))
        .orderBy(shiftSlots.startsAt, shiftSlots.id),

    createSlots: (inputs, actorId) =>
      db.transaction(async (tx) => {
        if (inputs.length === 0) return [];
        const created = await tx.insert(shiftSlots).values(inputs).returning();
        await audit(tx, actorId, 'slot.create', 'slots', null, { count: created.length });
        return created;
      }),

    updateSlot: (id, input, actorId) =>
      db.transaction(async (tx) => {
        const [before] = await tx.select().from(shiftSlots).where(eq(shiftSlots.id, id));
        if (!before) return null;
        const [after] = await tx
          .update(shiftSlots)
          .set(input)
          .where(eq(shiftSlots.id, id))
          .returning();
        await audit(tx, actorId, 'slot.update', `slot:${id}`, before, after);
        return after!;
      }),

    deleteSlot: (id, actorId) =>
      db.transaction(async (tx) => {
        const [before] = await tx.select().from(shiftSlots).where(eq(shiftSlots.id, id));
        if (!before) return false;
        await tx.delete(shiftSlots).where(eq(shiftSlots.id, id));
        await audit(tx, actorId, 'slot.delete', `slot:${id}`, before, null);
        return true;
      }),

    listUsers: () => loadUsers(db),
    listDepartments: () => db.select().from(departments).orderBy(departments.id),

    createUser: (input, actorId) =>
      db.transaction(async (tx) => {
        const [dup] = await tx.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (dup) return null;
        const [row] = await tx.insert(users).values(columns(input)).returning();
        await setRoles(tx, row!.id, input.roles);
        const [created] = await loadUsers(tx, [row!.id]);
        await audit(tx, actorId, 'user.create', `user:${row!.id}`, null, created);
        return created!;
      }),

    updateUser: (id, input, actorId) =>
      db.transaction(async (tx) => {
        const [before] = await loadUsers(tx, [id]);
        if (!before) return null;
        const [dup] = await tx.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (dup && dup.id !== id) throw new Error('email_taken');
        await tx.update(users).set(columns(input)).where(eq(users.id, id));
        await setRoles(tx, id, input.roles);
        const [after] = await loadUsers(tx, [id]);
        await audit(tx, actorId, 'user.update', `user:${id}`, before, after);
        return after!;
      }),

    deleteUser: (id, actorId) =>
      db.transaction(async (tx) => {
        const [before] = await loadUsers(tx, [id]);
        if (!before) return false;
        await tx.delete(users).where(eq(users.id, id));
        await audit(tx, actorId, 'user.delete', `user:${id}`, before, null);
        return true;
      }),

    importUsers: (inputs, actorId) =>
      db.transaction(async (tx) => {
        const existing = inputs.length
          ? await tx
              .select()
              .from(users)
              .where(
                inArray(
                  users.email,
                  inputs.map((i) => i.email),
                ),
              )
          : [];
        const idByEmail = new Map(existing.map((u) => [u.email, u.id]));
        let created = 0;
        let updated = 0;
        for (const input of inputs) {
          const id = idByEmail.get(input.email);
          if (id === undefined) {
            const [row] = await tx.insert(users).values(columns(input)).returning();
            await setRoles(tx, row!.id, input.roles);
            created++;
          } else {
            await tx.update(users).set(columns(input)).where(eq(users.id, id));
            await setRoles(tx, id, input.roles);
            updated++;
          }
        }
        await audit(tx, actorId, 'user.import', 'users', null, { created, updated });
        return { created, updated };
      }),
  };
}
