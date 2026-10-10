import { Link, useLoaderData } from 'react-router';
import type { AvailabilityData, Me, MyShift } from '../api';
import { Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { hm, mdhm } from '@/lib/datetime';

export type HomeData = { me: Me; availability: AvailabilityData; shifts: MyShift[] };

const when = mdhm;

/** ログイン後の最初の画面。やること（希望入力）と次のシフトを先頭に出す */
export function Home() {
  const { me, availability: a, shifts } = useLoaderData<HomeData>();
  const needsInput = a.departments.length > 0;
  const upcoming = shifts.filter((s) => new Date(s.endsAt).getTime() > Date.now()).slice(0, 3);
  // 締切は部門ごとに違うことがあるので、受付中の部門のうち最も早い締切を出す（希望入力の画面と合わせる）
  const closesAt =
    a.departments
      .filter((d) => d.open && d.closesAt)
      .map((d) => d.closesAt!)
      .sort()[0] ?? null;
  const opensAt =
    a.departments
      .map((d) => d.opensAt)
      .filter((x): x is string => !!x && new Date(x).getTime() > Date.now())
      .sort()[0] ?? null;

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
              {a.open && closesAt
                ? `締切 ${when(closesAt)}`
                : opensAt
                  ? `受付開始 ${when(opensAt)}`
                  : '受付期間外です'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              {a.submittedAt
                ? `入力済み（最終保存 ${when(a.submittedAt)}）`
                : a.open
                  ? '未入力です'
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
              {shifts.length === 0 ? 'まだ公開されていません' : '今後のシフトはありません。'}
            </p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((s) => (
                <li key={s.slotId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="shrink-0 font-medium tabular-nums">
                    {when(s.startsAt)}–{hm(s.endsAt)}
                  </span>
                  <span className="text-right">
                    {s.department}
                    <span className="text-muted-foreground ml-1 text-xs">{s.post}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {shifts.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link to="/shifts">すべてのシフトを見る</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
