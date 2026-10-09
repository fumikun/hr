import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const availabilityType = pgEnum('availability_type', ['want', 'ok', 'ng']);
export const assignmentSource = pgEnum('assignment_source', ['auto', 'manual']);
export const assignmentStatus = pgEnum('assignment_status', ['draft', 'confirmed']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  targetMinutes: integer('target_minutes'),
  maxMinutes: integer('max_minutes'),
  firstLoginConfirmedAt: timestamp('first_login_confirmed_at', { withTimezone: true }),
  // 希望入力を一度でも保存した日時（未入力＝全時間帯「入れる」と区別して入力状況を出すため）
  availabilitySubmittedAt: timestamp('availability_submitted_at', { withTimezone: true }),
});

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    requiresAvailability: boolean('requires_availability').notNull().default(true),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.departmentId] })],
);

// 持ち場: 部門内の担当場所。restricted=false なら部門の全員が入れる。
// restricted=true なら post_members に登録された人だけ（部門の所属者に限る）。
export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    restricted: boolean('restricted').notNull().default(false),
  },
  (t) => [unique().on(t.departmentId, t.name)],
);

export const postMembers = pgTable(
  'post_members',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

// 枠は部門ごと・5分単位。部門内で長さが混在してよいので、個々の枠を実体として持つ。
export const shiftSlots = pgTable('shift_slots', {
  id: serial('id').primaryKey(),
  departmentId: integer('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'cascade' }),
  // 持ち場。department_id は post の部門と常に一致させる（API側で保証）
  postId: integer('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'restrict' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  minPeople: integer('min_people').notNull().default(1),
  maxPeople: integer('max_people').notNull().default(1),
});

// ng は department_id = null（全部門共通）。want/ok は部門必須。未入力は ok 扱い。
export const availabilities = pgTable('availabilities', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  departmentId: integer('department_id').references(() => departments.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  type: availabilityType('type').notNull(),
});

export const assignments = pgTable(
  'assignments',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slotId: integer('slot_id')
      .notNull()
      .references(() => shiftSlots.id, { onDelete: 'cascade' }),
    source: assignmentSource('source').notNull(),
    locked: boolean('locked').notNull().default(false),
    status: assignmentStatus('status').notNull().default('draft'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slotId] })],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  target: text('target'),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({ roles: many(userRoles) }));

// 自動割り当ての実行履歴。非同期に実行し、進行状況と結果を画面に出す。
export const assignmentRuns = pgTable('assignment_runs', {
  id: serial('id').primaryKey(),
  status: text('status').notNull(), // running | done | failed
  phase: text('phase').notNull().default('queued'), // loading | solving | saving
  startedBy: integer('started_by').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  options: jsonb('options'),
  result: jsonb('result'),
  error: text('error'),
});
