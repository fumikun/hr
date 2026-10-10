import { CalendarPlus } from 'lucide-react';
import { useLoaderData } from 'react-router';
import type { MyShifts as MyShiftsData } from '../api';
import { buildIcs, downloadText } from '../lib/ics';
import { Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dateKey, hm, hoursLabel, md, mdhm, minutesBetween } from '@/lib/datetime';
import { cn } from '@/lib/utils';

export function MyShifts() {
  const { shifts, publishedAt } = useLoaderData<MyShiftsData>();
  const now = Date.now();
  const isPast = (s: { endsAt: string }) => new Date(s.endsAt).getTime() <= now;
  const next = shifts.find((s) => !isPast(s));
  const days = [...new Set(shifts.map((s) => dateKey(s.startsAt)))];
  const totalMin = shifts.reduce((n, s) => n + minutesBetween(s.startsAt, s.endsAt), 0);

  return (
    <Page>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">自分のシフト</h1>
      </div>
      {shifts.length === 0 ? (
        <Notice kind="info">公開されたシフトはまだありません。</Notice>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            合計 {shifts.length} 枠 ／ {hoursLabel(totalMin)}
            {publishedAt && ` 最終更新: ${mdhm(publishedAt)}`}
          </p>
          {days.map((day) => (
            <Card key={day} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-base">{md(day)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <ul className="divide-y">
                  {shifts
                    .filter((s) => dateKey(s.startsAt) === day)
                    .map((s) => (
                      <li
                        key={s.slotId}
                        className={cn(
                          'flex items-center justify-between gap-3 py-2',
                          isPast(s) && 'opacity-50',
                        )}
                      >
                        <span className="flex shrink-0 items-center gap-2 text-lg font-medium tabular-nums">
                          {hm(s.startsAt)}–{hm(s.endsAt)}
                          {s === next && <Badge>次</Badge>}
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
          {shifts.length > 0 && (
            <Button
              variant="outline"
              className="w-full sm:w-fit"
              onClick={() => downloadText('my-shifts.ics', buildIcs(shifts), 'text/calendar')}
            >
              <CalendarPlus className="size-4" aria-hidden />
              カレンダーに追加
            </Button>
          )}
        </>
      )}
    </Page>
  );
}
