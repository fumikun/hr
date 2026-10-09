import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { confirmOnboarding, type Onboarding as OnboardingData } from '../api';
import { Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

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
    <Page>
      <Card>
        <CardHeader>
          <CardTitle>シフト希望の入力が必要な役職</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {roles.length === 0 ? (
            <p>あなたにシフト希望の入力が必要な役職はありません。</p>
          ) : (
            <ul className="list-disc pl-5">
              {roles.map((r) => (
                <li key={r.departmentId}>{r.name}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="confirm"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
            />
            <Label htmlFor="confirm">上記の内容を確認しました</Label>
          </div>
        </CardContent>
        <CardFooter>
          <Button disabled={!checked || busy} onClick={() => void submit()}>
            確認して進む
          </Button>
        </CardFooter>
      </Card>
    </Page>
  );
}
