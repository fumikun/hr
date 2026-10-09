import { Navigate, useRouteError } from 'react-router';
import { ApiError } from '../api';
import { Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** 読み込みに失敗したときの画面。React Router の英語のエラー画面の代わり */
export function RouteError() {
  const error = useRouteError();
  const status = error instanceof ApiError ? error.status : null;

  // ログインの有効期限切れ
  if (status === 401) return <Navigate to="/login" replace />;

  const message =
    status === 403
      ? 'この画面を開く権限がありません。'
      : error instanceof Error
        ? error.message
        : '予期しないエラーが起きました。';

  return (
    <Page>
      <Card>
        <CardHeader>
          <CardTitle>{status === 403 ? '権限がありません' : '表示できませんでした'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{message}</p>
          <div className="flex gap-2">
            <Button onClick={() => window.location.reload()}>再読み込み</Button>
            <Button variant="outline" asChild>
              <a href="/">ホームへ戻る</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}
