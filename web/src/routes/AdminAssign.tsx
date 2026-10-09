import { Lock, LockOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import {
  assignApi,
  candidatesApi,
  confirmApi,
  type AdminUser,
  type AssignData,
  type AssignRun,
  type Candidate,
  type Department,
  type Post,
  type Slot,
  type ViolationReason,
} from '../api';
import { useConfirm } from '@/components/ConfirmDialog';
import { ErrorAlert, Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dateKey, fmtDateTime, hm, hoursLabel, md, mdRange, minutesBetween } from '@/lib/datetime';
import { withLock, withoutPair, withPair } from '@/lib/assignLocal';
import { useAction } from '@/lib/useAction';
import { useQueryParam, useSetQueryParams } from '@/lib/useQueryParam';
import { cn } from '@/lib/utils';

export type AdminAssignData = {
  departments: Department[];
  posts: Post[];
  slots: Slot[];
  users: AdminUser[];
  assign: AssignData;
  run: AssignRun | null;
};

const REASON: Record<ViolationReason, string> = {
  unavailable: '入れない時間帯',
  double_booked: '時間が重複',
  not_in_department: '部門外',
  post_restricted: '持ち場の対象外',
  over_capacity: '定員超過',
};
const PHASE: Record<string, string> = {
  queued: '準備中',
  loading: 'データを読み込み中',
  solving: '最適な割り当てを計算中',
  saving: '結果を保存中',
};

function RunPanel({ run, onFinished }: { run: AssignRun | null; onFinished: () => void }) {
  const confirm = useConfirm();
  const [current, setCurrent] = useState(run);
  const [limit, setLimit] = useState('60');
  const [now, setNow] = useState(Date.now());
  const { run: act, pending, error } = useAction();
  const running = current?.status === 'running';

  // 実行中は1秒ごとに状況を確認し、終わったら画面のデータを更新する
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void assignApi.latestRun().then((r) => {
        setCurrent(r);
        if (r && r.status !== 'running') {
          onFinished();
          if (r.status === 'done') toast.success('自動割り当てが完了しました');
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, onFinished]);

  async function start() {
    const ok = await confirm({
      title: '自動割り当てを実行しますか？',
      description:
        '固定されていない現在の下書き（前回の自動割り当てなど）は置き換えられます。固定した割り当てと確定済みの割り当ては維持されます。',
      confirmLabel: '実行する',
    });
    if (!ok) return;
    await act(() => assignApi.run(Number(limit)), { onSuccess: setCurrent });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>① 自動割り当て</CardTitle>
        <CardDescription>
          希望入力（入れない時間帯・入りたい時間帯）、持ち場の対象者、目標/上限の勤務時間をもとに案を作ります。条件を満たせない枠は止まらずに「不足」として出ます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="limit">計算時間の上限</Label>
            <Select value={limit} onValueChange={setLimit} disabled={running}>
              <SelectTrigger id="limit" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[30, 60, 120, 300].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}秒
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={running || pending} onClick={() => void start()}>
            {running ? '実行中…' : '自動割り当てを実行'}
          </Button>
        </div>
        {running && current && (
          <p className="text-sm" role="status">
            {PHASE[current.phase] ?? current.phase}… 経過{' '}
            {Math.max(0, Math.round((now - new Date(current.startedAt).getTime()) / 1000))} 秒
          </p>
        )}
        {current?.status === 'done' && current.result && (
          <p className="text-muted-foreground text-sm">
            前回の実行: {fmtDateTime(current.finishedAt ?? current.startedAt)} ／{' '}
            {current.result.assigned} 件を割り当て
            {current.result.solverStatus !== 'Optimal' && '（時間切れのため最良の解）'}
          </p>
        )}
        {current?.status === 'failed' && (
          <ErrorAlert>前回の実行は失敗しました: {current.error}</ErrorAlert>
        )}
        {error && <ErrorAlert>{error}</ErrorAlert>}
      </CardContent>
    </Card>
  );
}

/** 人を追加するダイアログ。追加しても閉じず、必要人数に達するまで続けて選べる */
function AddDialog({
  slot,
  users,
  assigned,
  onClose,
  onChanged,
}: {
  slot: Slot | null;
  users: AdminUser[];
  /** この枠に現在割り当てられている人（画面のデータが更新されるたびに変わる） */
  assigned: number[];
  onClose: () => void;
  onChanged: (userId: number) => void;
}) {
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState('');
  const confirm = useConfirm();
  const { run, error, clearError } = useAction();
  const [adding, setAdding] = useState<number | null>(null);
  const slotId = slot?.id;
  const assignedKey = assigned.join(',');

  useEffect(() => {
    if (slotId === undefined) return;
    void candidatesApi(slotId).then(setCands);
  }, [slotId, assignedKey]);
  useEffect(() => {
    setQuery('');
    clearError();
  }, [slotId, clearError]);

  const rows = useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u]));
    return (
      (cands ?? [])
        .map((c) => ({ ...c, user: byId.get(c.userId)! }))
        .filter((c) => c.user && (c.user.name.includes(query) || c.user.email.includes(query)))
        // 入れる人（警告なし）→ 入りたい人を先頭 → 勤務時間が少ない人
        .sort(
          (a, b) =>
            a.reasons.length - b.reasons.length ||
            Number(b.wants) - Number(a.wants) ||
            a.assignedMinutes - b.assignedMinutes,
        )
    );
  }, [cands, users, query]);

  async function add(userId: number, warn: boolean) {
    if (
      warn &&
      !(await confirm({
        title: '警告があります',
        description: 'それでも追加しますか？（追加すると固定されます）',
        confirmLabel: '追加する',
      }))
    )
      return;
    setAdding(userId);
    await run(() => assignApi.add(userId, slot!.id), {
      onSuccess: (res) => {
        if (res.warnings.length > 0)
          toast.warning(
            `追加しました（警告: ${res.warnings.map((w) => REASON[w.reason]).join('、')}）`,
          );
        else toast.success('追加しました');
        onChanged(userId);
      },
    });
    setAdding(null);
  }

  const need = slot ? Math.max(0, slot.minPeople - assigned.length) : 0;
  return (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>人を追加</DialogTitle>
          <DialogDescription>
            {slot && mdRange(slot.startsAt, slot.endsAt)} 現在 {assigned.length}/{slot?.minPeople}〜
            {slot?.maxPeople}人{need > 0 ? `（あと ${need} 人必要）` : '（必要人数に達しました）'}
            。手動で追加した人は「固定」され、再実行しても維持されます。
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="名前・メールで絞り込み"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <ErrorAlert>{error}</ErrorAlert>}
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {cands === null && <li className="text-muted-foreground text-sm">読み込み中…</li>}
          {rows.map((c) => (
            <li key={c.userId}>
              <button
                type="button"
                disabled={adding !== null}
                className={cn(
                  'hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50',
                  c.reasons.length > 0 && 'border-red-200 bg-red-50/50',
                )}
                onClick={() => void add(c.userId, c.reasons.length > 0)}
              >
                <span>
                  {c.user.name}
                  <span className="text-muted-foreground ml-2 text-xs">
                    現在 {hoursLabel(c.assignedMinutes)}
                    {c.user.targetMinutes !== null && ` / 目標 ${hoursLabel(c.user.targetMinutes)}`}
                  </span>
                </span>
                <span className="flex flex-wrap justify-end gap-1">
                  {c.wants && <Badge>入りたい</Badge>}
                  {c.reasons.map((r) => (
                    <Badge key={r} variant="destructive">
                      {REASON[r]}
                    </Badge>
                  ))}
                </span>
              </button>
            </li>
          ))}
          {cands !== null && rows.length === 0 && (
            <li className="text-muted-foreground text-sm">該当する人がいません</li>
          )}
        </ul>
        <Button variant="outline" onClick={onClose}>
          閉じる
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** 画面下に固定する、不足・警告・確定のバー */
function PublishBar({
  assign,
  slots,
  deptName,
  onChanged,
}: {
  assign: AssignData;
  slots: Slot[];
  deptName: (id: number) => string;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const { run, pending, error } = useAction();
  const drafts = assign.assignments.filter((a) => a.status === 'draft').length;
  const confirmed = assign.assignments.length - drafts;
  const shortagePeople = assign.shortages.reduce((n, s) => n + s.missing, 0);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  async function publish() {
    const ok = await confirm({
      title: `下書き ${drafts} 件を確定して公開しますか？`,
      description:
        '確定すると、一般ユーザーが「自分のシフト」で見られるようになります。確定後も「確定を解除」で下書きに戻せます。',
      confirmLabel: '確定して公開',
      content:
        assign.shortages.length > 0 || assign.violations.length > 0 ? (
          <Notice kind="warning" title="未解決の項目があります">
            {assign.violations.length > 0 && <p>制約違反の警告 {assign.violations.length} 件</p>}
            {assign.shortages.length > 0 && (
              <>
                <p>
                  不足している枠 {assign.shortages.length} 件（計 {shortagePeople} 人）
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {assign.shortages.slice(0, 8).map((s) => {
                    const slot = slotById.get(s.slotId);
                    return (
                      <li key={s.slotId}>
                        {slot &&
                          `${deptName(slot.departmentId)} ${mdRange(slot.startsAt, slot.endsAt)}`}
                        あと{s.missing}人
                      </li>
                    );
                  })}
                  {assign.shortages.length > 8 && <li>ほか {assign.shortages.length - 8} 件</li>}
                </ul>
              </>
            )}
          </Notice>
        ) : undefined,
    });
    if (ok)
      await run(confirmApi.confirm, { success: 'シフトを確定しました', onSuccess: onChanged });
  }
  async function unpublish() {
    const ok = await confirm({
      title: '確定を解除しますか？',
      description: '一般ユーザーからシフトが見えなくなります。',
      confirmLabel: '確定を解除',
      destructive: true,
    });
    if (ok)
      await run(confirmApi.unconfirm, { success: '確定を解除しました', onSuccess: onChanged });
  }

  return (
    <div className="bg-background sticky bottom-0 z-20 -mx-4 space-y-2 border-t px-4 py-3">
      {confirmed > 0 && drafts > 0 && (
        <Notice kind="warning">
          公開済みのシフトに対して、まだ公開していない変更が {drafts}{' '}
          件あります。確定すると反映されます。
        </Notice>
      )}
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={assign.shortages.length > 0 ? 'destructive' : 'secondary'}>
          不足 {assign.shortages.length} 枠（{shortagePeople}人）
        </Badge>
        <Badge variant={assign.violations.length > 0 ? 'destructive' : 'secondary'}>
          警告 {assign.violations.length} 件
        </Badge>
        <span className="text-muted-foreground text-sm">
          下書き {drafts} ／ 確定済み {confirmed}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            disabled={confirmed === 0 || pending}
            onClick={() => void unpublish()}
          >
            確定を解除
          </Button>
          <Button disabled={drafts === 0 || pending} onClick={() => void publish()}>
            ② 下書きを確定して公開
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AdminAssign() {
  const {
    departments,
    posts,
    slots: allSlots,
    users,
    assign: loaded,
    run,
  } = useLoaderData<AdminAssignData>();
  // 割り当ては操作のたびに画面全体を取り直さず、この画面の中で更新する（操作が即座に反映される）
  const [assign, setAssign] = useState(loaded);
  useEffect(() => setAssign(loaded), [loaded]);
  // 調整の対象日でない枠は、この画面には出さない
  const slots = useMemo(
    () => allSlots.filter((s) => !assign.excludedSlotIds.includes(s.id)),
    [allSlots, assign.excludedSlotIds],
  );
  const reconcile = () =>
    void assignApi
      .data()
      .then(setAssign)
      .catch((e: Error) => toast.error(e.message));
  const { revalidate } = useRevalidator();
  const confirm = useConfirm();
  const { run: act, pending, error } = useAction();
  const refresh = () => void revalidate();
  const [deptParam] = useQueryParam('dept');
  const [dayParam, setDay] = useQueryParam('day');
  const setQuery = useSetQueryParams();
  const [viewParam, setView] = useQueryParam('view');
  const [issuesParam, setIssues] = useQueryParam('issues');
  const [adding, setAdding] = useState<number | null>(null);
  const [personQuery, setPersonQuery] = useState('');
  const [shortOnly, setShortOnly] = useState(false);
  const [openPerson, setOpenPerson] = useState<number | null>(null);

  const view = viewParam === 'people' ? 'people' : 'slots';
  const issuesOnly = issuesParam === '1';
  const deptId = departments.find((d) => String(d.id) === deptParam)?.id ?? departments[0]?.id ?? 0;

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const deptName = (id: number) => departments.find((d) => d.id === id)?.name ?? '';
  const byUser = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const a of assign.assignments) m.set(a.userId, [...(m.get(a.userId) ?? []), a.slotId]);
    return m;
  }, [assign.assignments]);
  const minutesOf = (userId: number) =>
    (byUser.get(userId) ?? []).reduce((n, id) => {
      const s = slotById.get(id);
      return s ? n + minutesBetween(s.startsAt, s.endsAt) : n;
    }, 0);
  const violationsOf = (userId: number, slotId: number) =>
    assign.violations.filter((v) => v.userId === userId && v.slotId === slotId);
  const missingOf = (slotId: number) =>
    assign.shortages.find((s) => s.slotId === slotId)?.missing ?? 0;
  const hasIssue = (slotId: number) =>
    missingOf(slotId) > 0 || assign.violations.some((v) => v.slotId === slotId);

  const deptPosts = posts.filter((p) => p.departmentId === deptId);
  const deptSlots = slots.filter((s) => s.departmentId === deptId);
  const days = [...new Set(deptSlots.map((s) => dateKey(s.startsAt)))].sort();
  const currentDay = days.includes(dayParam ?? '') ? dayParam! : (days[0] ?? '');
  const shortOf = (pred: (s: Slot) => boolean) =>
    assign.shortages
      .filter((s) => {
        const slot = slotById.get(s.slotId);
        return slot && pred(slot);
      })
      .reduce((n, s) => n + s.missing, 0);

  const addingSlot = adding === null ? null : (slotById.get(adding) ?? null);

  async function remove(userId: number, slotId: number) {
    const row = assign.assignments.find((a) => a.userId === userId && a.slotId === slotId);
    const name = userById.get(userId)?.name ?? '';
    if (row?.status === 'confirmed') {
      const ok = await confirm({
        title: `${name}さんを外しますか？`,
        description:
          'この割り当ては確定済み（公開済み）です。外すと、本人の「自分のシフト」からも消えます。',
        confirmLabel: '外す',
        destructive: true,
      });
      if (!ok) return;
    }
    setAssign((prev) => withoutPair(prev, slots, userId, slotId));
    const res = await act(() => assignApi.remove(userId, slotId), {
      onSuccess: () => {
        toast(`${name}さんを外しました`, {
          action: {
            label: '元に戻す',
            onClick: () => {
              setAssign((prev) => withPair(prev, slots, userId, slotId));
              void assignApi
                .add(userId, slotId)
                .then(() => toast.success('元に戻しました（固定として追加）'))
                .catch((e: Error) => toast.error(e.message))
                .finally(reconcile);
            },
          },
        });
      },
    });
    if (!res.ok) reconcile(); // 失敗したら、サーバーの状態に戻す
  }

  const visiblePeople = users
    .filter((u) => u.name.includes(personQuery) || u.email.includes(personQuery))
    .filter((u) => !shortOnly || (u.targetMinutes !== null && minutesOf(u.id) < u.targetMinutes))
    .sort((a, b) => minutesOf(b.id) - minutesOf(a.id));

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">自動割り当て・手動修正</h1>
      <RunPanel run={run} onFinished={refresh} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">結果の確認と手動修正</h2>
        <Tabs value={view} onValueChange={(v) => setView(v === 'people' ? 'people' : null)}>
          <TabsList>
            <TabsTrigger value="slots">枠ごと</TabsTrigger>
            <TabsTrigger value="people">人ごと（勤務時間）</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}

      {view === 'slots' ? (
        <>
          <Tabs
            value={String(deptId)}
            onValueChange={(v) => {
              setQuery({ dept: v, day: null });
            }}
          >
            <TabsList className="h-auto flex-wrap justify-start">
              {departments.map((d) => {
                const n = shortOf((s) => s.departmentId === d.id);
                return (
                  <TabsTrigger key={d.id} value={String(d.id)} className="gap-1.5">
                    {d.name}
                    {n > 0 && <Badge variant="destructive">不足 {n}</Badge>}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={currentDay} onValueChange={setDay}>
              <TabsList className="h-auto flex-wrap justify-start">
                {days.map((d) => {
                  const n = shortOf((s) => s.departmentId === deptId && dateKey(s.startsAt) === d);
                  return (
                    <TabsTrigger key={d} value={d} className="gap-1.5">
                      {md(d)}
                      {n > 0 && <Badge variant="destructive">不足 {n}</Badge>}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Checkbox
                id="issues"
                checked={issuesOnly}
                onCheckedChange={(v) => setIssues(v === true ? '1' : null)}
              />
              <Label htmlFor="issues">不足・警告のある枠だけ表示</Label>
            </div>
          </div>
          {days.length === 0 && (
            <Notice kind="info">
              この部門にはまだ枠がありません。「枠・持ち場」で作成してください。
            </Notice>
          )}
          {deptPosts.map((post) => {
            const row = deptSlots
              .filter((s) => s.postId === post.id && dateKey(s.startsAt) === currentDay)
              .filter((s) => !issuesOnly || hasIssue(s.id))
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            if (row.length === 0) return null;
            return (
              <section key={post.id} className="space-y-2">
                <h3 className="font-semibold">
                  {post.name}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {post.restricted ? `限定 ${post.memberIds.length}人` : '部門の誰でも'}
                  </span>
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {row.map((s) => {
                    const people = assign.assignments.filter((a) => a.slotId === s.id);
                    const missing = missingOf(s.id);
                    return (
                      <Card
                        key={s.id}
                        className={cn('gap-2 py-3', missing > 0 && 'border-red-400')}
                      >
                        <CardHeader className="px-4">
                          <CardTitle className="flex items-center justify-between text-base">
                            <span>
                              {hm(s.startsAt)}–{hm(s.endsAt)}
                            </span>
                            <span className="text-muted-foreground text-xs font-normal">
                              {people.length}/{s.minPeople}〜{s.maxPeople}人
                            </span>
                          </CardTitle>
                          {missing > 0 && (
                            <Badge variant="destructive" className="w-fit">
                              ⚠ あと {missing} 人必要
                            </Badge>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-2 px-4">
                          <ul className="space-y-1">
                            {people.map((a) => {
                              const vs = violationsOf(a.userId, s.id);
                              const name = userById.get(a.userId)?.name ?? '?';
                              return (
                                <li
                                  key={a.userId}
                                  className={cn(
                                    'flex items-center justify-between gap-1 rounded border px-2 py-1 text-sm',
                                    vs.length > 0 && 'border-red-300 bg-red-50',
                                  )}
                                >
                                  <span className="min-w-0">
                                    <span className="truncate">{name}</span>
                                    {a.status === 'confirmed' && (
                                      <Badge variant="secondary" className="ml-1">
                                        確定
                                      </Badge>
                                    )}
                                    {a.source === 'manual' && (
                                      <span className="text-muted-foreground ml-1 text-xs">
                                        手動
                                      </span>
                                    )}
                                    {vs.map((v) => (
                                      <Badge key={v.reason} variant="destructive" className="ml-1">
                                        ⚠ {REASON[v.reason]}
                                      </Badge>
                                    ))}
                                  </span>
                                  <span className="flex shrink-0 items-center gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn('size-7', a.locked && 'text-amber-600')}
                                      aria-pressed={a.locked}
                                      aria-label={
                                        a.locked
                                          ? `${name}さんの固定を解除`
                                          : `${name}さんを固定（再実行しても動かさない）`
                                      }
                                      title={
                                        a.locked
                                          ? '固定中：再実行しても動きません（クリックで解除）'
                                          : 'クリックで固定：再実行しても動かさない'
                                      }
                                      disabled={pending}
                                      onClick={() => {
                                        setAssign((prev) =>
                                          withLock(prev, a.userId, s.id, !a.locked),
                                        );
                                        void act(() =>
                                          assignApi.setLocked(a.userId, s.id, !a.locked),
                                        ).then((r) => !r.ok && reconcile());
                                      }}
                                    >
                                      {a.locked ? (
                                        <Lock className="size-4" />
                                      ) : (
                                        <LockOpen className="size-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="hover:text-destructive size-7"
                                      aria-label={`${name}さんを外す`}
                                      disabled={pending}
                                      onClick={() => void remove(a.userId, s.id)}
                                    >
                                      ×
                                    </Button>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                          <Button size="sm" variant="outline" onClick={() => setAdding(s.id)}>
                            ＋ 人を追加
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {issuesOnly &&
            currentDay &&
            !deptSlots.some((s) => dateKey(s.startsAt) === currentDay && hasIssue(s.id)) && (
              <Notice kind="info">この日に不足・警告のある枠はありません。</Notice>
            )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="名前・メールで検索"
              value={personQuery}
              onChange={(e) => setPersonQuery(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="short"
                checked={shortOnly}
                onCheckedChange={(v) => setShortOnly(v === true)}
              />
              <Label htmlFor="short">目標に届いていない人だけ（不足枠の候補）</Label>
            </div>
          </div>
          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">氏名</th>
                  <th className="p-2">割り当て</th>
                  <th className="p-2">目標</th>
                  <th className="p-2">上限</th>
                  <th className="p-2">状況</th>
                </tr>
              </thead>
              <tbody>
                {visiblePeople.map((u) => {
                  const m = minutesOf(u.id);
                  const over = u.maxMinutes !== null && m > u.maxMinutes;
                  const diff = u.targetMinutes === null ? null : m - u.targetMinutes;
                  const mine = (byUser.get(u.id) ?? [])
                    .map((id) => slotById.get(id))
                    .filter((s): s is Slot => !!s)
                    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
                  const open = openPerson === u.id;
                  return (
                    <>
                      <tr
                        key={u.id}
                        className="hover:bg-accent/50 cursor-pointer border-b"
                        onClick={() => setOpenPerson(open ? null : u.id)}
                      >
                        <td className="p-2">{u.name}</td>
                        <td className="p-2">
                          {hoursLabel(m)}（{mine.length}枠）
                        </td>
                        <td className="p-2">
                          {u.targetMinutes === null ? '-' : hoursLabel(u.targetMinutes)}
                        </td>
                        <td className="p-2">
                          {u.maxMinutes === null ? '-' : hoursLabel(u.maxMinutes)}
                        </td>
                        <td className="p-2">
                          {over ? (
                            <Badge variant="destructive">⚠ 上限超過</Badge>
                          ) : diff === null ? null : diff === 0 ? (
                            <Badge variant="secondary">目標どおり</Badge>
                          ) : (
                            <Badge variant="outline">
                              目標より {hoursLabel(Math.abs(diff))} {diff < 0 ? '少ない' : '多い'}
                            </Badge>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${u.id}-detail`} className="bg-muted/30 border-b">
                          <td colSpan={5} className="p-3">
                            {mine.length === 0 ? (
                              <span className="text-muted-foreground">割り当てはありません。</span>
                            ) : (
                              <ul className="flex flex-wrap gap-2">
                                {mine.map((s) => (
                                  <li key={s.id} className="rounded border bg-white px-2 py-1">
                                    {mdRange(s.startsAt, s.endsAt)} {deptName(s.departmentId)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {visiblePeople.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground p-4 text-center">
                      該当する人はいません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AddDialog
        slot={addingSlot}
        users={users}
        assigned={
          addingSlot
            ? assign.assignments.filter((a) => a.slotId === addingSlot.id).map((a) => a.userId)
            : []
        }
        onClose={() => setAdding(null)}
        onChanged={(userId) => {
          if (addingSlot) setAssign((prev) => withPair(prev, slots, userId, addingSlot.id));
          reconcile(); // 警告などはサーバーの結果で確定する
        }}
      />
      <PublishBar assign={assign} slots={slots} deptName={deptName} onChanged={reconcile} />
    </Page>
  );
}
