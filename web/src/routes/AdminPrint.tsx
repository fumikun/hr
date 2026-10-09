import { useMemo, useState } from 'react';
import { useLoaderData } from 'react-router';
import type { AdminAssignData } from './AdminAssign';
import { Page } from '@/components/Page';
import { Button } from '@/components/ui/button';

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayLabel = (key: string) =>
  new Date(`${key}T00:00`).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const range = (s: { startsAt: string; endsAt: string }) => `${hm(s.startsAt)}–${hm(s.endsAt)}`;
const minutes = (s: { startsAt: string; endsAt: string }) =>
  (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60_000;

type Mode = 'dept' | 'person' | 'all';
const cell = 'border border-black/60 px-2 py-1 align-top';

export function AdminPrint() {
  const { departments, posts, slots, users, assign } = useLoaderData<AdminAssignData>();
  const [mode, setMode] = useState<Mode>('dept');
  const [includeDraft, setIncludeDraft] = useState(false);

  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const shown = assign.assignments.filter((a) => includeDraft || a.status === 'confirmed');
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const peopleIn = (slotId: number) =>
    shown.filter((a) => a.slotId === slotId).map((a) => nameOf.get(a.userId) ?? '?');
  const deptName = (id: number) => departments.find((d) => d.id === id)?.name ?? '';
  const postName = (id: number) => posts.find((p) => p.id === id)?.name ?? '';
  const sorted = [...slots].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.postId - b.postId,
  );

  function downloadCsv() {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
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
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shift-${includeDraft ? 'draft' : 'confirmed'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Page wide back>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="mr-auto text-2xl font-bold">印刷・出力</h1>
        {(
          [
            ['dept', '部門別時間割'],
            ['person', '個人別'],
            ['all', '全体一覧'],
          ] as const
        ).map(([m, label]) => (
          <Button key={m} variant={mode === m ? 'default' : 'outline'} onClick={() => setMode(m)}>
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeDraft}
            onChange={(e) => setIncludeDraft(e.target.checked)}
          />
          下書き（未確定）の割り当ても含める
        </label>
        <Button onClick={() => window.print()}>印刷</Button>
        <Button variant="outline" onClick={downloadCsv}>
          CSVで保存
        </Button>
        {!includeDraft && shown.length === 0 && (
          <span className="text-destructive text-sm">確定したシフトがありません</span>
        )}
      </div>

      {mode === 'dept' &&
        departments.map((d) => {
          const dSlots = sorted.filter((s) => s.departmentId === d.id);
          const days = [...new Set(dSlots.map((s) => dateKey(s.startsAt)))];
          const dPosts = posts.filter(
            (p) => p.departmentId === d.id && dSlots.some((s) => s.postId === p.id),
          );
          if (days.length === 0) return null;
          return (
            <section key={d.id} className="break-before-page space-y-4 first:break-before-auto">
              <h2 className="text-xl font-bold">{d.name} シフト表</h2>
              {days.map((day) => {
                const daySlots = dSlots.filter((s) => dateKey(s.startsAt) === day);
                const rows = [...new Set(daySlots.map(range))];
                return (
                  <div key={day} className="break-inside-avoid">
                    <h3 className="mb-1 font-semibold">{dayLabel(day)}</h3>
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
          .filter((u) => shown.some((a) => a.userId === u.id))
          .map((u) => {
            const mine = shown
              .filter((a) => a.userId === u.id)
              .map((a) => slotById.get(a.slotId)!)
              .filter(Boolean)
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            const total = mine.reduce((n, s) => n + minutes(s), 0);
            return (
              <section
                key={u.id}
                className="break-inside-avoid space-y-1 rounded border border-black/40 p-3"
              >
                <h2 className="font-bold">
                  {u.name}
                  <span className="ml-3 text-sm font-normal">
                    合計 {mine.length} 枠 / {Math.round((total / 60) * 10) / 10} 時間
                  </span>
                </h2>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {mine.map((s) => (
                      <tr key={s.id}>
                        <td className={cell}>{dayLabel(dateKey(s.startsAt))}</td>
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
                <td className={cell}>{dayLabel(dateKey(s.startsAt))}</td>
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
