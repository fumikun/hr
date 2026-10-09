import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { confirmOnboarding, type Onboarding as OnboardingData } from '../api';

export function Onboarding() {
  const { roles } = useLoaderData<OnboardingData>();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    setBusy(true);
    try {
      await confirmOnboarding();
      await navigate('/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>シフト希望の入力が必要な役職</h1>
      {roles.length === 0 ? (
        <p>あなたにシフト希望の入力が必要な役職はありません。</p>
      ) : (
        <ul>
          {roles.map((r) => (
            <li key={r.departmentId}>{r.name}</li>
          ))}
        </ul>
      )}
      <label>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        上記の内容を確認しました
      </label>
      <button type="button" disabled={!checked || busy} onClick={() => void submit()}>
        確認して進む
      </button>
    </main>
  );
}
