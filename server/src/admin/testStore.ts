import type { AdminStore, AdminUser, Department, Slot } from './types.js';

export const testDepartments: Department[] = [
  { id: 1, name: '総務部' },
  { id: 2, name: '模擬店部' },
];

/** テスト用のインメモリ実装 */
export function createMemoryStore(
  initial: AdminUser[] = [],
): AdminStore & { users: AdminUser[]; slots: Slot[] } {
  const users = [...initial];
  let nextId = Math.max(0, ...users.map((u) => u.id)) + 1;
  const slots: Slot[] = [];
  let nextSlotId = 1;
  return {
    users,
    slots,
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
