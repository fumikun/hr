import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { fetchDevUsers, postAuthForm, type DevUser } from '../api';

export function Login() {
  const [params] = useSearchParams();
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);
  const error = params.get('error');

  useEffect(() => {
    void fetchDevUsers().then(setDevUsers);
  }, []);

  return (
    <main className="card">
      <h1>高専祭 シフト調整</h1>
      {error && (
        <p role="alert" className="error">
          ログインできませんでした。登録されたアカウントか確認してください。
        </p>
      )}
      {devUsers ? (
        <section>
          <h2>テストアカウントでログイン</h2>
          <ul className="list">
            {devUsers.map((u) => (
              <li key={u.email}>
                <button
                  type="button"
                  onClick={() =>
                    void postAuthForm('/api/auth/callback/credentials', { email: u.email })
                  }
                >
                  {u.name}
                  {u.isAdmin ? '（管理者）' : ''}
                  <small>{u.email}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => void postAuthForm('/api/auth/signin/microsoft-entra-id', {})}
        >
          Microsoftアカウントでログイン
        </button>
      )}
    </main>
  );
}
