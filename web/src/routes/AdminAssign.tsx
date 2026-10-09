import { useEffect, useMemo, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import {
  assignApi,
  candidatesApi,
  type AdminUser,
  type AssignData,
  type AssignRun,
  type AssignmentRow,
  type Candidate,
  type Department,
  type Post,
  type Slot,
  type ViolationReason,
} from '../api';
import { ErrorAlert, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type AdminAssignData = {
  departments: Department[];
  posts: Post[];
  slots: Slot[];
  users: AdminUser[];
  assign: AssignData;
  run: AssignRun | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const hours = (min: number) => `${Math.round((min / 60) * 10) / 10}h`;
const slotMinutes = (s: Slot) =>
  (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60_000;

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
  const [current, setCurrent] = useState(run);
  const [limit, setLimit] = useState(60);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
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
    if (
      !window.confirm(
        '自動割り当てを実行します。固定されていない現在の下書き（前回の自動割り当てなど）は置き換えられます。固定した割り当ては維持されます。',
      )
    )
      return;
    setError('');
    try {
      setCurrent(await assignApi.run(limit));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>自動割り当て</CardTitle>
        <CardDescription>
          希望入力（入れない時間帯・入りたい時間帯）、持ち場の対象者、目標/上限の勤務時間をもとに案を作ります。条件を満たせない枠は止まらずに「不足」として一覧に出ます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            計算時間の上限
            <select
              className="border-input h-9 rounded-md border bg-transparent px-2"
              value={limit}
              disabled={running}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[30, 60, 120, 300].map((s) => (
                <option key={s} value={s}>
                  {s}秒
                </option>
              ))}
            </select>
          </label>
          <Button disabled={running} onClick={() => void start()}>
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
          <p className="text-sm">
            前回の実行: {new Date(current.finishedAt ?? current.startedAt).toLocaleString('ja-JP')}{' '}
            ／ {current.result.assigned} 件を割り当て
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

function AddDialog({
  slot,
  users,
  onClose,
  onAdded,
}: {
  slot: Slot | null;
  users: AdminUser[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setCands(null);
    setQuery('');
    setError('');
    if (slot)
      void candidatesApi(slot.id)
        .then(setCands)
        .catch((e: Error) => setError(e.message));
  }, [slot]);

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
    if (warn && !window.confirm('警告があります。それでも追加しますか？')) return;
    try {
      const res = await assignApi.add(userId, slot!.id);
      if (res.warnings.length > 0)
        toast.warning(
          `追加しました（警告: ${res.warnings.map((w) => REASON[w.reason]).join('、')}）`,
        );
      else toast.success('追加しました');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>人を追加</DialogTitle>
          <DialogDescription>
            {slot && `${dateKey(slot.startsAt)} ${hm(slot.startsAt)}–${hm(slot.endsAt)}`}
            ：手動で追加した人は「固定」され、再実行しても維持されます。
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
                className={cn(
                  'hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm',
                  c.reasons.length > 0 && 'border-red-200 bg-red-50/50',
                )}
                onClick={() => void add(c.userId, c.reasons.length > 0)}
              >
                <span>
                  {c.user.name}
                  <span className="text-muted-foreground ml-2 text-xs">
                    現在 {hours(c.assignedMinutes)}
                    {c.user.targetMinutes !== null && ` / 目標 ${hours(c.user.targetMinutes)}`}
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
      </DialogContent>
    </Dialog>
  );
}

export function AdminAssign() {
  const { departments, posts, slots, users, assign, run } = useLoaderData<AdminAssignData>();
  const { revalidate } = useRevalidator();
  const refresh = () => void revalidate();
  const [deptId, setDeptId] = useState(departments[0]?.id ?? 0);
  const [adding, setAdding] = useState<Slot | null>(null);
  const [view, setView] = useState<'slots' | 'people'>('slots');
  const [error, setError] = useState('');

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const byUser = useMemo(() => {
    const m = new Map<number, AssignmentRow[]>();
    for (const a of assign.assignments) m.set(a.userId, [...(m.get(a.userId) ?? []), a]);
    return m;
  }, [assign.assignments]);
  const violationsOf = (userId: number, slotId: number) =>
    assign.violations.filter((v) => v.userId === userId && v.slotId === slotId);
  const missingOf = (slotId: number) =>
    assign.shortages.find((s) => s.slotId === slotId)?.missing ?? 0;
  const minutesOf = (userId: number) =>
    (byUser.get(userId) ?? []).reduce(
      (n, a) => n + (slotById.get(a.slotId) ? slotMinutes(slotById.get(a.slotId)!) : 0),
      0,
    );

  const deptPosts = posts.filter((p) => p.departmentId === deptId);
  const deptSlots = slots.filter((s) => s.departmentId === deptId);
  const days = [...new Set(deptSlots.map((s) => dateKey(s.startsAt)))].sort();
  const [day, setDay] = useState('');
  const currentDay = days.includes(day) ? day : (days[0] ?? '');
  const shortageTotal = assign.shortages.reduce((n, s) => n + s.missing, 0);
  const deptShort = (id: number) =>
    assign.shortages
      .filter((s) => slotById.get(s.slotId)?.departmentId === id)
      .reduce((n, s) => n + s.missing, 0);

  async function act(fn: () => Promise<unknown>) {
    try {
      setError('');
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Page wide back>
      <h1 className="text-2xl font-bold">自動割り当て・手動修正</h1>
      <RunPanel run={run} onFinished={refresh} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={shortageTotal > 0 ? 'destructive' : 'secondary'}>
          不足 {assign.shortages.length} 枠（計 {shortageTotal} 人）
        </Badge>
        <Badge variant={assign.violations.length > 0 ? 'destructive' : 'secondary'}>
          制約違反の警告 {assign.violations.length} 件
        </Badge>
        <span className="text-muted-foreground">割り当て済み {assign.assignments.length} 件</span>
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}

      <div className="flex flex-wrap gap-2">
        <Button variant={view === 'slots' ? 'default' : 'outline'} onClick={() => setView('slots')}>
          枠ごと
        </Button>
        <Button
          variant={view === 'people' ? 'default' : 'outline'}
          onClick={() => setView('people')}
        >
          人ごと（勤務時間）
        </Button>
      </div>

      {view === 'slots' ? (
        <>
          <div role="tablist" className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <Button
                key={d.id}
                role="tab"
                aria-selected={d.id === deptId}
                variant={d.id === deptId ? 'default' : 'outline'}
                onClick={() => setDeptId(d.id)}
              >
                {d.name}
                {deptShort(d.id) > 0 && <Badge variant="destructive">不足 {deptShort(d.id)}</Badge>}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {days.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === currentDay ? 'default' : 'outline'}
                onClick={() => setDay(d)}
              >
                {d.slice(5).replace('-', '/')}
              </Button>
            ))}
          </div>
          {days.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm">
              この部門にはまだ枠がありません。
            </p>
          )}
          {deptPosts.map((post) => {
            const row = deptSlots
              .filter((s) => s.postId === post.id && dateKey(s.startsAt) === currentDay)
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            if (row.length === 0) return null;
            return (
              <section key={post.id} className="space-y-2">
                <h2 className="font-semibold">
                  {post.name}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {post.restricted ? `限定 ${post.memberIds.length}人` : '部門の誰でも'}
                  </span>
                </h2>
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
                              あと {missing} 人必要
                            </Badge>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-2 px-4">
                          <ul className="space-y-1">
                            {people.map((a) => {
                              const vs = violationsOf(a.userId, s.id);
                              return (
                                <li
                                  key={a.userId}
                                  className={cn(
                                    'flex items-center justify-between gap-1 rounded border px-2 py-1 text-sm',
                                    vs.length > 0 && 'border-red-300 bg-red-50',
                                  )}
                                >
                                  <span className="min-w-0">
                                    <span className="truncate">
                                      {userById.get(a.userId)?.name ?? '?'}
                                    </span>
                                    {a.source === 'manual' && (
                                      <span className="text-muted-foreground ml-1 text-xs">
                                        手動
                                      </span>
                                    )}
                                    {vs.map((v) => (
                                      <Badge key={v.reason} variant="destructive" className="ml-1">
                                        {REASON[v.reason]}
                                      </Badge>
                                    ))}
                                  </span>
                                  <span className="flex shrink-0 gap-1">
                                    <button
                                      type="button"
                                      className={cn(
                                        'rounded px-1.5 text-xs',
                                        a.locked ? 'bg-amber-200' : 'text-muted-foreground border',
                                      )}
                                      aria-pressed={a.locked}
                                      title="固定すると再実行しても動かしません"
                                      onClick={() =>
                                        void act(() =>
                                          assignApi.setLocked(a.userId, s.id, !a.locked),
                                        )
                                      }
                                    >
                                      {a.locked ? '固定中' : '固定'}
                                    </button>
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-destructive px-1"
                                      aria-label={`${userById.get(a.userId)?.name}を外す`}
                                      onClick={() =>
                                        void act(() => assignApi.remove(a.userId, s.id))
                                      }
                                    >
                                      ×
                                    </button>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                          <Button size="sm" variant="outline" onClick={() => setAdding(s)}>
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
        </>
      ) : (
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
              {[...users]
                .sort((a, b) => minutesOf(b.id) - minutesOf(a.id))
                .map((u) => {
                  const m = minutesOf(u.id);
                  const over = u.maxMinutes !== null && m > u.maxMinutes;
                  const diff = u.targetMinutes === null ? null : m - u.targetMinutes;
                  return (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="p-2">{u.name}</td>
                      <td className="p-2">
                        {hours(m)}（{(byUser.get(u.id) ?? []).length}枠）
                      </td>
                      <td className="p-2">
                        {u.targetMinutes === null ? '-' : hours(u.targetMinutes)}
                      </td>
                      <td className="p-2">{u.maxMinutes === null ? '-' : hours(u.maxMinutes)}</td>
                      <td className="p-2">
                        {over ? (
                          <Badge variant="destructive">上限超過</Badge>
                        ) : diff === null ? null : diff === 0 ? (
                          <Badge variant="secondary">目標どおり</Badge>
                        ) : (
                          <Badge variant="outline">
                            目標より {hours(Math.abs(diff))} {diff < 0 ? '少ない' : '多い'}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <AddDialog
        slot={adding}
        users={users}
        onClose={() => setAdding(null)}
        onAdded={() => {
          setAdding(null);
          refresh();
        }}
      />
    </Page>
  );
}
