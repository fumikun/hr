import type { MyShift } from '../api';

const fmt = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** 自分のシフトをカレンダーアプリに取り込める .ics 形式にする（時刻は UTC で出力） */
export function buildIcs(shifts: MyShift[]): string {
  const now = fmt(new Date().toISOString());
  const events = shifts.flatMap((s) => [
    'BEGIN:VEVENT',
    `UID:shift-${s.slotId}@hr.nara-kosensai.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmt(s.startsAt)}`,
    `DTEND:${fmt(s.endsAt)}`,
    `SUMMARY:${esc(`高専祭シフト（${s.department} ${s.post}）`)}`,
    'END:VEVENT',
  ]);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//kosensai-shift//JP',
    ...events,
    'END:VCALENDAR',
  ]
    .join('\r\n')
    .concat('\r\n');
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
