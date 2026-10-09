import type { AvailabilityEntry, InputStatus, Period } from '../availability/types.js';
import type { AdminStore, AdminUser, Department, Post, Slot } from './types.js';

export const testDepartments: Department[] = [
  { id: 1, name: '総務部' },
  { id: 2, name: '模擬店部' },
];

/** テスト用のインメモリ実装 */
export function createMemoryStore(initial: AdminUser[] = []): AdminStore & {
  users: AdminUser[];
  slots: Slot[];
  posts: Post[];
  avail: Map<number, { submittedAt: Date; entries: AvailabilityEntry[] }>;
  setPeriodDirect: (p: Period) => void;
} {
  const users = [...initial];
  let nextId = Math.max(0, ...users.map((u) => u.id)) + 1;
  const slots: Slot[] = [];
  const posts: Post[] = [];
  let nextPostId = 1;
  let period: Period = { opensAt: null, closesAt: null };
  const avail = new Map<number, { submittedAt: Date; entries: AvailabilityEntry[] }>();
  let nextSlotId = 1;
  return {
    users,
    slots,
    posts,
    listPosts: (dept) =>
      Promise.resolve(posts.filter((p) => dept === undefined || p.departmentId === dept)),
    createPost: (departmentId, input) => {
      if (posts.some((p) => p.departmentId === departmentId && p.name === input.name))
        return Promise.resolve(null);
      const post = { ...input, id: nextPostId++, departmentId };
      posts.push(post);
      return Promise.resolve(post);
    },
    updatePost: (id, input) => {
      const i = posts.findIndex((p) => p.id === id);
      if (i < 0) return Promise.resolve(null);
      const cur = posts[i]!;
      if (
        posts.some(
          (p) => p.id !== id && p.departmentId === cur.departmentId && p.name === input.name,
        )
      )
        return Promise.resolve('name_taken' as const);
      posts[i] = { ...cur, ...input };
      return Promise.resolve(posts[i]);
    },
    deletePost: (id) => {
      const i = posts.findIndex((p) => p.id === id);
      if (i < 0) return Promise.resolve('not_found' as const);
      if (slots.some((s) => s.postId === id)) return Promise.resolve('has_slots' as const);
      posts.splice(i, 1);
      return Promise.resolve('ok' as const);
    },
    avail,
    setPeriodDirect: (p: Period) => {
      period = p;
    },
    getPeriod: () => Promise.resolve(period),
    setPeriod: (p) => {
      period = p;
      return Promise.resolve();
    },
    getUserRoles: (id) => Promise.resolve(users.find((u) => u.id === id)?.roles ?? null),
    getAvailability: (id) => Promise.resolve(avail.get(id) ?? { submittedAt: null, entries: [] }),
    replaceAvailability: (id, entries) => {
      avail.set(id, { submittedAt: new Date(), entries });
      return Promise.resolve();
    },
    listInputStatus: () =>
      Promise.resolve(
        users.map((u): InputStatus => ({
          userId: u.id,
          name: u.name,
          email: u.email,
          required: u.roles.some((r) => r.requiresAvailability),
          submittedAt: avail.get(u.id)?.submittedAt ?? null,
          entryCount: avail.get(u.id)?.entries.length ?? 0,
        })),
      ),
    listSlots: (dept) =>
      Promise.resolve(slots.filter((s) => dept === undefined || s.departmentId === dept)),
    createSlots: (inputs) => {
      const created = inputs.map((i) => ({ ...i, id: nextSlotId++ }));
      slots.push(...created);
      return Promise.resolve(created);
    },
    updateSlot: (id, input) => {
      const i = slots.findIndex((s) => s.id === id);
      if (i < 0) return Promise.resolve(null);
      slots[i] = { ...slots[i]!, ...input };
      return Promise.resolve(slots[i]);
    },
    deleteSlot: (id) => {
      const i = slots.findIndex((s) => s.id === id);
      if (i >= 0) slots.splice(i, 1);
      return Promise.resolve(i >= 0);
    },
    listUsers: () => Promise.resolve([...users]),
    listDepartments: () => Promise.resolve(testDepartments),
    createUser: (input) => {
      if (users.some((u) => u.email === input.email)) return Promise.resolve(null);
      const user = { ...input, id: nextId++ };
      users.push(user);
      return Promise.resolve(user);
    },
    updateUser: (id, input) => {
      const i = users.findIndex((u) => u.id === id);
      if (i < 0) return Promise.resolve(null);
      users[i] = { ...input, id };
      return Promise.resolve(users[i]);
    },
    deleteUser: (id) => {
      const i = users.findIndex((u) => u.id === id);
      if (i >= 0) users.splice(i, 1);
      return Promise.resolve(i >= 0);
    },
    importUsers: (inputs) => {
      let created = 0;
      let updated = 0;
      for (const input of inputs) {
        const i = users.findIndex((u) => u.email === input.email);
        if (i >= 0) {
          users[i] = { ...input, id: users[i]!.id };
          updated++;
        } else {
          users.push({ ...input, id: nextId++ });
          created++;
        }
      }
      return Promise.resolve({ created, updated });
    },
  };
}
