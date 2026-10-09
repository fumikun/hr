import { Copy, Hand, Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useLoaderData, useParams, useRevalidator } from 'react-router';
import { adminAvailabilityApi, availabilityApi, type AvailabilityData } from '../api';
import { copyDay, paint, rowOf, type PaintEntry } from '../lib/paint';
import {
  AvailabilityGrid,
  TYPE_LABEL,
  TYPE_STYLE,
  type GridRow,
  type Tool,
} from '@/components/AvailabilityGrid';
import { useConfirm } from '@/components/ConfirmDialog';
import { ErrorAlert, Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { dateKey, dayStart as dayStartOf, fmtDateTime, hm, md } from '@/lib/datetime';
import { useAction } from '@/lib/useAction';
import { cn } from '@/lib/utils';

const ZOOMS = [64, 96, 144];

const toEntries = (d: AvailabilityData): PaintEntry[] =>
  d.entries.map((e) => ({
    type: e.type,
    departmentId: e.departmentId,
    start: new Date(e.startsAt).getTime(),
    end: new Date(e.endsAt).getTime(),
  }));
const sameEntries = (a: PaintEntry[], b: PaintEntry[]) => {
  const key = (e: PaintEntry) => `${e.type}|${e.departmentId}|${e.start}|${e.end}`;
  return a.map(key).sort().join() === b.map(key).sort().join();
};

/** 色の凡例。ペンの意味もここで説明する */
function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {(
        [
          ['ng', '絶対に入れない時間（全部門共通）'],
          ['want', '入りたい時間（優先して割り当てます）'],
          ['ok', '入れる時間（明示したいとき。塗らない時間も「入れる」扱いです）'],
        ] as const
      ).map(([t, text]) => (
        <li key={t} className="flex items-center gap-1.5">
          <span className={cn('inline-block h-3 w-5 rounded border', TYPE_STYLE[t])} />
          {text}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="bg-muted-foreground/15 inline-block h-3 w-5 rounded border" />
        シフト枠がある時間
      </li>
    </ul>
  );
}

export function Availability() {
  const data = useLoaderData<AvailabilityData & { userName?: string }>();
  // /admin/users/:userId/availability では、管理者が受付期間に関係なく代理で入力する
  const { userId } = useParams();
  const proxyFor = userId ? Number(userId) : null;
  const { revalidate } = useRevalidator();
  const confirm = useConfirm();
  const { run, pending, error } = useAction();
  const [saved, setSaved] = useState(() => toEntries(data));
  const [entries, setEntries] = useState(saved);
  const [tool, setTool] = useState<Tool>('want');
  const [zoom, setZoom] = useState(1);
  const [touchPaint, setTouchPaint] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const dirty = !sameEntries(entries, saved);
  const editable = proxyFor !== null || data.open;

  // タブを閉じるとき・画面内で別のページへ移るときの、未保存の確認
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({
      title: '保存していない変更があります',
      description: 'このまま移動すると、入力した内容が消えます。',
      confirmLabel: '破棄して移動',
      cancelLabel: 'このページに残る',
      destructive: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);

  // シフト枠のある日を表示対象にする。入力済みの日も落とさない。
  const shifts = useMemo(() => {
    type Spans = Map<number, { start: number; end: number }[]>;
    const m = new Map<string, Spans>();
    for (const s of data.slots) {
      const start = new Date(s.startsAt).getTime();
      const key = dateKey(start);
      const byDept: Spans = m.get(key) ?? new Map<number, { start: number; end: number }[]>();
      byDept.set(s.departmentId, [
        ...(byDept.get(s.departmentId) ?? []),
        { start, end: new Date(s.endsAt).getTime() },
      ]);
      m.set(key, byDept);
    }
    return m;
  }, [data.slots]);
  // 調整の対象日（部門・持ち場の設定で決まる）。対象外の日は出さない
  const days = data.days;
  const [day, setDay] = useState(days[0] ?? '');
  const current = days.includes(day) ? day : (days[0] ?? '');

  // 受付が終わった部門の行は変更できない。「入れない」は、どれかの部門が受付中なら変更できる
  const rows: GridRow[] = [
    { row: null, label: '入れない', sub: '全部門共通', locked: !editable },
    ...data.departments.map((d) => {
      const locked = proxyFor === null && !d.open;
      return {
        row: d.id,
        label: d.name,
        sub: locked ? '受付終了' : '入りたい／入れる',
        locked,
      };
    }),
  ];

  const rowLocked = (row: number | null) => rows.find((r) => r.row === row)?.locked ?? false;

  // 表示する時間帯: その日のシフト枠と入力済みの範囲を含む
  const dayStart = current ? dayStartOf(current).getTime() : 0;
  const bounds = useMemo(() => {
    const shiftSpans = [...(shifts.get(current)?.values() ?? [])].flat();
    const spans = [...shiftSpans, ...entries.filter((e) => dateKey(e.start) === current)];
    const lo = Math.min(...spans.map((s) => s.start - dayStart), 8 * 3_600_000);
    const hi = Math.max(...spans.map((s) => s.end - dayStart), 18 * 3_600_000);
    return {
      startHour: Math.max(0, Math.floor(lo / 3_600_000)),
      endHour: Math.min(24, Math.ceil(hi / 3_600_000)),
      // 手動追加の初期値: その日のシフト枠の最初〜最後
      first: shiftSpans.length ? Math.min(...shiftSpans.map((s) => s.start)) : null,
      last: shiftSpans.length ? Math.max(...shiftSpans.map((s) => s.end)) : null,
    };
  }, [shifts, entries, current, dayStart]);

  const dayEntries = entries
    .filter((e) => dateKey(e.start) === current)
    .sort((a, b) => a.start - b.start);
  const deptName = (id: number | null) =>
    id === null ? '全部門' : (data.departments.find((d) => d.id === id)?.name ?? '?');

  const save = () =>
    run(
      async () => {
        const dto = entries.map((e) => ({
          type: e.type,
          departmentId: e.departmentId,
          startsAt: new Date(e.start).toISOString(),
          endsAt: new Date(e.end).toISOString(),
        }));
        if (proxyFor !== null) await adminAvailabilityApi.save(proxyFor, dto);
        else await availabilityApi.save(dto);
        setSaved(entries);
      },
      {
        success: '希望を保存しました。受付期間内は何度でも修正できます。',
        onSuccess: () => void revalidate(),
      },
    );

  return (
    <Page wide>
      {proxyFor !== null && (
        <Link to="/admin/availability" className="text-muted-foreground text-sm hover:underline">
          ← 入力状況の一覧に戻る
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">
          {proxyFor === null ? 'シフト希望入力' : `${data.userName ?? ''}さんのシフト希望`}
        </h1>
        {proxyFor !== null ? (
          <Badge variant="outline">管理者による代理入力</Badge>
        ) : (
          <Badge variant={editable ? 'default' : 'secondary'}>
            {editable ? '受付中' : '受付期間外'}
          </Badge>
        )}
      </div>
      <ul className="text-sm">
        {data.departments.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5">
            <span className="font-medium">{d.name}</span>
            <Badge variant={d.open ? 'default' : 'secondary'}>
              {d.open ? '受付中' : proxyFor !== null ? '受付外' : '受付外（変更不可）'}
            </Badge>
            <span className="text-muted-foreground">
              {fmtDateTime(d.opensAt)} 〜 {fmtDateTime(d.closesAt)} ／ 対象日{' '}
              {d.days.length ? d.days.map((x) => md(x)).join('・') : 'なし'}
            </span>
          </li>
        ))}
        {data.submittedAt && (
          <li className="text-muted-foreground">最終保存: {fmtDateTime(data.submittedAt)}</li>
        )}
      </ul>
      {!editable && (
        <Notice kind="info" title="受付期間外です">
          入力内容の閲覧のみ可能です。変更が必要な場合は管理者に連絡してください。
        </Notice>
      )}
      {editable && proxyFor === null && data.departments.some((d) => !d.open) && (
        <Notice kind="info">
          受付が終わった部門（
          {data.departments
            .filter((d) => !d.open)
            .map((d) => d.name)
            .join('、')}
          ）の入力は、変更できません。
        </Notice>
      )}
      {data.departments.length === 0 ? (
        <Notice kind="info">
          {proxyFor === null ? 'あなたには' : 'この人には'}
          シフト希望の入力が必要な役職がありません。
        </Notice>
      ) : days.length === 0 ? (
        <Notice kind="info">
          調整の対象日がまだ決まっていません。管理者が枠や日程を設定するまでお待ちください。
        </Notice>
      ) : (
        <>
          <Legend />
          <details open={!data.submittedAt} className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">使い方</summary>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
              <li>何も入力しない時間帯は「入れる」として扱われます。</li>
              <li>「入れない」行を塗ると、その時間はどの部門にも割り当てられません。</li>
              <li>部門の行を「入りたい」で塗ると、その時間を優先して割り当てます。</li>
              <li>
                パソコンはドラッグ、スマホはタップ（30分ずつ）か、下の「時刻を入力して追加」を使います。
              </li>
              <li>締切まで何度でも修正できます。保存しないと反映されません。</li>
            </ul>
          </details>

          <div className="bg-background sticky top-12 z-30 flex flex-wrap items-center gap-2 rounded-lg border p-2 lg:top-0">
            <span className="text-sm font-medium">ペン:</span>
            {(
              [
                ['want', '入りたい'],
                ['ok', '入れる'],
                ['ng', '入れない'],
                ['erase', '消す'],
              ] as const
            ).map(([t, label]) => (
              <Button
                key={t}
                size="sm"
                variant={tool === t ? 'default' : 'outline'}
                aria-pressed={tool === t}
                onClick={() => setTool(t)}
              >
                {label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={touchPaint ? 'default' : 'outline'}
              className="lg:hidden"
              aria-pressed={touchPaint}
              onClick={() => setTouchPaint(!touchPaint)}
              title="指でなぞって塗るか、指で横にスクロールするかを切り替えます"
            >
              {touchPaint ? <Pencil className="size-4" /> : <Hand className="size-4" />}
              {touchPaint ? '指でなぞって塗る' : '指でスクロール'}
            </Button>
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={zoom === 0}
                onClick={() => setZoom(zoom - 1)}
                aria-label="縮小"
              >
                −
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={zoom === ZOOMS.length - 1}
                onClick={() => setZoom(zoom + 1)}
                aria-label="拡大"
              >
                ＋
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {days.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === current ? 'default' : 'outline'}
                onClick={() => setDay(d)}
              >
                {md(d)}
                {entries.some((e) => dateKey(e.start) === d) && ' ●'}
              </Button>
            ))}
            {editable && days.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setCopyOpen(true)}
              >
                <Copy className="size-4" aria-hidden />
                この日の入力を他の日にコピー
              </Button>
            )}
          </div>

          <AvailabilityGrid
            dayStart={dayStart}
            startHour={bounds.startHour}
            endHour={bounds.endHour}
            hourPx={ZOOMS[zoom]!}
            rows={rows}
            entries={entries}
            shifts={shifts.get(current) ?? new Map()}
            tool={tool}
            disabled={!editable}
            touchPaint={touchPaint}
            onChange={setEntries}
          />

          <ul className="flex flex-wrap gap-2">
            {dayEntries.map((e) => (
              <li
                key={`${e.type}-${e.departmentId}-${e.start}`}
                className={cn(
                  'flex items-center gap-1 rounded border px-2 py-1 text-xs',
                  TYPE_STYLE[e.type],
                )}
              >
                {TYPE_LABEL[e.type]}・{deptName(rowOf(e))} {hm(e.start)}–{hm(e.end)}
                {editable && !rowLocked(rowOf(e)) && (
                  <button
                    type="button"
                    className="ml-1 px-1 font-bold"
                    aria-label={`${hm(e.start)}から${hm(e.end)}の入力を削除`}
                    onClick={() => setEntries(paint(entries, rowOf(e), e, null))}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
            {dayEntries.length === 0 && (
              <li className="text-muted-foreground text-sm">
                この日の入力はありません（全時間帯「入れる」）
              </li>
            )}
          </ul>

          {editable && (
            <ManualAdd
              key={current}
              rows={rows.filter((r) => !r.locked)}
              day={current}
              defaultStart={bounds.first}
              defaultEnd={bounds.last}
              onAdd={(row, type, start, end) =>
                setEntries(paint(entries, row, { start, end }, type))
              }
            />
          )}

          <CopyDayDialog
            open={copyOpen}
            onOpenChange={setCopyOpen}
            from={current}
            days={days.filter((d) => d !== current)}
            entries={entries}
            onApply={(targets) => {
              setEntries(
                targets.reduce(
                  (acc, to) => copyDay(acc, current, to, (row) => !rowLocked(row)),
                  entries,
                ),
              );
              setCopyOpen(false);
            }}
          />

          {error && <ErrorAlert>{error}</ErrorAlert>}
          <div className="bg-background sticky bottom-0 z-20 flex items-center justify-between gap-2 border-t py-3">
            <span className="text-sm">
              {dirty ? (
                <span className="font-medium text-amber-700">未保存の変更があります</span>
              ) : (
                '変更はありません（保存済み）'
              )}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!dirty || pending}
                onClick={() => setEntries(saved)}
              >
                元に戻す
              </Button>
              <Button disabled={!editable || !dirty || pending} onClick={() => void save()}>
                {pending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function CopyDayDialog({
  open,
  onOpenChange,
  from,
  days,
  entries,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  from: string;
  days: string[];
  entries: PaintEntry[];
  onApply: (targets: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const filled = (d: string) => entries.some((e) => dateKey(e.start) === d);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked([]);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{md(from)} の入力をコピー</DialogTitle>
          <DialogDescription>
            コピー先の日にすでに入力がある場合は、置き換えられます。保存するまで確定しません。
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {days.map((d) => (
            <li key={d} className="flex items-center gap-2">
              <Checkbox
                id={`copy-${d}`}
                checked={picked.includes(d)}
                onCheckedChange={(v) =>
                  setPicked(v === true ? [...picked, d] : picked.filter((x) => x !== d))
                }
              />
              <Label htmlFor={`copy-${d}`}>
                {md(d)}
                {filled(d) && (
                  <span className="text-muted-foreground ml-2 text-xs">（入力あり→置換）</span>
                )}
              </Label>
            </li>
          ))}
        </ul>
        <Button disabled={picked.length === 0} onClick={() => onApply(picked)}>
          {picked.length} 日にコピー
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ManualAdd({
  rows,
  day,
  defaultStart,
  defaultEnd,
  onAdd,
}: {
  rows: GridRow[];
  day: string;
  defaultStart: number | null;
  defaultEnd: number | null;
  onAdd: (row: number | null, type: 'ng' | 'want' | 'ok', start: number, end: number) => void;
}) {
  const [row, setRow] = useState('ng');
  const [type, setType] = useState<'want' | 'ok'>('want');
  const [start, setStart] = useState(defaultStart ? hm(defaultStart) : '09:00');
  const [end, setEnd] = useState(defaultEnd ? hm(defaultEnd) : '12:00');
  const [error, setError] = useState('');

  function add() {
    const s = new Date(`${day}T${start}`).getTime();
    const e = new Date(`${day}T${end}`).getTime();
    if (!(e > s)) return setError('終了は開始より後にしてください');
    setError('');
    if (row === 'ng') onAdd(null, 'ng', s, e);
    else onAdd(Number(row), type, s, e);
  }

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">時刻を入力して追加</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ma-row">対象</Label>
          <Select value={row} onValueChange={setRow}>
            <SelectTrigger id="ma-row" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rows.map((r) => (
                <SelectItem key={String(r.row)} value={r.row === null ? 'ng' : String(r.row)}>
                  {r.row === null ? '入れない（全部門）' : r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {row !== 'ng' && (
          <div className="grid gap-1.5">
            <Label htmlFor="ma-type">種類</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'want' | 'ok')}>
              <SelectTrigger id="ma-type" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="want">入りたい</SelectItem>
                <SelectItem value="ok">入れる</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="ma-start">開始</Label>
          <Input
            id="ma-start"
            type="time"
            step={300}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ma-end">終了</Label>
          <Input
            id="ma-end"
            type="time"
            step={300}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-32"
          />
        </div>
        <Button type="button" variant="outline" onClick={add}>
          追加
        </Button>
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </details>
  );
}
