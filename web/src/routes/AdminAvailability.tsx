import { Copy } from 'lucide-react';
import { useState } from 'react';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import {
  periodApi,
  type AdminUser,
  type Department,
  type InputStatus,
  type Period,
  type Post,
  type ScopesData,
} from '../api';
import { ScopeSettings } from '@/components/ScopeSettings';
import { ErrorAlert, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListRow, MobileList } from '@/components/ListRow';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtDateTime, pad } from '@/lib/datetime';
import { useAction } from '@/lib/useAction';
import { useQueryParam } from '@/lib/useQueryParam';

export type AdminAvailabilityData = {
  period: Period;
  status: InputStatus[];
  users: AdminUser[];
  departments: Department[];
  posts: Post[];
  scopes: ScopesData;
};

// ISO → <input type="datetime-local"> の値（ローカル時刻）
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

type Phase = 'unset' | 'before' | 'open' | 'closed';
const phaseOf = (p: Period, now: number): Phase =>
  !p.opensAt || !p.closesAt
    ? 'unset'
    : now < new Date(p.opensAt).getTime()
      ? 'before'
      : now < new Date(p.closesAt).getTime()
        ? 'open'
        : 'closed';
const PHASE_LABEL: Record<Phase, string> = {
  unset: '未設定',
  before: '受付前',
  open: '受付中',
  closed: '締切後',
};

export function AdminAvailability() {
  const { period, status, users, departments, posts, scopes } =
    useLoaderData<AdminAvailabilityData>();
  const { revalidate } = useRevalidator();
  const { run, pending, error } = useAction();
  const [opens, setOpens] = useState(toLocal(period.opensAt));
  const [closes, setCloses] = useState(toLocal(period.closesAt));
  const [localError, setLocalError] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [deptParam, setDept] = useQueryParam('dept');
  const phase = phaseOf(period, Date.now());
  // 受付期間が決まるまでは設定を、決まったあとは入力状況を最初に見せる
  const defaultTab = phase === 'unset' ? 'settings' : 'status';
  const [tabParam, setTab] = useQueryParam('tab');
  const tab = tabParam === 'settings' || tabParam === 'status' ? tabParam : defaultTab;

  const savePeriod = (next: Period, success: string) =>
    run(() => periodApi.put(next), {
      success,
      onSuccess: (p) => {
        setOpens(toLocal(p.opensAt));
        setCloses(toLocal(p.closesAt));
        void revalidate();
      },
    });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (opens && closes && closes <= opens) return setLocalError('締切は開始より後にしてください');
    setLocalError('');
    void savePeriod(
      { opensAt: fromLocal(opens), closesAt: fromLocal(closes) },
      '受付期間を保存しました',
    );
  }
  const dept = deptParam ? Number(deptParam) : null;
  const memberIds = new Set(
    users
      .filter((u) => dept === null || u.roles.some((r) => r.departmentId === dept))
      .map((u) => u.id),
  );
  const required = status.filter((s) => s.required && memberIds.has(s.userId));
  const submitted = required.filter((s) => s.submittedAt).length;
  const rows = onlyMissing ? required.filter((s) => !s.submittedAt) : required;
  const missing = required.filter((s) => !s.submittedAt);

  // 名前とメールを1行ずつ（そのまま Teams などに貼れる形）
  async function copyMissing() {
    const text = missing.map((s) => `${s.name} <${s.email}>`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`未入力の${missing.length}人をコピーしました`);
    } catch {
      toast.error('コピーできませんでした。ブラウザの権限を確認してください');
    }
  }

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">希望入力の受付・状況</h1>
      {/* スマホで1画面が長くなりすぎないよう、よく見る「入力状況」と、たまに変える「設定」を分ける */}
      <Tabs value={tab} onValueChange={(v) => setTab(v === defaultTab ? null : v)}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="status">
            入力状況（{submitted}/{required.length}）
          </TabsTrigger>
          <TabsTrigger value="settings">受付期間・日程</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'settings' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                全体の受付期間（既定）
                <Badge variant={phase === 'open' ? 'default' : 'secondary'}>
                  {PHASE_LABEL[phase]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form className="grid gap-3 sm:flex sm:flex-wrap sm:items-end" onSubmit={submit}>
                <div className="grid gap-1.5">
                  <Label htmlFor="opens">開始</Label>
                  <Input
                    id="opens"
                    type="datetime-local"
                    value={opens}
                    onChange={(e) => setOpens(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="closes">締切</Label>
                  <Input
                    id="closes"
                    type="datetime-local"
                    value={closes}
                    onChange={(e) => setCloses(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={pending}>
                  {pending ? '保存中…' : '保存'}
                </Button>
              </form>
              {(localError || error) && <ErrorAlert>{localError || error}</ErrorAlert>}
            </CardContent>
          </Card>

          <ScopeSettings
            data={scopes}
            departments={departments}
            posts={posts}
            onChanged={() => void revalidate()}
          />
        </>
      )}

      {tab === 'status' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <Select
                value={deptParam ?? 'all'}
                onValueChange={(v) => setDept(v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-40" aria-label="部門で絞り込み">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての部門</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="missing"
                  checked={onlyMissing}
                  onCheckedChange={(v) => setOnlyMissing(v === true)}
                />
                <Label htmlFor="missing">未入力の人だけ表示</Label>
              </div>
            </div>
          </div>
          {missing.length > 0 && (
            <Button
              variant="outline"
              className="w-full sm:w-fit"
              onClick={() => void copyMissing()}
            >
              <Copy className="size-4" aria-hidden />
              未入力 {missing.length} 人の名前とメールをコピー
            </Button>
          )}
          {rows.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">該当する人はいません</p>
          )}
          {/* スマホ: 1人1行。押すと代理入力へ */}
          <MobileList>
            {rows.map((s) => (
              <ListRow
                key={s.userId}
                title={s.name}
                badge={
                  s.submittedAt ? (
                    <Badge>保存済み</Badge>
                  ) : (
                    <Badge variant="destructive">未入力</Badge>
                  )
                }
                sub={s.submittedAt ? `最終保存 ${fmtDateTime(s.submittedAt)}` : s.email}
                to={`/admin/users/${s.userId}/availability`}
              />
            ))}
          </MobileList>
          {rows.length > 0 && (
            <div className="bg-card hidden rounded-lg border sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>氏名</TableHead>
                    <TableHead>メール</TableHead>
                    <TableHead>状況</TableHead>
                    <TableHead>最終保存</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.userId}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.email}</TableCell>
                      <TableCell>
                        {s.submittedAt ? (
                          <Badge>保存済み</Badge>
                        ) : (
                          <Badge variant="destructive">未入力</Badge>
                        )}
                      </TableCell>
                      <TableCell>{fmtDateTime(s.submittedAt, '—')}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/admin/users/${s.userId}/availability`}>代理入力</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
