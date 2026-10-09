import { eq, inArray } from 'drizzle-orm';
import { createDb } from './client.js';
import { departments, postMembers, posts, userRoles, users } from './schema.js';

const { db, sql } = createDb();
const now = new Date();

await db
  .insert(departments)
  .values(['総務部', '模擬店部', 'デコレ部', '展示部', '放送部'].map((name) => ({ name })))
  .onConflictDoNothing();
const deptId = Object.fromEntries((await db.select().from(departments)).map((d) => [d.name, d.id]));

// PLAN.md 10.1 のテストアカウント。未登録ユーザーはDBに入れない（API側で一覧に追加される）。
const accounts = [
  { email: 'admin1@example.test', name: '管理者1', isAdmin: true, roles: [['総務部', true]] },
  { email: 'admin2@example.test', name: '管理者2', isAdmin: true, roles: [['総務部', true]] },
  { email: 'single@example.test', name: '単一部門ユーザー', roles: [['模擬店部', true]] },
  {
    email: 'multi@example.test',
    name: '掛け持ちユーザー',
    roles: [
      ['デコレ部', true],
      ['展示部', true],
      ['放送部', true],
    ],
  },
  {
    email: 'new@example.test',
    name: '初回未確認ユーザー',
    unconfirmed: true,
    roles: [['展示部', true]],
  },
  { email: 'norequire@example.test', name: '入力不要ユーザー', roles: [['総務部', false]] },
] as const;

for (const a of accounts) {
  await db
    .insert(users)
    .values({
      email: a.email,
      name: a.name,
      isAdmin: 'isAdmin' in a,
      firstLoginConfirmedAt: 'unconfirmed' in a ? null : now,
    })
    .onConflictDoNothing();
}
// 初回未確認ユーザーは、シードのたびに未確認へ戻す（確認画面を何度でも試せるように）
await db
  .update(users)
  .set({ firstLoginConfirmedAt: null })
  .where(eq(users.email, 'new@example.test'));
await db.update(userRoles).set({ confirmedAt: null });
const rows = await db
  .select()
  .from(users)
  .where(
    inArray(
      users.email,
      accounts.map((a) => a.email),
    ),
  );
const userId = Object.fromEntries(rows.map((u) => [u.email, u.id]));
for (const a of accounts) {
  for (const [dept, requiresAvailability] of a.roles) {
    await db
      .insert(userRoles)
      .values({ userId: userId[a.email]!, departmentId: deptId[dept]!, requiresAvailability })
      .onConflictDoNothing();
  }
}
// 持ち場: 各部門に「全体」（誰でも可）を用意し、模擬店部には一部の人だけの「調理」を追加する
for (const id of Object.values(deptId))
  await db.insert(posts).values({ departmentId: id, name: '全体' }).onConflictDoNothing();
const [cooking] = await db
  .insert(posts)
  .values({ departmentId: deptId['模擬店部']!, name: '調理', restricted: true })
  .onConflictDoNothing()
  .returning();
if (cooking)
  await db
    .insert(postMembers)
    .values({ postId: cooking.id, userId: userId['single@example.test']! })
    .onConflictDoNothing();
await sql.end();
// TODO: サンプル枠・希望データ
