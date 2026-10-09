import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { fetchDevUsers, postAuthForm, type DevUser } from '../api';
import { ErrorAlert, Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Login() {
  const [params] = useSearchParams();
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);
  const error = params.get('error');

  useEffect(() => {
    void fetchDevUsers().then(setDevUsers);
  }, []);

  return (
    <Page>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">高専祭 シフト調整</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <ErrorAlert>
              ログインできませんでした。登録されたアカウントか確認してください。
            </ErrorAlert>
          )}
          {devUsers ? (
            <>
              <h2 className="font-medium">テストアカウントでログイン</h2>
              <ul className="grid gap-2">
                {devUsers.map((u) => (
                  <li key={u.email}>
                    <Button
                      variant="outline"
                      className="h-auto w-full flex-col items-start py-2"
                      onClick={() =>
                        void postAuthForm('/api/auth/callback/credentials', { email: u.email })
                      }
                    >
                      <span>
                        {u.name}
                        {u.isAdmin ? '（管理者）' : ''}
                      </span>
                      <span className="text-muted-foreground text-xs font-normal">{u.email}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Button
              className="w-full"
              onClick={() => void postAuthForm('/api/auth/signin/microsoft-entra-id', {})}
            >
              Microsoftアカウントでログイン
            </Button>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
