import { and, eq, inArray } from 'drizzle-orm';
import type { createDb } from '../db/client.js';
import { auditLogs, departments, shiftSlots, userRoles, users } from '../db/schema.js';
import { createAvailabilityStore } from '../availability/store.js';
import type { AdminStore, AdminUser, UserInput } from './types.js';

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

export function createAdminStore(db: Db): AdminStore {
  return {
    ...createAvailabilityStore(db),
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
