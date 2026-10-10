import { useMemo, useState } from 'react';
import { useLoaderData } from 'react-router';
import type { AdminAssignData } from './AdminAssign';
import { downloadText } from '../lib/ics';
import { Notice, Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dateKey, hm, hoursLabel, md, mdhm, minutesBetween } from '@/lib/datetime';
import { useQueryParam } from '@/lib/useQueryParam';

type Mode = 'dept' | 'person' | 'all';
const cell = 'border border-black/60 px-2 py-1 align-top';
const range = (s: { startsAt: string; endsAt: string }) => `${hm(s.startsAt)}–${hm(s.endsAt)}`;
const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function AdminPrint() {
  const { departments, posts, slots, users, assign } = useLoaderData<AdminAssignData>();
  const [modeParam, setMode] = useQueryParam('mode');
  const [deptParam, setDept] = useQueryParam('dept');
  const [dayParam, setDay] = useQueryParam('day');
  const [includeDraft, setIncludeDraft] = useState(false);
  const [onePerPage, setOnePerPage] = useState(false);
  const [printedAt] = useState(() => new Date());
  const mode: Mode = modeParam === 'person' || modeParam === 'all' ? modeParam : 'dept';

  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const shown = assign.assignments.filter((a) => includeDraft || a.status === 'confirmed');
  const hasDraft = shown.some((a) => a.status === 'draft');
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const peopleIn = (slotId: number) =>
    shown.filter((a) => a.slotId === slotId).map((a) => nameOf.get(a.userId) ?? '?');
  const deptName = (id: number) => departments.find((d) => d.id === id)?.name ?? '';
  const postName = (id: number) => posts.find((p) => p.id === id)?.name ?? '';

  const dept = deptParam ? Number(deptParam) : null;
  const allDays = [...new Set(slots.map((s) => dateKey(s.startsAt)))].sort();
  const sorted = [...slots]
    .filter((s) => dept === null || s.departmentId === dept)
    .filter((s) => !dayParam || dateKey(s.startsAt) === dayParam)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.postId - b.postId);
  const inScope = new Set(sorted.map((s) => s.id));

  const filename = (kind: string) => `shift-${kind}-${includeDraft ? 'draft' : 'confirmed'}.csv`;
  function downloadAllCsv() {
    const lines = [
      ['日付', '開始', '終了', '部門', '持ち場', '担当者'].join(','),
      ...sorted.map((s) =>
        [
          dateKey(s.startsAt),
          hm(s.startsAt),
          hm(s.endsAt),
          deptName(s.departmentId),
          postName(s.postId),
          peopleIn(s.id).join('・'),
        ]
          .map(q)
          .join(','),
      ),
    ];
    downloadText(filename('all'), '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function downloadPersonCsv() {
    const lines = [['氏名', '日付', '開始', '終了', '部門', '持ち場'].join(',')];
    for (const u of users) {
      for (const a of shown.filter((x) => x.userId === u.id)) {
        const s = slotById.get(a.slotId);
        if (!s || !inScope.has(s.id)) continue;
        lines.push(
          [
            u.name,
            dateKey(s.startsAt),
            hm(s.startsAt),
            hm(s.endsAt),
            deptName(s.departmentId),
            postName(s.postId),
          ]
            .map(q)
            .join(','),
        );
      }
    }
    downloadText(filename('person'), '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  return (
    <Page wide>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="mr-auto text-2xl font-bold">印刷・出力</h1>
        <Tabs value={mode} onValueChange={(v) => setMode(v === 'dept' ? null : v)}>
          <TabsList>
            <TabsTrigger value="dept">部門別時間割</TabsTrigger>
            <TabsTrigger value="person">個人別</TabsTrigger>
            <TabsTrigger value="all">全体一覧</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Select value={deptParam ?? 'all'} onValueChange={(v) => setDept(v === 'all' ? null : v)}>
          <SelectTrigger className="w-40" aria-label="部門で絞り込み">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての部門</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dayParam ?? 'all'} onValueChange={(v) => setDay(v === 'all' ? null : v)}>
          <SelectTrigger className="w-40" aria-label="日付で絞り込み">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての日</SelectItem>
            {allDays.map((d) => (
              <SelectItem key={d} value={d}>
                {md(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox
            id="draft"
            checked={includeDraft}
            onCheckedChange={(v) => setIncludeDraft(v === true)}
          />
          <Label htmlFor="draft">未公開も含める</Label>
        </div>
        {mode === 'person' && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="one"
              checked={onePerPage}
              onCheckedChange={(v) => setOnePerPage(v === true)}
            />
            <Label htmlFor="one">1人1枚で印刷</Label>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button onClick={() => window.print()}>印刷</Button>
        {/* 表示中の形式に合わせて、個人別か全体一覧の CSV を保存する */}
        <Button variant="outline" onClick={mode === 'person' ? downloadPersonCsv : downloadAllCsv}>
          CSVで保存
        </Button>
      </div>
      {!includeDraft && shown.length === 0 && (
        <Notice kind="warning" className="print:hidden">
          公開されたシフトがありません。
        </Notice>
      )}
      {includeDraft && hasDraft && (
        <Notice kind="warning" className="print:hidden">
          未公開の割り当てを含んでいます（印刷物に「未公開」の透かしが入ります）。
        </Notice>
      )}

      {/* 印刷物の見出し。公開版か未公開かを紙の上でも分かるようにする */}
      <div className="hidden items-baseline justify-between border-b border-black pb-1 print:flex">
        <b>高専祭 シフト表（{hasDraft ? '未公開' : '公開版'}）</b>
        <span className="text-sm">{mdhm(printedAt)} 時点</span>
      </div>
      {hasDraft && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 hidden items-center justify-center print:flex"
        >
          <span className="-rotate-30 text-9xl font-black tracking-widest text-black/10">
            未公開
          </span>
        </div>
      )}

      {mode === 'dept' &&
        departments
          .filter((d) => dept === null || d.id === dept)
          .map((d) => {
            const dSlots = sorted.filter((s) => s.departmentId === d.id);
            const days = [...new Set(dSlots.map((s) => dateKey(s.startsAt)))];
            const dPosts = posts.filter(
              (p) => p.departmentId === d.id && dSlots.some((s) => s.postId === p.id),
            );
            if (days.length === 0) return null;
            return (
              <section key={d.id} className="space-y-4 break-before-page first:break-before-auto">
                <h2 className="text-xl font-bold">{d.name} シフト表</h2>
                {days.map((day) => {
                  const daySlots = dSlots.filter((s) => dateKey(s.startsAt) === day);
                  const rows = [...new Set(daySlots.map(range))];
                  return (
                    <div key={day} className="break-inside-avoid">
                      <h3 className="mb-1 font-semibold">{md(day)}</h3>
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr>
                            <th className={`${cell} w-28 bg-gray-100`}>時間</th>
                            {dPosts.map((p) => (
                              <th key={p.id} className={`${cell} bg-gray-100`}>
                                {p.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r}>
                              <td className={`${cell} whitespace-nowrap tabular-nums`}>{r}</td>
                              {dPosts.map((p) => {
                                const s = daySlots.find((x) => x.postId === p.id && range(x) === r);
                                return (
                                  <td key={p.id} className={cell}>
                                    {s ? (
                                      peopleIn(s.id).join('、') || (
                                        <span className="text-gray-400">（未定）</span>
                                      )
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </section>
            );
          })}

      {mode === 'person' &&
        users
          .filter((u) => shown.some((a) => a.userId === u.id && inScope.has(a.slotId)))
          .map((u) => {
            const mine = shown
              .filter((a) => a.userId === u.id && inScope.has(a.slotId))
              .map((a) => slotById.get(a.slotId)!)
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            const total = mine.reduce((n, s) => n + minutesBetween(s.startsAt, s.endsAt), 0);
            return (
              <section
                key={u.id}
                className={`space-y-1 rounded border border-black/40 p-3 break-inside-avoid ${
                  onePerPage ? 'print:break-after-page' : ''
                }`}
              >
                <h2 className="text-lg font-bold">
                  {u.name}
                  <span className="ml-3 text-sm font-normal">
                    合計 {mine.length} 枠 / {hoursLabel(total)}
                  </span>
                </h2>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {mine.map((s) => (
                      <tr key={s.id}>
                        <td className={cell}>{md(s.startsAt)}</td>
                        <td className={`${cell} tabular-nums`}>{range(s)}</td>
                        <td className={cell}>
                          {deptName(s.departmentId)}／{postName(s.postId)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}

      {mode === 'all' && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              {['日付', '時間', '部門', '持ち場', '担当者'].map((h) => (
                <th key={h} className={cell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id} className="break-inside-avoid">
                <td className={cell}>{md(s.startsAt)}</td>
                <td className={`${cell} whitespace-nowrap tabular-nums`}>{range(s)}</td>
                <td className={cell}>{deptName(s.departmentId)}</td>
                <td className={cell}>{postName(s.postId)}</td>
                <td className={cell}>{peopleIn(s.id).join('、')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}
