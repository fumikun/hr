import { Hand, Pencil } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import {
  slotApi,
  type AdminUser,
  type Department,
  type Post,
  type Slot,
  type SlotEdit,
} from '../api';
import { useConfirm } from '@/components/ConfirmDialog';
import { minToDate, SlotTimeline } from '@/components/SlotTimeline';
import { ErrorAlert, Notice, Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { useDeptId } from '@/lib/useDeptId';
import { useQueryParam, useSetQueryParams } from '@/lib/useQueryParam';

export type AdminSlotsData = {
  departments: Department[];
  posts: Post[];
  slots: Slot[];
  users: AdminUser[];
  /** 対象日以外にあるため、割り当て・希望入力に使われない枠 */
  excludedSlotIds: number[];
  eventDays: string[];
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
        枠を作成します。
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
  const { departments, posts, slots, excludedSlotIds, eventDays } = useLoaderData<AdminSlotsData>();
  const { revalidate } = useRevalidator();
  const [dayParam, setDay] = useQueryParam('day');
  const setQuery = useSetQueryParams();
  const deptId = useDeptId(departments);
  const deptPosts = useMemo(() => posts.filter((p) => p.departmentId === deptId), [posts, deptId]);
  const deptSlots = useMemo(() => slots.filter((s) => s.departmentId === deptId), [slots, deptId]);
  // 日付は、調整する日程と、この部門に枠がある日（日程外の枠も見つけられるように）
  const days = useMemo(
    () => [...new Set([...eventDays, ...deptSlots.map((s) => dateKey(s.startsAt))])].sort(),
    [eventDays, deptSlots],
  );
  const excluded = useMemo(() => new Set(excludedSlotIds), [excludedSlotIds]);
  const deptExcluded = deptSlots.filter((s) => excluded.has(s.id));
  // その日の枠がすべて使われない日（日程外の日など）
  const offDay = (d: string) =>
    !eventDays.includes(d) ||
    (deptSlots.some((s) => dateKey(s.startsAt) === d) &&
      deptSlots.filter((s) => dateKey(s.startsAt) === d).every((s) => excluded.has(s.id)));
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
        <h1 className="text-2xl font-bold">シフト枠</h1>
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
        <TabsList>
          {departments.map((d) => (
            <TabsTrigger key={d.id} value={String(d.id)}>
              {d.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">持ち場</span>
        <span className="text-muted-foreground">
          {deptPosts.length === 0 ? 'まだありません' : deptPosts.map((p) => p.name).join('・')}
        </span>
        <Link
          to={`/admin/posts?dept=${deptId}`}
          className="text-primary inline-flex min-h-10 items-center underline sm:min-h-0"
        >
          持ち場を編集する
        </Link>
      </section>

      {deptPosts.length === 0 ? (
        <Notice kind="info">
          この部門にはまだ持ち場がありません。
          <Link to={`/admin/posts/new?dept=${deptId}`} className="ml-1 underline">
            持ち場を作る
          </Link>
        </Notice>
      ) : deptSlots.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>この部門にはまだ枠がありません</CardTitle>
          </CardHeader>
          <CardContent>
            <GeneratorForm posts={deptPosts} date={date} onDone={refresh} />
          </CardContent>
        </Card>
      ) : (
        <>
          {deptExcluded.length > 0 && (
            <Notice kind="warning">
              対象日以外の枠が {deptExcluded.length} 件あります（
              {[...new Set(deptExcluded.map((s) => md(s.startsAt)))].join('・')}
              ）。割り当てと希望入力には使われません。
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {days.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === date ? 'default' : 'outline'}
                className={cn(offDay(d) && d !== date && 'text-muted-foreground')}
                onClick={() => {
                  setDay(d);
                  closeDialogs();
                }}
              >
                {md(d)}
                {offDay(d) && <span className="text-xs">対象外</span>}
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
            {md(date)}：{daySlots.length} 枠（必要人数の合計 {total} 人）
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
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>枠をまとめて生成</DialogTitle>
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
