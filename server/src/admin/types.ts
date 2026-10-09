import type { ScopeStore } from '../scope/types.js';
import type { AssignStore, AuditStore } from '../assign/types.js';
import type { AvailabilityStore } from '../availability/types.js';

export type Department = { id: number; name: string };
export type RoleInput = { departmentId: number; requiresAvailability: boolean };
export type UserInput = {
  email: string;
  name: string;
  isAdmin: boolean;
  targetMinutes: number | null;
  maxMinutes: number | null;
  roles: RoleInput[];
};
export type AdminUser = UserInput & { id: number };

export interface AdminStore
  extends SlotStore, PostStore, AvailabilityStore, AssignStore, AuditStore, ScopeStore {
  listUsers(): Promise<AdminUser[]>;
  listDepartments(): Promise<Department[]>;
  /** 既定の持ち場「全体」も一緒に作る。同名があれば null */
  createDepartment(name: string, actorId: number): Promise<Department | null>;
  renameDepartment(
    id: number,
    name: string,
    actorId: number,
  ): Promise<Department | 'name_taken' | null>;
  /** 所属者か枠がある部門は削除できない */
  deleteDepartment(id: number, actorId: number): Promise<'ok' | 'not_found' | 'in_use'>;
  /** メールが既に登録済みなら null */
  createUser(input: UserInput, actorId: number): Promise<AdminUser | null>;
  updateUser(id: number, input: UserInput, actorId: number): Promise<AdminUser | null>;
  deleteUser(id: number, actorId: number): Promise<boolean>;
  /** メールをキーに作成または更新する。全件まとめて1トランザクション。 */
  importUsers(inputs: UserInput[], actorId: number): Promise<{ created: number; updated: number }>;
}

export type PostInput = {
  name: string;
  /** true なら memberIds の人だけ入れる。false なら部門の全員 */
  restricted: boolean;
  memberIds: number[];
};
export type Post = PostInput & { id: number; departmentId: number };

export interface PostStore {
  listPosts(departmentId?: number): Promise<Post[]>;
  /** 同じ部門に同名の持ち場があれば null */
  createPost(departmentId: number, input: PostInput, actorId: number): Promise<Post | null>;
  /** 同名の持ち場が他にあれば 'name_taken' */
  updatePost(id: number, input: PostInput, actorId: number): Promise<Post | 'name_taken' | null>;
  /** 枠がある持ち場は削除できない */
  deletePost(id: number, actorId: number): Promise<'ok' | 'not_found' | 'has_slots'>;
}

export type SlotInput = {
  departmentId: number;
  postId: number;
  startsAt: Date;
  endsAt: Date;
  minPeople: number;
  maxPeople: number;
};
export type Slot = SlotInput & { id: number };

export interface SlotStore {
  listSlots(departmentId?: number): Promise<Slot[]>;
  createSlots(inputs: SlotInput[], actorId: number): Promise<Slot[]>;
  /** 部門・持ち場は変更できない */
  updateSlot(
    id: number,
    input: Omit<SlotInput, 'departmentId' | 'postId'>,
    actorId: number,
  ): Promise<Slot | null>;
  deleteSlot(id: number, actorId: number): Promise<boolean>;
}
