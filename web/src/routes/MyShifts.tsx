import { useLoaderData } from 'react-router';
import type { MyShift } from '../api';
import { Page } from '@/components/Page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

export function MyShifts() {
  const shifts = useLoaderData<MyShift[]>();
  const days = [...new Set(shifts.map((s) => dayLabel(s.startsAt)))];
  const totalMin = shifts.reduce(
    (n, s) => n + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60_000,
    0,
  );

  return (
    <Page back>
      <h1 className="text-2xl font-bold">自分のシフト</h1>
      {shifts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm">
          確定したシフトはまだありません。確定されるとここに表示されます。
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            合計 {shifts.length} 枠 ／ {Math.round((totalMin / 60) * 10) / 10} 時間
          </p>
          {days.map((day) => (
            <Card key={day} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-base">{day}</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <ul className="divide-y">
                  {shifts
                    .filter((s) => dayLabel(s.startsAt) === day)
                    .map((s) => (
                      <li key={s.slotId} className="flex items-center justify-between py-2">
                        <span className="text-lg font-medium tabular-nums">
                          {hm(s.startsAt)}–{hm(s.endsAt)}
                        </span>
                        <span className="text-right text-sm">
                          {s.department}
                          <span className="text-muted-foreground block text-xs">{s.post}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </Page>
  );
}
