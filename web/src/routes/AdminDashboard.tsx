import { Check, Circle, CircleDot } from 'lucide-react';
import { Link, useLoaderData } from 'react-router';
import type {
  AdminUser,
  AssignData,
  AssignRun,
  AuditRow,
  Department,
  InputStatus,
  Period,
  ScopesData,
  Slot,
} from '../api';
import { ACTION } from '../lib/auditLabels';
import { Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dateKey, fmtDateTime, hoursLabel, md, mdhm, minutesBetween } from '@/lib/datetime';
import { cn } from '@/lib/utils';

export type DashboardData = {
  period: Period;
  scopes: ScopesData;
  status: InputStatus[];
  slots: Slot[];
  departments: Department[];
  users: AdminUser[];
  assign: AssignData;
  run: AssignRun | null;
  audit: AuditRow[];
};

function Stat({
  label,
  value,
  sub,
  bad,
}: {
  label: string;
  value: string;
  sub?: string;
  bad?: boolean;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-muted-foreground text-sm font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <div className={cn('text-2xl font-bold', bad && 'text-destructive')}>{value}</div>
        {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
}

type StepState = 'done' | 'current' | 'todo';
type Step = { title: string; detail: string; to: string; link: string; done: boolean };

/** 祭りの準備の進み具合。最初に終わっていない手順が「いまここ」になる */
function Checklist({ steps }: { steps: Step[] }) {
  const currentIndex = steps.findIndex((s) => !s.done);
  const state = (i: number): StepState =>
    steps[i]!.done ? 'done' : i === currentIndex ? 'current' : 'todo';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          作業の流れ
          <span className="text-muted-foreground text-xs font-normal">
            {steps.filter((s) => s.done).length} / {steps.length} 完了
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1">
          {steps.map((s, i) => {
            const st = state(i);
            return (
              <li
                key={s.title}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-2',
                  st === 'current' && 'bg-primary/5 ring-primary/30 ring-1',
                )}
              >
                {st === 'done' ? (
                  <Check className="size-5 shrink-0 text-emerald-600" aria-label="完了" />
                ) : st === 'current' ? (
                  <CircleDot className="text-primary size-5 shrink-0" aria-label="いまここ" />
                ) : (
                  <Circle className="text-muted-foreground size-5 shrink-0" aria-label="未着手" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn('text-sm font-medium', st === 'todo' && 'text-muted-foreground')}
                  >
                    {i + 1}. {s.title}
                    {st === 'current' && <Badge className="ml-2">いまここ</Badge>}
                  </p>
                  <p className="text-muted-foreground text-xs">{s.detail}</p>
                </div>
                <Button asChild size="sm" variant={st === 'current' ? 'default' : 'outline'}>
                  <Link to={s.to}>{s.link}</Link>
                </Button>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export function AdminDashboard() {
  const d = useLoaderData<DashboardData>();
  const now = Date.now();
  const required = d.status.filter((s) => s.required);
  const missing = required.filter((s) => !s.submittedAt);
  // 受付期間は、全体の設定と、部門・持ち場ごとの個別設定の両方を見て判断する
  const effective = [...d.scopes.departments, ...d.scopes.posts];
  const isOpen = (r: { opensAt: string | null; closesAt: string | null }) =>
    !!(r.opensAt && r.closesAt) &&
    new Date(r.opensAt).getTime() <= now &&
    now < new Date(r.closesAt).getTime();
  const periodSet =
    d.scopes.departments.length > 0 && d.scopes.departments.every((x) => x.opensAt && x.closesAt);
  const open = effective.some(isOpen);
  const overridden = d.scopes.scopes.filter((x) => x.opensAt || x.closesAt).length;
  const days = d.scopes.eventDays;
  const shortagePeople = d.assign.shortages.reduce((n, s) => n + s.missing, 0);
  const drafts = d.assign.assignments.filter((a) => a.status === 'draft').length;
  const confirmed = d.assign.assignments.length - drafts;
  const slotById = new Map(d.slots.map((s) => [s.id, s]));
  const deptName = (id: number) => d.departments.find((x) => x.id === id)?.name ?? '';

  // 人手の見込み: 必要な延べ時間（最低人数×枠の長さ）と、各部門の所属者の目標勤務時間の合計
  const needMin = d.slots.reduce(
    (n, s) => n + s.minPeople * minutesBetween(s.startsAt, s.endsAt),
    0,
  );
  const targetOf = (deptId?: number) =>
    d.users
      .filter((u) => deptId === undefined || u.roles.some((r) => r.departmentId === deptId))
      .reduce((n, u) => n + (u.targetMinutes ?? 0), 0);
  const capacity = d.departments
    .map((dept) => {
      const need = d.slots
        .filter((s) => s.departmentId === dept.id)
        .reduce((n, s) => n + s.minPeople * minutesBetween(s.startsAt, s.endsAt), 0);
      return { dept, need, have: targetOf(dept.id) };
    })
    .filter((c) => c.need > 0);
  const targetsMissing = d.users.some((u) => u.targetMinutes === null && !u.isAdmin);

  const steps: Step[] = [
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
      link: '枠・持ち場',
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
      title: '不足を直して確定・公開する',
      detail:
        confirmed > 0 && drafts === 0
          ? `${confirmed} 件を確定済み`
          : `不足 ${d.assign.shortages.length} 枠、下書き ${drafts} 件`,
      to: '/admin/assign',
      link: '確定する',
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

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">ダッシュボード</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="希望入力"
          value={`${required.length - missing.length} / ${required.length}人`}
          sub={missing.length > 0 ? `未入力 ${missing.length}人` : '全員入力済み'}
          bad={missing.length > 0 && periodSet && !open}
        />
        <Stat
          label="不足している枠"
          value={`${d.assign.shortages.length}枠`}
          sub={`計 ${shortagePeople}人 不足`}
          bad={shortagePeople > 0}
        />
        <Stat
          label="制約違反の警告"
          value={`${d.assign.violations.length}件`}
          bad={d.assign.violations.length > 0}
        />
        <Stat
          label="確定状況"
          value={`${confirmed}件確定`}
          sub={`下書き ${drafts}件 ／ 枠 ${d.slots.length}`}
        />
      </div>

      <Checklist steps={steps} />

      {d.slots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              人手の見込み（割り当て前の目安）
              {targetOf() < needMin ? (
                <Badge variant="destructive">⚠ 目標勤務時間の合計が必要時間より少ない</Badge>
              ) : (
                <Badge variant="secondary">目標の合計は必要時間以上</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              必要な延べ時間 <b>{hoursLabel(needMin)}</b>（最低人数 × 枠の長さの合計） ／
              全員の目標勤務時間の合計 <b>{hoursLabel(targetOf())}</b>
            </p>
            {targetsMissing && (
              <Notice kind="warning">
                目標勤務時間が未設定の人がいます。設定されていない人は、見込みに含まれません。
              </Notice>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="py-1">部門</th>
                  <th>必要な延べ時間</th>
                  <th>所属者の目標の合計（目安）</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {capacity.map(({ dept, need, have }) => (
                  <tr key={dept.id} className="border-b last:border-0">
                    <td className="py-1">{dept.name}</td>
                    <td>{hoursLabel(need)}</td>
                    <td>{hoursLabel(have)}</td>
                    <td>{have < need && <Badge variant="destructive">⚠ 不足の恐れ</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted-foreground text-xs">
              掛け持ちの人は複数の部門に数えられるため、あくまで目安です。
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              希望入力の受付
              <Badge variant={open ? 'default' : 'secondary'}>
                {open ? '受付中' : periodSet ? '受付していません' : '未設定'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              全体: {fmtDateTime(d.period.opensAt)} 〜 {fmtDateTime(d.period.closesAt)}
              {overridden > 0 && `（部門・持ち場の個別設定 ${overridden} 件）`}
            </p>
            <p className="text-muted-foreground">
              調整する日程: {days.length ? days.map((x) => md(x)).join('・') : '未設定'}
            </p>
            {missing.length > 0 && (
              <>
                <p className="font-medium">未入力の人（{missing.length}人）</p>
                <ul className="flex flex-wrap gap-2">
                  {missing.slice(0, 20).map((u) => (
                    <li key={u.userId}>
                      <Link
                        className="hover:bg-accent rounded border px-2 py-0.5"
                        to={`/admin/users/${u.userId}/availability`}
                      >
                        {u.name}
                      </Link>
                    </li>
                  ))}
                  {missing.length > 20 && (
                    <li className="text-muted-foreground">ほか {missing.length - 20}人</li>
                  )}
                </ul>
              </>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/availability">受付期間・入力状況へ</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">不足している枠</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {d.assign.shortages.length === 0 ? (
              <p className="text-muted-foreground">不足している枠はありません。</p>
            ) : (
              <ul className="space-y-1">
                {d.assign.shortages.slice(0, 8).map((s) => {
                  const slot = slotById.get(s.slotId);
                  if (!slot) return null;
                  return (
                    <li key={s.slotId}>
                      <Link
                        className="hover:bg-accent flex justify-between gap-2 rounded px-1 py-0.5"
                        to={`/admin/assign?dept=${slot.departmentId}&day=${dateKey(slot.startsAt)}`}
                      >
                        <span>
                          {deptName(slot.departmentId)} {mdhm(slot.startsAt)}
                        </span>
                        <Badge variant="destructive">⚠ あと{s.missing}人</Badge>
                      </Link>
                    </li>
                  );
                })}
                {d.assign.shortages.length > 8 && (
                  <li className="text-muted-foreground">ほか {d.assign.shortages.length - 8}枠</li>
                )}
              </ul>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/assign">割り当て画面へ</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近の操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {d.audit.length === 0 && <p className="text-muted-foreground">まだありません。</p>}
          {d.audit.map((r) => (
            <div key={r.id} className="flex justify-between gap-2">
              <span>
                {r.actorName ?? '（削除済み）'}：{ACTION[r.action] ?? r.action}
              </span>
              <span className="text-muted-foreground shrink-0">{fmtDateTime(r.createdAt)}</span>
            </div>
          ))}
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to="/admin/audit">操作履歴をすべて見る</Link>
          </Button>
        </CardContent>
      </Card>
    </Page>
  );
}
