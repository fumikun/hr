export type AvailabilityType = 'want' | 'ok' | 'ng';
export type AvailabilityEntry = {
  type: AvailabilityType;
  /** ng は null（全部門共通）、want/ok は部門必須 */
  departmentId: number | null;
  startsAt: Date;
  endsAt: Date;
};
export type Period = { opensAt: Date | null; closesAt: Date | null };
export type UserRoleInfo = { departmentId: number; requiresAvailability: boolean };

export type InputStatus = {
  userId: number;
  name: string;
  email: string;
  /** 希望入力が必要な部門が1つもなければ false */
  required: boolean;
  submittedAt: Date | null;
  entryCount: number;
};

export interface AvailabilityStore {
  getPeriod(): Promise<Period>;
  setPeriod(period: Period, actorId: number): Promise<void>;
  /** 存在しないユーザーは null */
  getUserRoles(userId: number): Promise<UserRoleInfo[] | null>;
  getAvailability(
    userId: number,
  ): Promise<{ submittedAt: Date | null; entries: AvailabilityEntry[] }>;
  /** 全置換。actorId は操作者（本人または管理者） */
  replaceAvailability(userId: number, entries: AvailabilityEntry[], actorId: number): Promise<void>;
  listInputStatus(): Promise<InputStatus[]>;
}
