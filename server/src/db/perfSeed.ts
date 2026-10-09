// 性能計測用の大きめのデータを投入する（PERF_PLAN.md）。
// 必ず本番・開発用とは別のデータベースに対して実行すること:
//   DATABASE_URL=postgres://hr:hr@localhost:5432/hr_perf pnpm db:migrate
//   DATABASE_URL=postgres://hr:hr@localhost:5432/hr_perf pnpm perf:seed
import { createAdminStore } from '../admin/store.js';
import { createDb } from './client.js';
import { availabilities, departments, userRoles, users } from './schema.js';

const { db, sql } = createDb();
if ((await db.select().from(users).limit(1)).length > 0) {
  console.error('データが既にあります。空のデータベースで実行してください。');
  process.exit(1);
}
const store = createAdminStore(db);
const MEMBERS = 100;
const DAYS = 3;

await db
  .insert(departments)
  .values(['総務部', '模擬店部', 'デコレ部', '展示部', '放送部'].map((name) => ({ name })));
const depts = await db.select().from(departments);
const now = new Date();
await db.insert(users).values({
  email: 'admin@example.test',
  name: '管理者',
  isAdmin: true,
  firstLoginConfirmedAt: now,
});
await db.insert(users).values(
  Array.from({ length: MEMBERS }, (_, i) => ({
    email: `u${i}@example.test`,
    name: `ユーザー${i}`,
    targetMinutes: 360,
    maxMinutes: 480,
    firstLoginConfirmedAt: now,
  })),
);
const all = await db.select().from(users);
const admin = all.find((u) => u.isAdmin)!;
const members = all.filter((u) => !u.isAdmin);
await db
  .insert(userRoles)
  .values(
    members.flatMap((u, i) => [
      { userId: u.id, departmentId: depts[i % 5]!.id, requiresAvailability: true },
      ...(i % 5 === 0
        ? [{ userId: u.id, departmentId: depts[(i + 1) % 5]!.id, requiresAvailability: true }]
        : []),
    ]),
  );

let slotCount = 0;
for (const d of depts) {
  for (const name of ['全体', '受付']) {
    const post = await store.createPost(d.id, { name, restricted: false, memberIds: [] }, admin.id);
    const slots = [];
    for (let day = 0; day < DAYS; day++)
      for (let h = 9; h < 18; h += 1.5)
        slots.push({
          departmentId: d.id,
          postId: post!.id,
          startsAt: new Date(Date.UTC(2026, 10, 1 + day, h - 9)),
          endsAt: new Date(Date.UTC(2026, 10, 1 + day, h - 9 + 1.5)),
          minPeople: 3,
          maxPeople: 5,
        });
    slotCount += (await store.createSlots(slots, admin.id)).length;
  }
}
await db.insert(availabilities).values(
  members.flatMap((u, i) =>
    Array.from({ length: DAYS }, (_, day) => [
      {
        userId: u.id,
        departmentId: null,
        type: 'ng' as const,
        startsAt: new Date(Date.UTC(2026, 10, 1 + day, 3)),
        endsAt: new Date(Date.UTC(2026, 10, 1 + day, 4)),
      },
      {
        userId: u.id,
        departmentId: depts[i % 5]!.id,
        type: 'want' as const,
        startsAt: new Date(Date.UTC(2026, 10, 1 + day, 0)),
        endsAt: new Date(Date.UTC(2026, 10, 1 + day, 2)),
      },
    ]).flat(),
  ),
);
console.log(
  `投入しました: ユーザー ${all.length} 人、枠 ${slotCount} 件、希望 ${members.length * DAYS * 2} 件`,
);
await sql.end();
