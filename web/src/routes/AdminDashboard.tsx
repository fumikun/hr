import { Link, useLoaderData } from 'react-router';
import type {
  AdminUser,
  AssignData,
  AssignRun,
  AuditRow,
  Department,
  InputStatus,
  Period,
  Slot,
} from '../api';
import { ACTION } from '../lib/auditLabels';
import { Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type DashboardData = {
  period: Period;
  status: InputStatus[];
  slots: Slot[];
  departments: Department[];
  users: AdminUser[];
  assign: AssignData;
  run: AssignRun | null;
  audit: AuditRow[];
};

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
    : '未設定';

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
        <div className={bad ? 'text-destructive text-2xl font-bold' : 'text-2xl font-bold'}>
          {value}
        </div>
        {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function AdminDashboard() {
  const d = useLoaderData<DashboardData>();
  const required = d.status.filter((s) => s.required);
  const missing = required.filter((s) => !s.submittedAt);
  const now = Date.now();
  const open =
    d.period.opensAt &&
    d.period.closesAt &&
    new Date(d.period.opensAt).getTime() <= now &&
    now < new Date(d.period.closesAt).getTime();
  const shortagePeople = d.assign.shortages.reduce((n, s) => n + s.missing, 0);
  const drafts = d.assign.assignments.filter((a) => a.status === 'draft').length;
  const confirmed = d.assign.assignments.length - drafts;
  const slotById = new Map(d.slots.map((s) => [s.id, s]));
  const deptName = (id: number) => d.departments.find((x) => x.id === id)?.name ?? '';

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">ダッシュボード</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="希望入力"
          value={`${required.length - missing.length} / ${required.length}人`}
          sub={missing.length > 0 ? `未入力 ${missing.length}人` : '全員入力済み'}
          bad={missing.length > 0 && !open}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              希望入力の受付
              <Badge variant={open ? 'default' : 'secondary'}>
                {open ? '受付中' : '受付していません'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {fmt(d.period.opensAt)} 〜 {fmt(d.period.closesAt)}
            </p>
            {missing.length > 0 && (
              <>
                <p className="font-medium">未入力の人（{missing.length}人）</p>
                <ul className="flex flex-wrap gap-2">
                  {missing.slice(0, 20).map((u) => (
                    <li key={u.userId}>
                      <Link
                        className="rounded border px-2 py-0.5 hover:bg-accent"
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
                  return (
                    <li key={s.slotId} className="flex justify-between gap-2">
                      <span>{slot && `${deptName(slot.departmentId)} ${hm(slot.startsAt)}`}</span>
                      <Badge variant="destructive">あと{s.missing}人</Badge>
                    </li>
                  );
                })}
                {d.assign.shortages.length > 8 && (
                  <li className="text-muted-foreground">ほか {d.assign.shortages.length - 8}枠</li>
                )}
              </ul>
            )}
            <p className="text-muted-foreground">
              {d.run
                ? `最終実行: ${fmt(d.run.finishedAt ?? d.run.startedAt)}（${d.run.status === 'done' ? '完了' : d.run.status === 'running' ? '実行中' : '失敗'}）`
                : '自動割り当ては未実行です。'}
            </p>
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
              <span className="text-muted-foreground shrink-0">{fmt(r.createdAt)}</span>
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
