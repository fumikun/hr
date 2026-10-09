import { Link, useLoaderData } from 'react-router';
import type { Me } from '../api';
import { Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Home() {
  const me = useLoaderData<Me>();
  return (
    <Page>
      <Card>
        <CardHeader>
          <CardTitle>ようこそ、{me.name}さん</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild>
            <Link to="/availability">シフト希望を入力する</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/shifts">自分のシフトを見る</Link>
          </Button>
          {me.isAdmin && (
            <nav className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/admin/users">ユーザー管理</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/availability">希望入力の受付・状況</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/assign">自動割り当て・手動修正</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/print">印刷・出力</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/audit">操作履歴</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/slots">部門・シフト枠設定</Link>
              </Button>
            </nav>
          )}
          <p className="text-muted-foreground text-sm">
            確定したシフトは「自分のシフトを見る」から確認できます。
          </p>
        </CardContent>
      </Card>
    </Page>
  );
}
