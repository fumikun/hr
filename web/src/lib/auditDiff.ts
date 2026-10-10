// 操作履歴の before/after を、項目名つきの「何がどう変わったか」に変換する
const LABEL: Record<string, string> = {
  email: 'メール',
  name: '名前',
  isAdmin: '管理者',
  targetMinutes: '目標勤務(分)',
  maxMinutes: '上限(分)',
  roles: '所属部門',
  departmentId: '部門ID',
  postId: '持ち場ID',
  restricted: '限定',
  memberIds: 'メンバー(ID)',
  startsAt: '開始',
  endsAt: '終了',
  minPeople: '最低人数',
  maxPeople: '最大人数',
  opensAt: '受付開始',
  closesAt: '締切',
  count: '件数',
  created: '新規',
  updated: '更新',
  assigned: '割り当て数',
  shortageSlots: '不足枠',
  shortagePeople: '不足人数',
  solverStatus: '計算結果',
  userId: 'ユーザーID',
  slotId: '枠ID',
  locked: 'ピン留め',
  source: '由来',
  status: '状態',
  id: 'ID',
};

export type DiffRow = { key: string; label: string; before: string | null; after: string | null };

const show = (v: unknown): string => {
  if (v === null || v === undefined) return '（なし）';
  if (typeof v === 'boolean') return v ? 'はい' : 'いいえ';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()))
      return d.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
  }
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return JSON.stringify(v);
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** 変わった項目だけを返す。作成・削除のときは全項目 */
export function diffRows(before: unknown, after: unknown): DiffRow[] {
  const b = obj(before);
  const a = obj(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({
      key: k,
      label: LABEL[k] ?? k,
      before: k in b ? show(b[k]) : null,
      after: k in a ? show(a[k]) : null,
    }));
}
