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
import { useConfirm } from '@/components/ConfirmDialog';
import { ErrorAlert, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const confirm = useConfirm();
  const { run, pending, error } = useAction();
  const [opens, setOpens] = useState(toLocal(period.opensAt));
  const [closes, setCloses] = useState(toLocal(period.closesAt));
  const [localError, setLocalError] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [deptParam, setDept] = useQueryParam('dept');
  const phase = phaseOf(period, Date.now());

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
  async function closeNow() {
    const ok = await confirm({
      title: '今すぐ締め切りますか？',
      description: '締切を現在時刻に変更します。以降、一般ユーザーは希望を編集できません。',
      confirmLabel: '締め切る',
      destructive: true,
    });
    if (ok)
      await savePeriod(
        { opensAt: period.opensAt, closesAt: new Date().toISOString() },
        '締め切りました',
      );
  }
  const extend = (hours: number) => {
    const base = Math.max(Date.now(), period.closesAt ? new Date(period.closesAt).getTime() : 0);
    return savePeriod(
      { opensAt: period.opensAt, closesAt: new Date(base + hours * 3_600_000).toISOString() },
      `締切を ${hours} 時間延長しました`,
    );
  };

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

  async function copyMissing(kind: 'email' | 'name') {
    const text = missing
      .map((s) => (kind === 'email' ? s.email : s.name))
      .join(kind === 'email' ? '; ' : '\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        `未入力の${missing.length}人の${kind === 'email' ? 'メールアドレス' : '名前'}をコピーしました`,
      );
    } catch {
      toast.error('コピーできませんでした。ブラウザの権限を確認してください');
    }
  }

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">希望入力の受付・状況</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            全体の受付期間（既定）
            <Badge variant={phase === 'open' ? 'default' : 'secondary'}>{PHASE_LABEL[phase]}</Badge>
          </CardTitle>
          <CardDescription>
            開始と締切の両方を設定すると受付が始まります。部門・持ち場に個別の設定がなければ、この期間が使われます。締切後、一般ユーザーは編集できません（管理者は常に編集可）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
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
          {phase !== 'unset' && (
            <div className="flex flex-wrap gap-2">
              {phase === 'open' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => void closeNow()}
                >
                  今すぐ締め切る
                </Button>
              )}
              {(phase === 'open' || phase === 'closed') && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void extend(24)}
                  >
                    締切を24時間延長
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void extend(72)}
                  >
                    締切を3日延長
                  </Button>
                </>
              )}
            </div>
          )}
          {(localError || error) && <ErrorAlert>{localError || error}</ErrorAlert>}
          <p className="text-muted-foreground text-xs">
            現在の設定: {fmtDateTime(period.opensAt)} 〜 {fmtDateTime(period.closesAt)}
          </p>
        </CardContent>
      </Card>

      <ScopeSettings
        data={scopes}
        departments={departments}
        posts={posts}
        onChanged={() => void revalidate()}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          入力状況: {submitted} / {required.length} 人が保存済み
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={deptParam ?? 'all'} onValueChange={(v) => setDept(v === 'all' ? null : v)}>
            <SelectTrigger className="w-40" aria-label="部門で絞り込み">
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">催促に使う（Teams などに貼り付け）:</span>
          <Button size="sm" variant="outline" onClick={() => void copyMissing('email')}>
            <Copy className="size-4" aria-hidden />
            未入力 {missing.length} 人のメールをコピー
          </Button>
          <Button size="sm" variant="outline" onClick={() => void copyMissing('name')}>
            <Copy className="size-4" aria-hidden />
            名前をコピー
          </Button>
        </div>
      )}
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>氏名</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>状況</TableHead>
              <TableHead>最終保存</TableHead>
              <TableHead>入力数</TableHead>
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
                <TableCell>{fmtDateTime(s.submittedAt, '')}</TableCell>
                <TableCell>{s.entryCount}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/admin/users/${s.userId}/availability`}>代理入力</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-center">
                  該当する人はいません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Page>
  );
}
