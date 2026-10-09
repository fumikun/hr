import { Link, useLoaderData } from 'react-router';
import type { AvailabilityData, Me, MyShift } from '../api';
import { Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type HomeData = { me: Me; availability: AvailabilityData; shifts: MyShift[] };

const pad = (n: number) => String(n).padStart(2, '0');
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const hm = (iso: string) => `${pad(new Date(iso).getHours())}:${pad(new Date(iso).getMinutes())}`;

/** ログイン後の最初の画面。やること（希望入力）と次のシフトを先頭に出す */
export function Home() {
  const { me, availability: a, shifts } = useLoaderData<HomeData>();
  const needsInput = a.departments.length > 0;
  const upcoming = shifts.filter((s) => new Date(s.endsAt).getTime() > Date.now()).slice(0, 3);

  return (
    <Page>
      <h1 className="text-2xl font-bold">こんにちは、{me.name}さん</h1>

      {needsInput && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              シフト希望の入力
              {a.open ? <Badge>受付中</Badge> : <Badge variant="secondary">受付していません</Badge>}
            </CardTitle>
            <CardDescription>
              {a.open && a.period.closesAt
                ? `締切: ${when(a.period.closesAt)}`
                : a.period.opensAt && new Date(a.period.opensAt).getTime() > Date.now()
                  ? `受付開始: ${when(a.period.opensAt)}`
                  : '受付期間が終了しているか、まだ設定されていません。'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              {a.submittedAt
                ? `入力済み（最終保存 ${when(a.submittedAt)}）。受付期間内は何度でも修正できます。`
                : a.open
                  ? 'まだ入力していません。入れない時間帯と、入りたい時間帯を教えてください。'
                  : '入力の記録はありません。'}
            </p>
            <Button asChild variant={a.open && !a.submittedAt ? 'default' : 'outline'}>
              <Link to="/availability">{a.submittedAt ? '確認・修正する' : '入力する'}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">次のシフト</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {shifts.length === 0
                ? 'シフトが確定すると、ここに表示されます。'
                : '今後のシフトはありません。'}
            </p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((s) => (
                <li key={s.slotId} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium tabular-nums">
                    {when(s.startsAt)}–{hm(s.endsAt)}
                  </span>
                  <span>
                    {s.department}
                    <span className="text-muted-foreground ml-1 text-xs">{s.post}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/shifts">すべてのシフトを見る</Link>
          </Button>
        </CardContent>
      </Card>
    </Page>
  );
}
