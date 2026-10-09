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
          {me.isAdmin && (
            <nav className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/admin/users">ユーザー管理</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/slots">部門・シフト枠設定</Link>
              </Button>
            </nav>
          )}
          <p className="text-muted-foreground text-sm">
            希望入力・シフト確認の画面はこれから実装します。
          </p>
        </CardContent>
      </Card>
    </Page>
  );
}
