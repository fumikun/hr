import type { DashboardData } from '../routes/AdminDashboard';
import { fmtDateTime } from './datetime';

/** wait: 待つだけで、管理者がやることのない手順（「次にやること」の帯に出さない） */
export type Step = {
  title: string;
  detail: string;
  to: string;
  link: string;
  done: boolean;
  wait?: boolean;
};

/** 作業の流れ。ダッシュボードの一覧と、各管理画面の「次にやること」の帯で共通に使う */
export function adminSteps(
  d: Pick<DashboardData, 'period' | 'scopes' | 'status' | 'slots' | 'users' | 'assign' | 'run'>,
): Step[] {
  const required = d.status.filter((s) => s.required);
  const missing = required.filter((s) => !s.submittedAt);
  const periodSet =
    d.scopes.departments.length > 0 && d.scopes.departments.every((x) => x.opensAt && x.closesAt);
  const overridden = d.scopes.scopes.filter((x) => x.opensAt || x.closesAt).length;
  const drafts = d.assign.assignments.filter((a) => a.status === 'draft').length;
  const confirmed = d.assign.assignments.length - drafts;
  return [
    {
      title: 'ユーザーを登録する',
      detail: `${d.users.length} 人が登録済み`,
      to: '/admin/users',
      link: 'ユーザー管理',
      done: d.users.length > 1,
    },
    {
      title: '部門の持ち場と枠を作る',
      detail: d.slots.length > 0 ? `${d.slots.length} 枠を作成済み` : 'まだ枠がありません',
      to: '/admin/slots',
      link: '枠',
      done: d.slots.length > 0,
    },
    {
      title: '希望の受付期間を決める',
      detail: periodSet
        ? `${fmtDateTime(d.period.opensAt)} 〜 ${fmtDateTime(d.period.closesAt)}${
            overridden > 0 ? `（部門・持ち場の個別設定 ${overridden} 件）` : ''
          }`
        : '開始と締切が未設定の部門があります',
      to: '/admin/availability',
      link: '受付期間',
      done: periodSet,
    },
    {
      title: '希望がそろうのを待つ',
      wait: true,
      detail:
        required.length === 0
          ? '希望入力が必要な人がいません'
          : missing.length === 0
            ? '全員が入力済みです'
            : `未入力 ${missing.length} 人（${required.length - missing.length}/${required.length}人が入力済み）`,
      to: '/admin/availability',
      link: '入力状況',
      done: periodSet && required.length > 0 && missing.length === 0,
    },
    {
      title: '自動割り当てを実行する',
      detail: d.run
        ? `最終実行 ${fmtDateTime(d.run.finishedAt ?? d.run.startedAt)}（${
            d.run.status === 'done' ? '完了' : d.run.status === 'running' ? '実行中' : '失敗'
          }）`
        : '未実行です',
      to: '/admin/assign',
      link: '割り当て',
      done: d.run?.status === 'done',
    },
    {
      title: '不足を直して公開する',
      detail:
        confirmed > 0 && drafts === 0
          ? `${confirmed} 件を公開済み`
          : `不足 ${d.assign.shortages.length} 枠、未公開 ${drafts} 件`,
      to: '/admin/assign',
      link: '公開する',
      done: confirmed > 0 && drafts === 0 && d.assign.shortages.length === 0,
    },
    {
      title: '印刷・出力する',
      detail: '部門別の時間割、個人別、全体一覧を印刷／CSVで保存',
      to: '/admin/print',
      link: '印刷・出力',
      done: false,
    },
  ];
}
