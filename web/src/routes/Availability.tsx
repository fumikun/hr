import {
  AvailabilityGrid,
  TYPE_LABEL,
  TYPE_STYLE,
  type GridRow,
} from '@/components/AvailabilityGrid';
import { useConfirm } from '@/components/ConfirmDialog';
import { ErrorAlert, Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dateKey, fmtDateTime, hm, md } from '@/lib/datetime';
import { useAction } from '@/lib/useAction';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useLoaderData, useParams, useRevalidator } from 'react-router';
import { adminAvailabilityApi, availabilityApi, type AvailabilityData } from '../api';
import { paint, rowOf, type PaintEntry } from '../lib/paint';

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

/** マスの見方 */
function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <li className="flex items-center gap-1.5">
        <span className="text-muted-foreground inline-flex h-5 w-8 items-center justify-center rounded border border-dashed">
          ○
        </span>
        入れる
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-flex h-5 w-8 items-center justify-center rounded border',
            TYPE_STYLE.want,
          )}
        >
          ◎
        </span>
        入りたい
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-flex h-5 w-8 items-center justify-center rounded border',
            TYPE_STYLE.ng,
          )}
        >
          ×
        </span>
        入れない
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
  const dirty = !sameEntries(entries, saved);
  const editable = proxyFor !== null || data.open;

  const submitted = !!data.submittedAt;
  const toDto = (list: PaintEntry[]) =>
    list.map((e) => ({
      type: e.type,
      departmentId: e.departmentId,
      startsAt: new Date(e.start).toISOString(),
      endsAt: new Date(e.end).toISOString(),
    }));

  // 提出済みの人は、操作の1秒後に自動で保存する。失敗したときは保存ボタンで再送できる
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  useEffect(() => {
    if (!dirty || !submitted || !editable) return;
    const snapshot = entries;
    const t = setTimeout(() => {
      setAutoState('saving');
      const call =
        proxyFor !== null
          ? adminAvailabilityApi.save(proxyFor, toDto(snapshot))
          : availabilityApi.save(toDto(snapshot));
      call.then(
        () => {
          setSaved(snapshot);
          setAutoState('saved');
        },
        () => setAutoState('failed'),
      );
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, dirty, submitted, editable, proxyFor]);

  // 未提出の人は、入力途中の内容を端末に一時保存して、開き直したときに続きから再開できるようにする
  const draftKey = `availability-draft:${proxyFor ?? 'me'}`;
  const [draft, setDraft] = useState<PaintEntry[] | null>(null);
  useEffect(() => {
    if (submitted || !editable) return;
    try {
      const raw = localStorage.getItem(draftKey);
      const parsed = raw ? (JSON.parse(raw) as PaintEntry[]) : null;
      if (parsed && parsed.length > 0 && !sameEntries(parsed, saved)) setDraft(parsed);
    } catch {
      /* 端末に保存できない環境では何もしない */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (submitted || !dirty) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(entries));
    } catch {
      /* 同上 */
    }
  }, [entries, dirty, submitted, draftKey]);

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
    { row: null, label: '入れない', sub: '全部門共通 ×', locked: !editable },
    ...data.departments.map((d) => {
      const locked = proxyFor === null && !d.open;
      return {
        row: d.id,
        label: d.name,
        sub: locked ? '受付終了' : '入りたい ◎',
        locked,
      };
    }),
  ];

  const rowLocked = (row: number | null) => rows.find((r) => r.row === row)?.locked ?? false;

  // 枠の外にある入力（以前の自由な塗り方の名残など）。マスに出ないので、ここで見せて消せるようにする
  const dayShifts = shifts.get(current) ?? new Map<number, { start: number; end: number }[]>();
  const allDaySpans = [...dayShifts.values()].flat();
  const offGrid = entries
    .filter((e) => dateKey(e.start) === current)
    .filter((e) => {
      const spans = rowOf(e) === null ? allDaySpans : (dayShifts.get(e.departmentId!) ?? []);
      return !spans.some((s) => s.start < e.end && e.start < s.end);
    })
    .sort((a, b) => a.start - b.start);
  const deptName = (id: number | null) =>
    id === null ? '全部門' : (data.departments.find((d) => d.id === id)?.name ?? '?');

  const save = () =>
    run(
      async () => {
        const dto = toDto(entries);
        if (proxyFor !== null) await adminAvailabilityApi.save(proxyFor, dto);
        else await availabilityApi.save(dto);
        setSaved(entries);
        setAutoState('idle');
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* 同上 */
        }
      },
      {
        success: submitted ? '保存しました' : '提出しました',
        onSuccess: () => void revalidate(),
      },
    );

  const periodGroups = [
    ...data.departments
      .reduce((m, d) => {
        const key = `${d.open}|${d.opensAt}|${d.closesAt}`;
        const g = m.get(key);
        if (g) g.names += `・${d.name}`;
        else
          m.set(key, {
            key,
            names: d.name,
            open: d.open,
            opensAt: d.opensAt,
            closesAt: d.closesAt,
          });
        return m;
      }, new Map<string, { key: string; names: string; open: boolean; opensAt: string | null; closesAt: string | null }>())
      .values(),
  ];

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
        {proxyFor !== null && <Badge variant="outline">管理者による代理入力</Badge>}
      </div>
      {/* 受付期間は、部門ごとに同じなら1行にまとめる。対象日は下の日付ボタンで分かるので出さない */}
      <ul className="text-muted-foreground text-sm">
        {periodGroups.map((g) => (
          <li key={g.key}>
            {periodGroups.length > 1 && <span className="text-foreground">{g.names}：</span>}
            {g.open
              ? `締切 ${fmtDateTime(g.closesAt)}`
              : `受付 ${fmtDateTime(g.opensAt)} 〜 ${fmtDateTime(g.closesAt)}（受付外）`}
          </li>
        ))}
        {data.submittedAt && <li>最終保存 {fmtDateTime(data.submittedAt)}</li>}
      </ul>
      {!editable && (
        <Notice kind="info" title="受付期間外です">
          入力内容は変更できません。
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
        <Notice kind="info">調整の対象日がまだ決まっていません。</Notice>
      ) : (
        <>
          {draft && (
            <Notice kind="info" title="保存していない入力があります">
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    setEntries(draft);
                    setDraft(null);
                  }}
                >
                  続ける
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    try {
                      localStorage.removeItem(draftKey);
                    } catch {
                      /* 同上 */
                    }
                    setDraft(null);
                  }}
                >
                  削除する
                </Button>
              </div>
            </Notice>
          )}
          <Legend />

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
          </div>

          <AvailabilityGrid
            rows={rows}
            entries={entries}
            shifts={dayShifts}
            disabled={!editable}
            onChange={setEntries}
          />

          {offGrid.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">シフト枠の外の入力</p>
              <ul className="flex flex-wrap gap-2">
                {offGrid.map((e) => (
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
              </ul>
            </div>
          )}

          {error && <ErrorAlert>{error}</ErrorAlert>}
          <div className="bg-background sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-3">
            <span className="min-w-0 flex-1 basis-48 text-sm">
              {dirty && submitted && autoState !== 'failed' ? (
                <span className="text-muted-foreground">保存しています…</span>
              ) : dirty ? (
                <span className="font-medium text-amber-700">
                  {autoState === 'failed'
                    ? '自動保存に失敗しました。保存を押してください'
                    : '未保存の変更があります'}
                </span>
              ) : submitted && autoState === 'saved' ? (
                '保存しました ✓'
              ) : submitted ? (
                '変更はありません（保存済み）'
              ) : (
                '未提出'
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
              <Button
                disabled={!editable || (submitted && !dirty) || pending}
                onClick={() => void save()}
              >
                {pending ? '送信中…' : submitted ? '変更を保存' : '提出する'}
              </Button>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
