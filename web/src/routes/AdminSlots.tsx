import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLoaderData, useRevalidator } from 'react-router';
import {
  slotApi,
  slotCopyApi,
  type AdminUser,
  type Department,
  type Post,
  type Slot,
  type SlotEdit,
} from '../api';
import { PostsPanel } from '@/components/PostsPanel';
import { minToDate, SlotTimeline } from '@/components/SlotTimeline';
import { ErrorAlert, Page } from '@/components/Page';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type AdminSlotsData = {
  departments: Department[];
  posts: Post[];
  slots: Slot[];
  users: AdminUser[];
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

function Editor({
  slot,
  date,
  onSaved,
  onCancel,
  save,
  remove,
}: {
  slot: Pick<SlotEdit, 'minPeople' | 'maxPeople'> & { startsAt?: string; endsAt?: string };
  date: string;
  onSaved: () => void;
  onCancel: () => void;
  save: (s: SlotEdit) => Promise<unknown>;
  remove?: () => Promise<unknown>;
}) {
  const [start, setStart] = useState(slot.startsAt ? timeKey(new Date(slot.startsAt)) : '09:00');
  const [end, setEnd] = useState(slot.endsAt ? timeKey(new Date(slot.endsAt)) : '10:00');
  const [min, setMin] = useState(slot.minPeople);
  const [max, setMax] = useState(slot.maxPeople);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<unknown>) {
    try {
      setError('');
      await fn();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (end <= start) return setError('終了は開始より後にしてください');
    if (min > max) return setError('最低人数は最大人数以下にしてください');
    void run(() =>
      save({
        startsAt: toIso(date, start),
        endsAt: toIso(date, end),
        minPeople: min,
        maxPeople: max,
      }),
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="開始">
          {(id) => (
            <Input
              id={id}
              type="time"
              step={300}
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          )}
        </Field>
        <Field label="終了">
          {(id) => (
            <Input
              id={id}
              type="time"
              step={300}
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          )}
        </Field>
        <Field label="最低人数">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
            />
          )}
        </Field>
        <Field label="最大人数">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
          )}
        </Field>
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <div className="flex justify-end gap-2">
        {remove && (
          <Button
            type="button"
            variant="destructive"
            className="mr-auto"
            onClick={() => window.confirm('この枠を削除しますか？') && void run(remove)}
          >
            削除
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>
          閉じる
        </Button>
        <Button type="submit">保存</Button>
      </div>
    </form>
  );
}

/** この日の枠（部門内すべての持ち場）を、他の日にコピーする */
function CopyDay({ date, slots, onDone }: { date: string; slots: Slot[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');

  const dayDiff = (to: string) =>
    Math.round(
      (new Date(`${to}T00:00`).getTime() - new Date(`${date}T00:00`).getTime()) / 86_400_000,
    );

  async function run() {
    setError('');
    try {
      await slotCopyApi.copy(
        slots.map((s) => s.id),
        targets.map(dayDiff),
      );
      toast.success(`${slots.length * targets.length} 枠をコピーしました`);
      setOpen(false);
      setTargets([]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={slots.length === 0}
        onClick={() => setOpen(true)}
      >
        この日の枠を他の日にコピー
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{date} の枠をコピー</DialogTitle>
            <DialogDescription>
              この日の {slots.length}{' '}
              枠（全持ち場）を、同じ時刻・人数で選んだ日に複製します。既存の枠と重なる日があると、何もコピーしません。
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input type="date" value={pick} onChange={(e) => setPick(e.target.value)} />
            <Button
              type="button"
              variant="outline"
              disabled={!pick || pick === date || targets.includes(pick)}
              onClick={() => {
                setTargets([...targets, pick].sort());
                setPick('');
              }}
            >
              追加
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {targets.map((t) => (
              <li key={t} className="flex items-center gap-1 rounded border px-2 py-0.5 text-sm">
                {t}
                <button
                  type="button"
                  aria-label={`${t}を外す`}
                  onClick={() => setTargets(targets.filter((x) => x !== t))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {error && <ErrorAlert>{error}</ErrorAlert>}
          <Button disabled={targets.length === 0} onClick={() => void run()}>
            {targets.length} 日にコピー
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Generator({ posts, date, onDone }: { posts: Post[]; date: string; onDone: () => void }) {
  const [postId, setPostId] = useState(posts[0]?.id ?? 0);
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [slotMinutes, setSlotMinutes] = useState(90);
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(3);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!postId) return setError('持ち場を選んでください');
    if (to < from) return setError('最終日は初日以降にしてください');
    if (end <= start) return setError('終了は開始より後にしてください');
    if (slotMinutes < 5 || slotMinutes % 5 !== 0) return setError('枠の長さは5分単位です');
    if (min > max) return setError('最低人数は最大人数以下にしてください');
    const windows = [];
    for (let d = new Date(`${from}T00:00`); dateKey(d) <= to; d.setDate(d.getDate() + 1)) {
      windows.push({ startsAt: toIso(dateKey(d), start), endsAt: toIso(dateKey(d), end) });
    }
    try {
      const created = await slotApi.generate({
        postId,
        windows,
        slotMinutes,
        minPeople: min,
        maxPeople: max,
      });
      setMessage(`${created.length} 枠を作成しました`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>枠の自動生成</CardTitle>
        <CardDescription>
          各日の稼働時間を枠の長さで区切ります（端数は枠にしません）。作成後に個別に編集できます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <Field label="持ち場">
            {(id) => (
              <Select value={String(postId)} onValueChange={(v) => setPostId(Number(v))}>
                <SelectTrigger id={id} className="w-full sm:max-w-xs">
                  <SelectValue placeholder="持ち場を選択" />
                </SelectTrigger>
                <SelectContent>
                  {posts.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="初日">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              )}
            </Field>
            <Field label="最終日">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              )}
            </Field>
            <Field label="稼働開始">
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  step={300}
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              )}
            </Field>
            <Field label="稼働終了">
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  step={300}
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="枠の長さ（分）">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={5}
                  step={5}
                  value={slotMinutes}
                  onChange={(e) => setSlotMinutes(Number(e.target.value))}
                />
              )}
            </Field>
            <Field label="最低人数">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                />
              )}
            </Field>
            <Field label="最大人数">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  value={max}
                  onChange={(e) => setMax(Number(e.target.value))}
                />
              )}
            </Field>
          </div>
          {error && <ErrorAlert>{error}</ErrorAlert>}
          {message && <p className="text-sm">{message}</p>}
          <Button type="submit">生成</Button>
        </form>
      </CardContent>
    </Card>
  );
}

const ZOOMS = [64, 96, 144, 224];

export function AdminSlots() {
  const { departments, posts, slots, users } = useLoaderData<AdminSlotsData>();
  const { revalidate } = useRevalidator();
  const [deptId, setDeptId] = useState(departments[0]?.id ?? 0);
  const deptPosts = useMemo(() => posts.filter((p) => p.departmentId === deptId), [posts, deptId]);
  const deptSlots = useMemo(() => slots.filter((s) => s.departmentId === deptId), [slots, deptId]);
  const days = useMemo(
    () => [...new Set(deptSlots.map((s) => dateKey(new Date(s.startsAt))))].sort(),
    [deptSlots],
  );
  const [date, setDate] = useState(days[0] ?? dateKey(new Date()));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState<{ postId: number; start: number; end: number } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState('');

  const daySlots = deptSlots.filter((s) => dateKey(new Date(s.startsAt)) === date);
  const startHour = Math.min(
    7,
    ...daySlots.map((s) => Math.floor(minutesOfDay(new Date(s.startsAt)) / 60)),
  );
  const current = slots.find((s) => s.id === selectedId);
  const refresh = () => void revalidate();
  const closeDialogs = () => {
    setSelectedId(null);
    setCreating(null);
  };
  const done = () => {
    closeDialogs();
    refresh();
  };
  const total = daySlots.reduce((n, s) => n + s.minPeople, 0);
  const iso = (min: number) => minToDate(date, min).toISOString();

  // ドラッグでの移動・リサイズは即保存する（失敗したら元の位置に戻る）
  async function changeSlot(slot: Slot, start: number, end: number) {
    try {
      setNotice('');
      await slotApi.update(slot.id, {
        startsAt: iso(start),
        endsAt: iso(end),
        minPeople: slot.minPeople,
        maxPeople: slot.maxPeople,
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    refresh();
  }

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">部門・シフト枠設定</h1>

      <div role="tablist" className="flex flex-wrap gap-2">
        {departments.map((d) => (
          <Button
            key={d.id}
            role="tab"
            aria-selected={d.id === deptId}
            variant={d.id === deptId ? 'default' : 'outline'}
            onClick={() => {
              setDeptId(d.id);
              closeDialogs();
              setNotice('');
            }}
          >
            {d.name}
          </Button>
        ))}
      </div>

      <PostsPanel departmentId={deptId} posts={deptPosts} users={users} onChanged={refresh} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="日付">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                closeDialogs();
              }}
            />
          )}
        </Field>
        {days.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={d === date ? 'default' : 'outline'}
            onClick={() => setDate(d)}
          >
            {d.slice(5)}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <CopyDay date={date} slots={daySlots} onDone={refresh} />
          <Button
            size="sm"
            variant="outline"
            aria-label="縮小"
            disabled={zoom === 0}
            onClick={() => setZoom(zoom - 1)}
          >
            −
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="拡大"
            disabled={zoom === ZOOMS.length - 1}
            onClick={() => setZoom(zoom + 1)}
          >
            ＋
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        {date}：{daySlots.length} 枠（必要人数の合計 {total}{' '}
        人）。空きをドラッグで枠を作成、枠の中央を
        ドラッグで移動、左右の端で時間を変更、クリックで人数などを編集できます。
      </p>
      {notice && <ErrorAlert>{notice}</ErrorAlert>}

      {deptPosts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm">
          先に上の「持ち場を追加」で持ち場を作ってください。
        </p>
      ) : (
        <SlotTimeline
          posts={deptPosts}
          slots={daySlots}
          startHour={startHour}
          endHour={24}
          hourPx={ZOOMS[zoom]!}
          selectedId={selectedId}
          onCreate={(postId, start, end) => setCreating({ postId, start, end })}
          onSelect={(s) => setSelectedId(s.id)}
          onChange={(s, start, end) => void changeSlot(s, start, end)}
          onReject={setNotice}
        />
      )}

      <Dialog open={!!creating || !!current} onOpenChange={(o) => !o && closeDialogs()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating ? '枠を追加' : '枠を編集'}</DialogTitle>
            <DialogDescription>
              {date} ・{' '}
              {deptPosts.find((p) => p.id === (creating?.postId ?? current?.postId))?.name}
              （時刻は5分単位）
            </DialogDescription>
          </DialogHeader>
          {creating && (
            <Editor
              key={`new-${creating.postId}-${creating.start}-${creating.end}`}
              slot={{
                minPeople: 1,
                maxPeople: 3,
                startsAt: iso(creating.start),
                endsAt: iso(creating.end),
              }}
              date={date}
              onSaved={done}
              onCancel={closeDialogs}
              save={(s) => slotApi.create(creating.postId, s)}
            />
          )}
          {current && (
            <Editor
              key={current.id}
              slot={current}
              date={date}
              onSaved={done}
              onCancel={closeDialogs}
              save={(s) => slotApi.update(current.id, s)}
              remove={() => slotApi.remove(current.id)}
            />
          )}
        </DialogContent>
      </Dialog>

      {deptPosts.length > 0 && (
        <Generator key={deptId} posts={deptPosts} date={date} onDone={refresh} />
      )}
    </Page>
  );
}
