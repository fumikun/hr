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

export interface AdminStore extends SlotStore {
  listUsers(): Promise<AdminUser[]>;
  listDepartments(): Promise<Department[]>;
  /** メールが既に登録済みなら null */
  createUser(input: UserInput, actorId: number): Promise<AdminUser | null>;
  updateUser(id: number, input: UserInput, actorId: number): Promise<AdminUser | null>;
  deleteUser(id: number, actorId: number): Promise<boolean>;
  /** メールをキーに作成または更新する。全件まとめて1トランザクション。 */
  importUsers(inputs: UserInput[], actorId: number): Promise<{ created: number; updated: number }>;
}

export type SlotInput = {
  departmentId: number;
  startsAt: Date;
  endsAt: Date;
  minPeople: number;
  maxPeople: number;
};
export type Slot = SlotInput & { id: number };

export interface SlotStore {
  listSlots(departmentId?: number): Promise<Slot[]>;
  createSlots(inputs: SlotInput[], actorId: number): Promise<Slot[]>;
  /** 部門は変更できない */
  updateSlot(
    id: number,
    input: Omit<SlotInput, 'departmentId'>,
    actorId: number,
  ): Promise<Slot | null>;
  deleteSlot(id: number, actorId: number): Promise<boolean>;
}
