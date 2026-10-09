import { useLoaderData } from 'react-router';
import type { Me } from '../api';

export function Home() {
  const me = useLoaderData<Me>();
  return (
    <main className="card">
      <h1>ようこそ、{me.name}さん</h1>
      <p>希望入力・シフト確認の画面はこれから実装します。</p>
    </main>
  );
}
