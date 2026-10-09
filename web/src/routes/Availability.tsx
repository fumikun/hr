import { useEffect, useMemo, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import { availabilityApi, type AvailabilityData } from '../api';
import { paint, rowOf, type PaintEntry } from '../lib/paint';
import {
  AvailabilityGrid,
  TYPE_LABEL,
  TYPE_STYLE,
  type GridRow,
  type Tool,
} from '@/components/AvailabilityGrid';
import { ErrorAlert, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayStartOf = (key: string) => new Date(`${key}T00:00`).getTime();
const fmtTime = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
    : '未設定';
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

export function Availability() {
  const data = useLoaderData<AvailabilityData>();
  const { revalidate } = useRevalidator();
  const [saved, setSaved] = useState(() => toEntries(data));
  const [entries, setEntries] = useState(saved);
  const [tool, setTool] = useState<Tool>('want');
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = !sameEntries(entries, saved);
  const editable = data.open;

  // 保存せずにページを離れるときの確認
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

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
  const days = useMemo(
    () => [...new Set([...shifts.keys(), ...entries.map((e) => dateKey(e.start))])].sort(),
    [shifts, entries],
  );
  const [day, setDay] = useState(days[0] ?? '');
  const current = days.includes(day) ? day : (days[0] ?? '');

  const rows: GridRow[] = [
    { row: null, label: '入れない', sub: '全部門共通' },
    ...data.departments.map((d) => ({ row: d.id, label: d.name, sub: '入りたい／入れる' })),
  ];

  // 表示する時間帯: その日のシフト枠と入力済みの範囲を含む
  const dayStart = current ? dayStartOf(current) : 0;
  const bounds = useMemo(() => {
    const spans: { start: number; end: number }[] = [
      ...[...(shifts.get(current)?.values() ?? [])].flat(),
      ...entries.filter((e) => dateKey(e.start) === current),
    ];
    const lo = Math.min(...spans.map((s) => s.start - dayStart), 8 * 3_600_000);
    const hi = Math.max(...spans.map((s) => s.end - dayStart), 18 * 3_600_000);
    return {
      startHour: Math.max(0, Math.floor(lo / 3_600_000)),
      endHour: Math.min(24, Math.ceil(hi / 3_600_000)),
    };
  }, [shifts, entries, current, dayStart]);

  const dayEntries = entries
    .filter((e) => dateKey(e.start) === current)
    .sort((a, b) => a.start - b.start);
  const deptName = (id: number | null) =>
    id === null ? '全部門' : (data.departments.find((d) => d.id === id)?.name ?? '?');

  async function save() {
    setBusy(true);
    setError('');
    try {
      await availabilityApi.save(
        entries.map((e) => ({
          type: e.type,
          departmentId: e.departmentId,
          startsAt: new Date(e.start).toISOString(),
          endsAt: new Date(e.end).toISOString(),
        })),
      );
      setSaved(entries);
      toast.success('希望を保存しました。受付期間内は何度でも修正できます。');
      void revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page wide back>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">シフト希望入力</h1>
        <Badge variant={editable ? 'default' : 'secondary'}>
          {editable ? '受付中' : '受付期間外'}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        受付期間: {fmtDateTime(data.period.opensAt)} 〜 {fmtDateTime(data.period.closesAt)}
        {data.submittedAt && ` ／ 最終保存: ${fmtDateTime(data.submittedAt)}`}
      </p>
      {!editable && (
        <ErrorAlert>
          受付期間外のため、入力内容の閲覧のみ可能です。変更が必要な場合は管理者に連絡してください。
        </ErrorAlert>
      )}
      {data.departments.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm">
          あなたにはシフト希望の入力が必要な役職がありません。
        </p>
      ) : days.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm">
          まだシフト枠が作成されていません。管理者が枠を作成するまでお待ちください。
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            何も入力しない時間帯は「入れる」として扱われます。「入れない」時間帯と、特に入りたい時間帯だけ塗ってください。
            灰色の帯はその部門にシフト枠がある時間です。
          </p>

          <div className="bg-background sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <span className="text-sm font-medium">ペン:</span>
            {(
              [
                ['want', '入りたい'],
                ['ok', '入れる'],
                ['erase', '消す'],
              ] as const
            ).map(([t, label]) => (
              <Button
                key={t}
                size="sm"
                variant={tool === t ? 'default' : 'outline'}
                onClick={() => setTool(t)}
              >
                {label}
              </Button>
            ))}
            <span className="text-muted-foreground text-xs">
              「入れない」行は常に「入れない」で塗ります
            </span>
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

          <div className="flex flex-wrap gap-2">
            {days.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === current ? 'default' : 'outline'}
                onClick={() => setDay(d)}
              >
                {d.slice(5).replace('-', '/')}
                {entries.some((e) => dateKey(e.start) === d) && ' ●'}
              </Button>
            ))}
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
            onChange={setEntries}
          />
          <p className="text-muted-foreground text-xs">
            ドラッグで範囲を塗る（5分単位）／クリック・タップで30分を塗る・消す。スマホでは下の「時刻を入力して追加」も使えます。
          </p>

          <ul className="flex flex-wrap gap-2">
            {dayEntries.map((e) => (
              <li
                key={`${e.type}-${e.departmentId}-${e.start}`}
                className={cn(
                  'flex items-center gap-1 rounded border px-2 py-1 text-xs',
                  TYPE_STYLE[e.type],
                )}
              >
                {TYPE_LABEL[e.type]}・{deptName(rowOf(e))} {fmtTime(e.start)}–{fmtTime(e.end)}
                {editable && (
                  <button
                    type="button"
                    className="ml-1 font-bold"
                    aria-label="削除"
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
              rows={rows}
              day={current}
              onAdd={(row, type, start, end) =>
                setEntries(paint(entries, row, { start, end }, type))
              }
            />
          )}

          {error && <ErrorAlert>{error}</ErrorAlert>}
          <div className="bg-background sticky bottom-0 flex items-center justify-between gap-2 border-t py-3">
            <span className="text-sm">
              {dirty ? '未保存の変更があります' : '変更はありません（保存済み）'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!dirty || busy} onClick={() => setEntries(saved)}>
                元に戻す
              </Button>
              <Button disabled={!editable || !dirty || busy} onClick={() => void save()}>
                保存
              </Button>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function ManualAdd({
  rows,
  day,
  onAdd,
}: {
  rows: GridRow[];
  day: string;
  onAdd: (row: number | null, type: 'ng' | 'want' | 'ok', start: number, end: number) => void;
}) {
  const [row, setRow] = useState('ng');
  const [type, setType] = useState<'want' | 'ok'>('want');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [error, setError] = useState('');

  function add() {
    const s = new Date(`${day}T${start}`).getTime();
    const e = new Date(`${day}T${end}`).getTime();
    if (!(e > s)) return setError('終了は開始より後にしてください');
    setError('');
    if (row === 'ng') onAdd(null, 'ng', s, e);
    else onAdd(Number(row), type, s, e);
  }
  const selectCls = 'border-input h-9 rounded-md border bg-transparent px-2 text-sm';

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">時刻を入力して追加</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ma-row">対象</Label>
          <select
            id="ma-row"
            className={selectCls}
            value={row}
            onChange={(e) => setRow(e.target.value)}
          >
            {rows.map((r) => (
              <option key={String(r.row)} value={r.row === null ? 'ng' : String(r.row)}>
                {r.row === null ? '入れない（全部門）' : r.label}
              </option>
            ))}
          </select>
        </div>
        {row !== 'ng' && (
          <div className="grid gap-1.5">
            <Label htmlFor="ma-type">種類</Label>
            <select
              id="ma-type"
              className={selectCls}
              value={type}
              onChange={(e) => setType(e.target.value as 'want' | 'ok')}
            >
              <option value="want">入りたい</option>
              <option value="ok">入れる</option>
            </select>
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
