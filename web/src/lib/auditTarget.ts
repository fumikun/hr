import { mdRange } from './datetime';

export type TargetNames = {
  users: Map<number, string>;
  departments: Map<number, string>;
  /** 持ち場ID → { 名前, 部門ID } */
  posts: Map<number, { name: string; departmentId: number }>;
  slots: Map<number, { startsAt: string; endsAt: string; postId: number }>;
};

/** 種類だけで ID のない対象（設定や一括操作） */
const FIXED: Record<string, string> = {
  users: 'ユーザー（一括）',
  slots: 'シフト枠',
  assignments: '割り当て',
  availability_period: '全体の受付期間',
  event_days: '調整する日程',
};

/**
 * 操作履歴の対象（"post:1" など）を、画面に出す名前にする。
 * 削除済みなどで名前が分からないときは「持ち場（削除済み）」のように種類だけを出す。
 */
export function targetLabel(target: string | null, n: TargetNames): string {
  if (!target) return '';
  if (FIXED[target]) return FIXED[target];
  const [type, raw] = target.split(':');
  const id = Number(raw);
  const postName = (pid: number) => {
    const p = n.posts.get(pid);
    return p ? `${n.departments.get(p.departmentId) ?? '?'} / ${p.name}` : null;
  };
  switch (type) {
    case 'user':
      return n.users.get(id) ?? 'ユーザー（削除済み）';
    case 'department':
      return n.departments.get(id) ?? '部門（削除済み）';
    case 'post':
      return postName(id) ?? '持ち場（削除済み）';
    case 'slot': {
      const s = n.slots.get(id);
      if (!s) return 'シフト枠（削除済み）';
      return `${postName(s.postId) ?? '?'} ${mdRange(s.startsAt, s.endsAt)}`;
    }
    default:
      return target;
  }
}
