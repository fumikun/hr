import { Fragment, useEffect, useMemo, useState } from 'react';
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
import { AssignTimetable, SlotPanel } from '@/components/AssignTimetable';
import { useConfirm } from '@/components/ConfirmDialog';
import { ErrorAlert, Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dateKey, fmtDateTime, hoursLabel, md, mdRange, minutesBetween } from '@/lib/datetime';
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
/** 自動割り当ての計算時間の上限（秒）。管理者が選ぶ根拠がないので固定にする */
const RUN_LIMIT_SECONDS = 60;

const PHASE: Record<string, string> = {
  queued: '準備中',
  loading: 'データを読み込み中',
  solving: '最適な割り当てを計算中',
  saving: '結果を保存中',
};

function RunPanel({ run, onFinished }: { run: AssignRun | null; onFinished: () => void }) {
  const confirm = useConfirm();
  const [current, setCurrent] = useState(run);
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
        'ピン留めされていない現在の未公開の割り当て（前回の自動割り当てなど）は置き換えられます。ピン留めした割り当てと公開済みの割り当ては維持されます。',
      confirmLabel: '実行する',
    });
    if (!ok) return;
    await act(() => assignApi.run(RUN_LIMIT_SECONDS), { onSuccess: setCurrent });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>① 自動割り当て</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          className="w-full sm:w-fit"
          disabled={running || pending}
          onClick={() => void start()}
        >
          {running ? '実行中…' : '自動割り当てを実行'}
        </Button>
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
        description: 'それでも追加しますか？（追加するとピン留めされます）',
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
      title: `未公開 ${drafts} 件を公開しますか？`,
      description:
        '公開すると、一般ユーザーが「自分のシフト」で見られるようになります。公開後も「公開を解除」で未公開に戻せます。',
      confirmLabel: '公開',
      content:
        assign.shortages.length > 0 || assign.violations.length > 0 ? (
          <Notice kind="warning" title="未解決の項目があります">
            {assign.violations.length > 0 && <p>要確認 {assign.violations.length} 件</p>}
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
      await run(confirmApi.confirm, { success: 'シフトを公開しました', onSuccess: onChanged });
  }
  async function unpublish() {
    const ok = await confirm({
      title: '公開を解除しますか？',
      description: '一般ユーザーからシフトが見えなくなります。',
      confirmLabel: '公開を解除',
      destructive: true,
    });
    if (ok)
      await run(confirmApi.unconfirm, { success: '公開を解除しました', onSuccess: onChanged });
  }

  return (
    <div className="bg-background sticky bottom-0 z-20 -mx-4 space-y-2 border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:py-3">
      {confirmed > 0 && drafts > 0 && (
        <Notice kind="warning">未公開の変更が {drafts} 件あります。</Notice>
      )}
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {/* スマホでは2行（状況／ボタン）に収め、画面を覆う高さを抑える */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={assign.shortages.length > 0 ? 'destructive' : 'secondary'}>
          不足 {assign.shortages.length} 枠（{shortagePeople}人）
        </Badge>
        <Badge variant={assign.violations.length > 0 ? 'destructive' : 'secondary'}>
          警告 {assign.violations.length} 件
        </Badge>
        <span className="text-muted-foreground text-xs sm:text-sm">公開済み {confirmed}</span>
        <div className="grid w-full grid-cols-[auto_1fr] gap-2 sm:ml-auto sm:flex sm:w-auto">
          <Button
            variant="outline"
            disabled={confirmed === 0 || pending}
            onClick={() => void unpublish()}
          >
            公開を解除
          </Button>
          <Button disabled={drafts === 0 || pending} onClick={() => void publish()}>
            ② 未公開 {drafts} 件を公開
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
  const [adding, setAdding] = useState<number | null>(null);
  const [personQuery, setPersonQuery] = useState('');
  const [shortOnly, setShortOnly] = useState(false);
  const [openPerson, setOpenPerson] = useState<number | null>(null);

  const view = viewParam === 'people' ? 'people' : 'slots';
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

  const daySlots = deptSlots.filter((x) => dateKey(x.startsAt) === currentDay);

  const [selected, setSelected] = useState<number | null>(null);
  const selectedSlot = selected === null ? null : (slotById.get(selected) ?? null);
  const shortSlots = slots
    .filter((x) => missingOf(x.id) > 0)
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.id - y.id);
  // 次の不足へ: 選んでいる枠より後ろの不足から順に。最後まで行ったら先頭に戻る
  function gotoNextShortage() {
    if (shortSlots.length === 0) return;
    const cur = selectedSlot;
    const next =
      shortSlots.find(
        (x) => cur && (x.startsAt > cur.startsAt || (x.startsAt === cur.startsAt && x.id > cur.id)),
      ) ?? shortSlots[0]!;
    setQuery({ dept: String(next.departmentId), day: dateKey(next.startsAt) });
    setSelected(next.id);
  }

  async function addTo(userId: number, slotId: number) {
    setAssign((prev) => withPair(prev, slots, userId, slotId));
    const res = await act(() => assignApi.add(userId, slotId), {
      onSuccess: (r) => {
        if (r.warnings.length > 0)
          toast.warning(
            `追加しました（要確認: ${r.warnings.map((w) => REASON[w.reason]).join('、')}）`,
          );
      },
    });
    reconcile();
    return res.ok;
  }

  /** 別の枠へ移す。先に移動先へ追加してから外すので、途中で失敗しても人が消えない */
  async function move(userId: number, from: number, to: number) {
    const name = userById.get(userId)?.name ?? '';
    if (!(await addTo(userId, to))) return;
    setAssign((prev) => withoutPair(prev, slots, userId, from));
    const res = await act(() => assignApi.remove(userId, from), {
      success: `${name}さんを移しました`,
    });
    if (!res.ok) reconcile();
    setSelected(to);
  }

  const addingSlot = adding === null ? null : (slotById.get(adding) ?? null);

  async function remove(userId: number, slotId: number) {
    const row = assign.assignments.find((a) => a.userId === userId && a.slotId === slotId);
    const name = userById.get(userId)?.name ?? '';
    if (row?.status === 'confirmed') {
      const ok = await confirm({
        title: `${name}さんを外しますか？`,
        description: 'この割り当ては公開済みです。外すと、本人の「自分のシフト」からも消えます。',
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
                .then(() => toast.success('元に戻しました（ピン留めとして追加）'))
                .catch((e: Error) => toast.error(e.message))
                .finally(reconcile);
            },
          },
        });
      },
    });
    if (!res.ok) reconcile(); // 失敗したら、サーバーの状態に戻す
  }

  const slotPanel = (slotId: number, compact = false) => {
    const slot = slotById.get(slotId);
    if (!slot) return null;
    return (
      <SlotPanel
        slot={slot}
        postName={posts.find((p) => p.id === slot.postId)?.name ?? ''}
        assigned={assign.assignments.filter((x) => x.slotId === slot.id).map((x) => x.userId)}
        users={users}
        missing={missingOf(slot.id)}
        disabled={pending}
        onAdd={(u) => void addTo(u, slot.id)}
        onPick={() => setAdding(slot.id)}
        compact={compact}
      />
    );
  };

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
            <TabsList className="h-auto! w-full flex-wrap justify-start gap-1">
              {departments.map((d) => {
                const n = shortOf((s) => s.departmentId === d.id);
                return (
                  <TabsTrigger key={d.id} value={String(d.id)} className="h-8 flex-none gap-1.5">
                    {d.name}
                    {n > 0 && <Badge variant="destructive">不足 {n}</Badge>}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={currentDay} onValueChange={setDay} className="max-w-full min-w-0">
              <TabsList className="h-auto! w-full flex-wrap justify-start gap-1">
                {days.map((d) => {
                  const n = shortOf((s) => s.departmentId === deptId && dateKey(s.startsAt) === d);
                  return (
                    <TabsTrigger key={d} value={d} className="h-8 flex-none gap-1.5">
                      {md(d)}
                      {n > 0 && <Badge variant="destructive">不足 {n}</Badge>}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            {shortSlots.length > 0 && (
              <Button size="sm" variant="outline" onClick={gotoNextShortage}>
                次の不足へ →（残り {shortSlots.length} 枠）
              </Button>
            )}
          </div>
          {days.length === 0 && <Notice kind="info">この部門にはまだ枠がありません。</Notice>}
          {daySlots.length > 0 && (
            <AssignTimetable
              posts={deptPosts}
              slots={daySlots}
              assignments={assign.assignments}
              userById={userById}
              missingOf={missingOf}
              warningsOf={(u, sid) => violationsOf(u, sid).map((v) => REASON[v.reason])}
              selected={selected}
              disabled={pending}
              onSelect={setSelected}
              onMove={(u, from, to) => void move(u, from, to)}
              onRemove={(u, sid) => void remove(u, sid)}
              renderPanel={slotPanel}
              onToggleLock={(a) => {
                setAssign((prev) => withLock(prev, a.userId, a.slotId, !a.locked));
                void act(() => assignApi.setLocked(a.userId, a.slotId, !a.locked)).then(
                  (r) => !r.ok && reconcile(),
                );
              }}
            />
          )}
          {/* スマホでは一覧の中（選んだ枠の下）に出すので、ここでは sm 以上だけ */}
          {selectedSlot && selectedSlot.departmentId === deptId && (
            <div className="hidden sm:block">{slotPanel(selectedSlot.id)}</div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="名前・メールで検索"
              value={personQuery}
              onChange={(e) => setPersonQuery(e.target.value)}
              className="w-full sm:max-w-xs"
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
                  <th className="hidden p-2 sm:table-cell">目標</th>
                  <th className="hidden p-2 sm:table-cell">上限</th>
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
                    <Fragment key={u.id}>
                      <tr
                        className="hover:bg-accent/50 cursor-pointer border-b"
                        onClick={() => setOpenPerson(open ? null : u.id)}
                      >
                        <td className="p-2">{u.name}</td>
                        <td className="p-2">
                          {hoursLabel(m)}（{mine.length}枠）
                          <span className="text-muted-foreground block text-xs sm:hidden">
                            目標 {u.targetMinutes === null ? '-' : hoursLabel(u.targetMinutes)}
                            ／上限 {u.maxMinutes === null ? '-' : hoursLabel(u.maxMinutes)}
                          </span>
                        </td>
                        <td className="hidden p-2 sm:table-cell">
                          {u.targetMinutes === null ? '-' : hoursLabel(u.targetMinutes)}
                        </td>
                        <td className="hidden p-2 sm:table-cell">
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
                    </Fragment>
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
