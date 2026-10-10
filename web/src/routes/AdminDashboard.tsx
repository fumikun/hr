import { Check, ChevronRight, Circle, CircleDot } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLoaderData } from 'react-router';
import type {
  AdminUser,
  AssignData,
  AssignRun,
  Department,
  InputStatus,
  Period,
  ScopesData,
  Slot,
} from '../api';
import { adminSteps, type Step } from '../lib/adminSteps';
import { Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dateKey, hoursLabel, mdhm, minutesBetween } from '@/lib/datetime';
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
};

type StepState = 'done' | 'current' | 'todo';

/** 祭りの準備の進み具合。最初に終わっていない手順が「いまここ」になる */
function Checklist({
  steps,
  detail,
}: {
  steps: Step[];
  /** いまの手順の下に出す詳細（未入力の人、不足している枠など） */
  detail?: (index: number) => ReactNode;
}) {
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
              <li key={s.title}>
                <Link
                  to={s.to}
                  className={cn(
                    'hover:bg-accent/60 flex min-h-12 items-center gap-3 rounded-md px-2 py-2',
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
                      className={cn(
                        'text-sm font-medium',
                        st === 'todo' && 'text-muted-foreground',
                      )}
                    >
                      {i + 1}. {s.title}
                      {st === 'current' && <Badge className="ml-2">いまここ</Badge>}
                    </p>
                    <p className="text-muted-foreground text-xs">{s.detail}</p>
                  </div>
                  <span
                    className={cn(
                      buttonVariants({
                        size: 'sm',
                        variant: st === 'current' ? 'default' : 'outline',
                      }),
                      'hidden sm:inline-flex',
                    )}
                  >
                    {s.link}
                  </span>
                  <ChevronRight
                    className="text-muted-foreground size-5 shrink-0 sm:hidden"
                    aria-hidden
                  />
                </Link>
                {st === 'current' && detail?.(i)}
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
  const required = d.status.filter((s) => s.required);
  const missing = required.filter((s) => !s.submittedAt);
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

  const steps = adminSteps(d);
  // 人手の見込みは、割り当て前で、大半の人に目標勤務時間があるときだけ出す（未設定だと全部門が不足に見えるため）
  const members = d.users.filter((u) => !u.isAdmin);
  const targetsSet = members.filter((u) => u.targetMinutes !== null).length;
  const showCapacity =
    d.slots.length > 0 && !d.run && members.length > 0 && targetsSet >= members.length / 2;

  // いまの手順の詳細。手順の並びは lib/adminSteps.ts と同じ
  const detail = (index: number) => {
    if (index === 3 && missing.length > 0)
      return (
        <ul className="flex flex-wrap gap-2 px-2 pt-2 pb-1 sm:pl-10">
          {missing.slice(0, 20).map((u) => (
            <li key={u.userId}>
              <Link
                className="hover:bg-accent inline-flex min-h-10 items-center rounded border px-3 text-sm sm:min-h-0 sm:px-2 sm:py-0.5"
                to={`/admin/users/${u.userId}/availability`}
              >
                {u.name}
              </Link>
            </li>
          ))}
          {missing.length > 20 && (
            <li className="text-muted-foreground text-sm">ほか {missing.length - 20}人</li>
          )}
        </ul>
      );
    if (index === 5 && d.assign.shortages.length > 0)
      return (
        <ul className="space-y-1 px-2 pt-2 pb-1 text-sm sm:pl-10">
          {d.assign.shortages.slice(0, 8).map((x) => {
            const slot = slotById.get(x.slotId);
            if (!slot) return null;
            return (
              <li key={x.slotId}>
                <Link
                  className="hover:bg-accent flex min-h-10 items-center justify-between gap-2 rounded px-1 sm:min-h-0 sm:py-0.5"
                  to={`/admin/assign?dept=${slot.departmentId}&day=${dateKey(slot.startsAt)}`}
                >
                  <span>
                    {deptName(slot.departmentId)} {mdhm(slot.startsAt)}
                  </span>
                  <Badge variant="destructive">⚠ あと{x.missing}人</Badge>
                </Link>
              </li>
            );
          })}
          {d.assign.shortages.length > 8 && (
            <li className="text-muted-foreground">ほか {d.assign.shortages.length - 8}枠</li>
          )}
        </ul>
      );
    return null;
  };

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">ダッシュボード</h1>
      {d.assign.excludedSlotIds.length > 0 && (
        <Notice kind="warning">
          対象日以外のシフト枠が {d.assign.excludedSlotIds.length}{' '}
          件あります（割り当てに使われません）。
          <Link
            to="/admin/slots"
            className="ml-1 inline-flex min-h-10 items-center underline sm:min-h-0"
          >
            シフト枠を確認
          </Link>
        </Notice>
      )}
      <Checklist steps={steps} detail={detail} />

      {showCapacity && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">人手の見込み</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              必要 <b>{hoursLabel(needMin)}</b> ／ 目標の合計 <b>{hoursLabel(targetOf())}</b>
            </p>
            {targetsMissing && (
              <Notice kind="warning">目標勤務時間が未設定の人は含まれていません。</Notice>
            )}
            <ul className="divide-y">
              {capacity.map(({ dept, need, have }) => (
                <li key={dept.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-medium">{dept.name}</span>
                  <span className="text-muted-foreground">
                    必要 {hoursLabel(need)} ／ 目標 {hoursLabel(have)}
                  </span>
                  {have < need && (
                    <Badge variant="destructive" className="ml-auto">
                      ⚠ 不足の恐れ
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
