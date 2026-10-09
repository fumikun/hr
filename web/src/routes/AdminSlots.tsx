import { Hand, Pencil } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import {
  slotApi,
  slotCopyApi,
  type AdminUser,
  type Department,
  type Post,
  type Slot,
  type SlotEdit,
} from '../api';
import { useConfirm } from '@/components/ConfirmDialog';
import { PostsPanel } from '@/components/PostsPanel';
import { minToDate, SlotTimeline } from '@/components/SlotTimeline';
import { ErrorAlert, Notice, Page } from '@/components/Page';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dateKey, dayStart, hm, md, mdRange } from '@/lib/datetime';
import { useAction } from '@/lib/useAction';
import { useQueryParam, useSetQueryParams } from '@/lib/useQueryParam';

export type AdminSlotsData = {
  departments: Department[];
  posts: Post[];
  slots: Slot[];
  users: AdminUser[];
};

const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const DAY = 86_400_000;

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
  const [start, setStart] = useState(slot.startsAt ? hm(slot.startsAt) : '09:00');
  const [end, setEnd] = useState(slot.endsAt ? hm(slot.endsAt) : '10:00');
  const [min, setMin] = useState(slot.minPeople);
  const [max, setMax] = useState(slot.maxPeople);
  const [localError, setLocalError] = useState('');
  const { run, pending, error } = useAction();
  const confirm = useConfirm();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (end <= start) return setLocalError('終了は開始より後にしてください');
    if (min > max) return setLocalError('最低人数は最大人数以下にしてください');
    setLocalError('');
    void run(
      () =>
        save({
          startsAt: toIso(date, start),
          endsAt: toIso(date, end),
          minPeople: min,
          maxPeople: max,
        }),
      { success: '枠を保存しました', onSuccess: onSaved },
    );
  }
  async function del() {
    const ok = await confirm({
      title: 'この枠を削除しますか？',
      description: 'この枠に割り当てられている人の割り当ても一緒に消えます。',
      confirmLabel: '削除',
      destructive: true,
    });
    if (ok) await run(remove!, { success: '枠を削除しました', onSuccess: onSaved });
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
      {(localError || error) && <ErrorAlert>{localError || error}</ErrorAlert>}
      <div className="flex justify-end gap-2">
        {remove && (
          <Button
            type="button"
            variant="destructive"
            className="mr-auto"
            disabled={pending}
            onClick={() => void del()}
          >
            削除
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>
          閉じる
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  );
}

/** この日の枠（部門内すべての持ち場）を、他の日にコピーする。重なる日は事前に表示して押せなくする */
function CopyDay({
  date,
  daySlots,
  allSlots,
  onDone,
}: {
  date: string;
  daySlots: Slot[];
  allSlots: Slot[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [pick, setPick] = useState('');
  const { run, pending, error } = useAction();

  const dayDiff = (to: string) =>
    Math.round((dayStart(to).getTime() - dayStart(date).getTime()) / DAY);

  // コピー先の日に、同じ持ち場で時間が重なる既存の枠があるか
  const conflicts = (to: string) => {
    const shift = dayDiff(to) * DAY;
    return daySlots.some((s) => {
      const a = new Date(s.startsAt).getTime() + shift;
      const b = new Date(s.endsAt).getTime() + shift;
      return allSlots.some(
        (x) =>
          x.postId === s.postId &&
          new Date(x.startsAt).getTime() < b &&
          a < new Date(x.endsAt).getTime(),
      );
    });
  };
  const anyConflict = targets.some(conflicts);

  const copy = () =>
    run(
      () =>
        slotCopyApi.copy(
          daySlots.map((s) => s.id),
          targets.map(dayDiff),
        ),
      {
        success: `${daySlots.length * targets.length} 枠をコピーしました`,
        onSuccess: () => {
          setOpen(false);
          setTargets([]);
          onDone();
        },
      },
    );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={daySlots.length === 0}
        onClick={() => setOpen(true)}
      >
        この日の枠を他の日にコピー
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{md(date)} の枠をコピー</DialogTitle>
            <DialogDescription>
              この日の {daySlots.length}{' '}
              枠（全持ち場）を、同じ時刻・人数で選んだ日に複製します。既存の枠と重なる日があると、コピーできません。
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
          <ul className="space-y-1">
            {targets.map((t) => (
              <li
                key={t}
                className="flex items-center justify-between rounded border px-2 py-1 text-sm"
              >
                <span>
                  {md(t)}
                  {conflicts(t) && (
                    <span className="text-destructive ml-2">⚠ 既存の枠と重なります</span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`${md(t)}を外す`}
                  onClick={() => setTargets(targets.filter((x) => x !== t))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {error && <ErrorAlert>{error}</ErrorAlert>}
          <Button
            disabled={targets.length === 0 || anyConflict || pending}
            onClick={() => void copy()}
          >
            {targets.length} 日にコピー
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 設定から枠をまとめて作る。枠がない部門では、画面の中央に大きく出す */
function GeneratorForm({
  posts,
  date,
  onDone,
}: {
  posts: Post[];
  date: string;
  onDone: () => void;
}) {
  const [postId, setPostId] = useState(posts[0]?.id ?? 0);
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [slotMinutes, setSlotMinutes] = useState(90);
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(3);
  const [localError, setLocalError] = useState('');
  const { run, pending, error } = useAction();

  // 作られる枠の数（端数は枠にしない）
  const perDay = Math.floor(
    (new Date(`2000-01-01T${end}`).getTime() - new Date(`2000-01-01T${start}`).getTime()) /
      60_000 /
      Math.max(5, slotMinutes),
  );
  const dayCount =
    to >= from ? Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / DAY) + 1 : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError('');
    if (!postId) return setLocalError('持ち場を選んでください');
    if (to < from) return setLocalError('最終日は初日以降にしてください');
    if (end <= start) return setLocalError('終了は開始より後にしてください');
    if (slotMinutes < 5 || slotMinutes % 5 !== 0) return setLocalError('枠の長さは5分単位です');
    if (min > max) return setLocalError('最低人数は最大人数以下にしてください');
    const windows: { startsAt: string; endsAt: string }[] = [];
    for (let d = dayStart(from); dateKey(d) <= to; d.setDate(d.getDate() + 1)) {
      windows.push({ startsAt: toIso(dateKey(d), start), endsAt: toIso(dateKey(d), end) });
    }
    void run(
      () => slotApi.generate({ postId, windows, slotMinutes, minPeople: min, maxPeople: max }),
      { success: '枠を作成しました', onSuccess: onDone },
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
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
      <p className="text-muted-foreground text-sm">
        1日 {Math.max(0, perDay)} 枠 × {dayCount} 日 = {Math.max(0, perDay) * dayCount}{' '}
        枠を作成します（端数の時間は枠にしません）。
      </p>
      {(localError || error) && <ErrorAlert>{localError || error}</ErrorAlert>}
      <Button type="submit" disabled={pending}>
        {pending ? '作成中…' : '枠を作成'}
      </Button>
    </form>
  );
}

const ZOOMS = [64, 96, 144, 224];

export function AdminSlots() {
  const { departments, posts, slots, users } = useLoaderData<AdminSlotsData>();
  const { revalidate } = useRevalidator();
  const [deptParam] = useQueryParam('dept');
  const [dayParam, setDay] = useQueryParam('day');
  const setQuery = useSetQueryParams();
  const deptId = departments.find((d) => String(d.id) === deptParam)?.id ?? departments[0]?.id ?? 0;
  const deptPosts = useMemo(() => posts.filter((p) => p.departmentId === deptId), [posts, deptId]);
  const deptSlots = useMemo(() => slots.filter((s) => s.departmentId === deptId), [slots, deptId]);
  const days = useMemo(
    () => [...new Set(deptSlots.map((s) => dateKey(s.startsAt)))].sort(),
    [deptSlots],
  );
  const date =
    dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : (days[0] ?? dateKey(new Date()));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState<{ postId: number; start: number; end: number } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const [genOpen, setGenOpen] = useState(false);
  const [touchEdit, setTouchEdit] = useState(false);
  // 枠を追加するときの人数は、前回入力した値を引き継ぐ
  const [lastPeople, setLastPeople] = useState({ min: 1, max: 3 });
  const [notice, setNotice] = useState('');

  const daySlots = deptSlots.filter((s) => dateKey(s.startsAt) === date);
  // 表示する時間帯は、その日の枠に合わせて詰める（枠がなければ 8〜18 時）
  const startHour = daySlots.length
    ? Math.max(
        0,
        Math.min(...daySlots.map((s) => Math.floor(minutesOfDay(new Date(s.startsAt)) / 60))) - 1,
      )
    : 8;
  const endHour = daySlots.length
    ? Math.min(
        24,
        Math.max(...daySlots.map((s) => Math.ceil(minutesOfDay(new Date(s.endsAt)) / 60 || 24))) +
          1,
      )
    : 18;
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

  // ドラッグでの移動・リサイズは即保存する（失敗したら元の位置に戻る。保存後は「元に戻す」を出す）
  async function changeSlot(slot: Slot, start: number, end: number) {
    const before: SlotEdit = {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      minPeople: slot.minPeople,
      maxPeople: slot.maxPeople,
    };
    try {
      setNotice('');
      await slotApi.update(slot.id, { ...before, startsAt: iso(start), endsAt: iso(end) });
      toast(`枠を ${mdRange(iso(start), iso(end))} に変更しました`, {
        action: {
          label: '元に戻す',
          onClick: () =>
            void slotApi
              .update(slot.id, before)
              .then(refresh)
              .catch((e: Error) => toast.error(e.message)),
        },
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    refresh();
  }

  return (
    <Page wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">部門・シフト枠設定</h1>
        {deptPosts.length > 0 && daySlots.length + deptSlots.length > 0 && (
          <Button variant="outline" onClick={() => setGenOpen(true)}>
            枠をまとめて生成
          </Button>
        )}
      </div>

      <Tabs
        value={String(deptId)}
        onValueChange={(v) => {
          setQuery({ dept: v, day: null });
          closeDialogs();
          setNotice('');
        }}
      >
        <TabsList className="h-auto flex-wrap justify-start">
          {departments.map((d) => (
            <TabsTrigger key={d.id} value={String(d.id)}>
              {d.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <PostsPanel departmentId={deptId} posts={deptPosts} users={users} onChanged={refresh} />

      {deptPosts.length === 0 ? (
        <Notice kind="info" title="先に持ち場を作ってください">
          上の「持ち場を追加」で、この部門の持ち場（持ち場が1つだけの部門は「全体」など）を作ると、枠を作れるようになります。
        </Notice>
      ) : deptSlots.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>この部門にはまだ枠がありません</CardTitle>
            <CardDescription>
              稼働時間と枠の長さを決めると、まとめて作成できます。作成後に個別に調整できます。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GeneratorForm posts={deptPosts} date={date} onDone={refresh} />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="日付">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDay(e.target.value);
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
                onClick={() => setDay(d)}
              >
                {md(d)}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant={touchEdit ? 'default' : 'outline'}
                className="lg:hidden"
                aria-pressed={touchEdit}
                onClick={() => setTouchEdit(!touchEdit)}
                title="指でなぞって枠を作る・動かすか、指で横にスクロールするかを切り替えます"
              >
                {touchEdit ? <Pencil className="size-4" /> : <Hand className="size-4" />}
                {touchEdit ? '指で編集' : '指でスクロール'}
              </Button>
              <CopyDay date={date} daySlots={daySlots} allSlots={deptSlots} onDone={refresh} />
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
            {md(date)}：{daySlots.length} 枠（必要人数の合計 {total}{' '}
            人）。空きをドラッグで枠を作成、枠の中央をドラッグで移動、左右の端で時間を変更、クリックで人数などを編集できます。
          </p>
          {notice && <ErrorAlert>{notice}</ErrorAlert>}

          <SlotTimeline
            posts={deptPosts}
            slots={daySlots}
            startHour={startHour}
            endHour={endHour}
            hourPx={ZOOMS[zoom]!}
            selectedId={selectedId}
            touchEdit={touchEdit}
            onCreate={(postId, start, end) => setCreating({ postId, start, end })}
            onSelect={(s) => setSelectedId(s.id)}
            onChange={(s, start, end) => void changeSlot(s, start, end)}
            onReject={setNotice}
          />
        </>
      )}

      <Dialog open={!!creating || !!current} onOpenChange={(o) => !o && closeDialogs()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating ? '枠を追加' : '枠を編集'}</DialogTitle>
            <DialogDescription>
              {md(date)} ・{' '}
              {deptPosts.find((p) => p.id === (creating?.postId ?? current?.postId))?.name}
              （時刻は5分単位）
            </DialogDescription>
          </DialogHeader>
          {creating && (
            <Editor
              key={`new-${creating.postId}-${creating.start}-${creating.end}`}
              slot={{
                minPeople: lastPeople.min,
                maxPeople: lastPeople.max,
                startsAt: iso(creating.start),
                endsAt: iso(creating.end),
              }}
              date={date}
              onSaved={done}
              onCancel={closeDialogs}
              save={(s) => {
                setLastPeople({ min: s.minPeople, max: s.maxPeople });
                return slotApi.create(creating.postId, s);
              }}
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

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>枠をまとめて生成</DialogTitle>
            <DialogDescription>
              各日の稼働時間を枠の長さで区切ります。既存の枠と重なる場合は作成されません。
            </DialogDescription>
          </DialogHeader>
          <GeneratorForm
            key={deptId}
            posts={deptPosts}
            date={date}
            onDone={() => {
              setGenOpen(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </Page>
  );
}
