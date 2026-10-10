import { useState } from 'react';
import {
  scopeApi,
  type Department,
  type Post,
  type ResolvedScope,
  type ScopeLevel,
  type ScopeSetting,
  type ScopesData,
  type ScopeType,
} from '../api';
import { ErrorAlert, Notice } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtDateTime, md, pad } from '@/lib/datetime';
import { useAction } from '@/lib/useAction';
import { cn } from '@/lib/utils';

const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

const LEVEL: Record<ScopeLevel, string> = {
  global: '全体の設定',
  department: '部門の設定',
  post: '持ち場の設定',
};

function phase(r: { opensAt: string | null; closesAt: string | null }) {
  if (!r.opensAt || !r.closesAt) return 'unset' as const;
  const now = Date.now();
  if (now < new Date(r.opensAt).getTime()) return 'before' as const;
  return now < new Date(r.closesAt).getTime() ? ('open' as const) : ('closed' as const);
}
const PHASE_LABEL = {
  unset: '未設定',
  before: '受付前',
  open: '受付中',
  closed: '締切後',
} as const;

/** 調整の対象日。対象は塗りつぶし、対象外は薄く表示する */
/** 対象日を文字で示す。すべての日なら「全日」 */
function DayChips({ eventDays, days }: { eventDays: string[]; days: string[] }) {
  const on = eventDays.filter((d) => days.includes(d));
  return (
    <span className="text-sm">
      {on.length === 0 ? 'なし' : on.length === eventDays.length ? '全日' : on.map(md).join('・')}
    </span>
  );
}

type Target = {
  type: ScopeType;
  id: number;
  name: string;
  /** ひとつ上の設定（個別設定をやめたときに使われる内容） */
  parent: { label: string; opensAt: string | null; closesAt: string | null; days: string[] };
};

function ScopeDialog({
  target,
  setting,
  eventDays,
  onClose,
  onSaved,
}: {
  target: Target | null;
  setting: ScopeSetting | undefined;
  eventDays: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        {target && (
          <ScopeForm
            key={`${target.type}-${target.id}`}
            target={target}
            setting={setting}
            eventDays={eventDays}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScopeForm({
  target,
  setting,
  eventDays,
  onClose,
  onSaved,
}: {
  target: Target;
  setting: ScopeSetting | undefined;
  eventDays: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ownPeriod, setOwnPeriod] = useState(!!(setting?.opensAt || setting?.closesAt));
  const [opens, setOpens] = useState(toLocal(setting?.opensAt ?? target.parent.opensAt));
  const [closes, setCloses] = useState(toLocal(setting?.closesAt ?? target.parent.closesAt));
  const [ownDays, setOwnDays] = useState(!!setting?.days);
  const [days, setDays] = useState<string[]>(setting?.days ?? target.parent.days);
  const [localError, setLocalError] = useState('');
  const { run, pending, error } = useAction();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (ownPeriod && (!opens || !closes))
      return setLocalError('開始と締切の両方を入力してください');
    if (ownPeriod && closes <= opens) return setLocalError('締切は開始より後にしてください');
    if (ownDays && days.length === 0) return setLocalError('対象日を1つ以上選んでください');
    setLocalError('');
    void run(
      () =>
        scopeApi.set(target.type, target.id, {
          opensAt: ownPeriod ? fromLocal(opens) : null,
          closesAt: ownPeriod ? fromLocal(closes) : null,
          days: ownDays ? days : null,
        }),
      { success: '設定を保存しました', onSuccess: onSaved },
    );
  }

  const toggleDay = (d: string, on: boolean) =>
    setDays(on ? [...days, d].sort() : days.filter((x) => x !== d));

  return (
    <form className="space-y-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{target.name} の受付期間と対象日</DialogTitle>
      </DialogHeader>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">希望の受付期間</legend>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={ownPeriod ? 'outline' : 'default'}
            onClick={() => setOwnPeriod(false)}
          >
            {target.parent.label}と同じ
          </Button>
          <Button
            type="button"
            variant={ownPeriod ? 'default' : 'outline'}
            onClick={() => setOwnPeriod(true)}
          >
            個別に設定
          </Button>
        </div>
        {ownPeriod ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sc-opens">開始</Label>
              <Input
                id="sc-opens"
                type="datetime-local"
                value={opens}
                onChange={(e) => setOpens(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sc-closes">締切</Label>
              <Input
                id="sc-closes"
                type="datetime-local"
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {fmtDateTime(target.parent.opensAt)} 〜 {fmtDateTime(target.parent.closesAt)}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">シフト調整の対象日</legend>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={ownDays ? 'outline' : 'default'}
            onClick={() => setOwnDays(false)}
          >
            {target.parent.label}と同じ
          </Button>
          <Button
            type="button"
            variant={ownDays ? 'default' : 'outline'}
            onClick={() => setOwnDays(true)}
          >
            日を選ぶ
          </Button>
        </div>
        {ownDays ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDays([...eventDays])}
              >
                すべての日
              </Button>
              {eventDays.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDays([d])}
                >
                  {md(d)}だけ
                </Button>
              ))}
            </div>
            <ul className="space-y-2">
              {eventDays.map((d) => (
                <li key={d} className="flex items-center gap-2">
                  <Checkbox
                    id={`sd-${d}`}
                    checked={days.includes(d)}
                    onCheckedChange={(v) => toggleDay(d, v === true)}
                  />
                  <Label htmlFor={`sd-${d}`}>{md(d)} を調整の対象にする</Label>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <DayChips eventDays={eventDays} days={target.parent.days} />
        )}
      </fieldset>

      {(localError || error) && <ErrorAlert>{localError || error}</ErrorAlert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          キャンセル
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  );
}

/** イベントの日程（調整の対象にできる日）。日付を足す・外すだけ */
function EventDaysCard({
  days,
  saved,
  onSaved,
}: {
  days: string[];
  saved: boolean;
  onSaved: () => void;
}) {
  const [list, setList] = useState(days);
  const [pick, setPick] = useState('');
  const { run, pending, error } = useAction();
  const dirty = list.join() !== days.join();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">調整する日程</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!saved && (
          <Notice kind="warning">日程が未登録です（枠のある日を仮に使っています）。</Notice>
        )}
        <ul className="flex flex-wrap gap-2">
          {list.map((d) => (
            <li key={d} className="flex items-center gap-1 rounded border px-2 py-1 text-sm">
              {md(d)}
              <button
                type="button"
                aria-label={`${md(d)}を日程から外す`}
                className="-my-1 -mr-1 inline-flex size-8 items-center justify-center rounded sm:size-auto sm:px-1"
                disabled={list.length <= 1}
                onClick={() => setList(list.filter((x) => x !== d))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="追加する日"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="w-44"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!pick || list.includes(pick)}
            onClick={() => {
              setList([...list, pick].sort());
              setPick('');
            }}
          >
            日を追加
          </Button>
          <Button
            disabled={!dirty && saved ? true : pending}
            onClick={() =>
              void run(() => scopeApi.setEventDays(list), {
                success: '日程を保存しました',
                onSuccess: onSaved,
              })
            }
          >
            {pending ? '保存中…' : '日程を保存'}
          </Button>
        </div>
        {error && <ErrorAlert>{error}</ErrorAlert>}
      </CardContent>
    </Card>
  );
}

/** 部門・持ち場ごとの受付期間と対象日。上の設定を引き継ぎ、必要なところだけ個別に変える */
export function ScopeSettings({
  data,
  departments,
  posts,
  onChanged,
}: {
  data: ScopesData;
  departments: Department[];
  posts: Post[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Target | null>(null);
  // 持ち場は、個別の設定があるものだけ最初に出す（ほとんどは部門の設定をそのまま使うため）
  const [allPosts, setAllPosts] = useState(false);
  const ownPost = (id: number) => {
    const r = data.posts.find((x) => x.id === id);
    return !!r && (r.periodFrom === 'post' || r.daysFrom === 'post');
  };
  const hiddenPosts = posts.filter((p) => !ownPost(p.id)).length;
  const raw = (type: ScopeType, id: number) =>
    data.scopes.find((s) => s.type === type && s.id === id);
  const deptRes = (id: number) => data.departments.find((d) => d.id === id)!;
  const globalParent = {
    label: '全体の設定',
    opensAt: data.global.opensAt,
    closesAt: data.global.closesAt,
    days: data.eventDays,
  };

  const row = (name: string, r: ResolvedScope, indent: boolean, target: Target) => {
    const p = phase(r);
    return (
      <TableRow key={`${target.type}-${target.id}`}>
        <TableCell data-primary className={cn(indent && 'sm:pl-8')}>
          {indent && <span className="text-muted-foreground mr-1">└</span>}
          <span className={cn(!indent && 'font-medium')}>{name}</span>
        </TableCell>
        <TableCell data-label="受付期間" className="whitespace-normal">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={p === 'open' ? 'default' : 'secondary'}>{PHASE_LABEL[p]}</Badge>
            <span className="text-sm">
              {fmtDateTime(r.opensAt)} 〜 {fmtDateTime(r.closesAt)}
            </span>
          </div>
          <span className="text-muted-foreground text-xs">{LEVEL[r.periodFrom]}</span>
        </TableCell>
        <TableCell data-label="対象日">
          <DayChips eventDays={data.eventDays} days={r.days} />
          <span className="text-muted-foreground text-xs">{LEVEL[r.daysFrom]}</span>
        </TableCell>
        <TableCell data-actions className="text-right">
          <Button size="sm" variant="outline" onClick={() => setEditing(target)}>
            設定
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">日程と、部門・持ち場ごとの受付期間</h2>
      <EventDaysCard
        key={data.eventDays.join()}
        days={data.eventDays}
        saved={data.eventDaysSaved}
        onSaved={onChanged}
      />
      {hiddenPosts > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="all-posts"
            checked={allPosts}
            onCheckedChange={(v) => setAllPosts(v === true)}
          />
          <Label htmlFor="all-posts" className="font-normal">
            部門の設定をそのまま使っている持ち場も表示する（{hiddenPosts} 件）
          </Label>
        </div>
      )}
      <div className="bg-card rounded-lg border">
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead>部門／持ち場</TableHead>
              <TableHead>希望の受付期間</TableHead>
              <TableHead>調整の対象日</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((d) => {
              const dr = deptRes(d.id);
              return [
                row(d.name, dr, false, {
                  type: 'department',
                  id: d.id,
                  name: d.name,
                  parent: globalParent,
                }),
                ...posts
                  .filter((p) => p.departmentId === d.id && (allPosts || ownPost(p.id)))
                  .map((p) =>
                    row(
                      p.name,
                      data.posts.find((x) => x.id === p.id)!,
                      true,
                      {
                        type: 'post',
                        id: p.id,
                        name: `${d.name} / ${p.name}`,
                        parent: {
                          label: `${d.name}の設定`,
                          opensAt: dr.opensAt,
                          closesAt: dr.closesAt,
                          days: dr.days,
                        },
                      },
                    ),
                  ),
              ];
            })}
          </TableBody>
        </Table>
      </div>
      <ScopeDialog
        target={editing}
        setting={editing ? raw(editing.type, editing.id) : undefined}
        eventDays={data.eventDays}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </section>
  );
}
