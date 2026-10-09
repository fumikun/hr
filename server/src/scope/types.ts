export type ScopeType = 'department' | 'post';
export type Period = { opensAt: Date | null; closesAt: Date | null };

/**
 * 部門・持ち場ごとの個別設定。null の項目は「ひとつ上の設定を引き継ぐ」。
 * 引き継ぎの順: 持ち場 → 部門 → 全体（全体の受付期間と、イベントの日程）
 */
export type ScopeSetting = {
  type: ScopeType;
  id: number;
  opensAt: Date | null;
  closesAt: Date | null;
  /** 調整の対象にする日（YYYY-MM-DD、日本時間）。null ならイベントの全日程 */
  days: string[] | null;
};

export interface ScopeStore {
  /** 保存されたイベントの日程。未設定なら null */
  getEventDays(): Promise<string[] | null>;
  setEventDays(days: string[], actorId: number): Promise<void>;
  listScopes(): Promise<ScopeSetting[]>;
  /** 期間も日程もすべて null なら、個別設定を削除する（全体の設定に戻す） */
  setScope(setting: ScopeSetting, actorId: number): Promise<void>;
}
