import { createDb } from './client.js';
import { departments, users } from './schema.js';

const { db, sql } = createDb();
await db
  .insert(departments)
  .values(['総務部', '模擬店部', 'デコレ部', '展示部', '放送部'].map((name) => ({ name })))
  .onConflictDoNothing();
await db
  .insert(users)
  .values([
    { email: 'admin1@example.test', name: '管理者1', isAdmin: true },
    { email: 'admin2@example.test', name: '管理者2', isAdmin: true },
    { email: 'user1@example.test', name: '一般ユーザー1' },
  ])
  .onConflictDoNothing();
await sql.end();
// TODO: 役職・サンプル枠・希望・初回未確認ユーザー等を PLAN.md 10.1 のテストアカウント一覧に合わせて追加する
