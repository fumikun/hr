import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { confirmOnboarding, type Onboarding as OnboardingData } from '../api';
import { ErrorAlert, Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAction } from '@/lib/useAction';

export function Onboarding() {
  const { roles } = useLoaderData<OnboardingData>();
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();
  const { run, pending, error } = useAction();
  const none = roles.length === 0;

  const submit = () => run(confirmOnboarding, { onSuccess: () => void navigate('/') });

  return (
    <Page>
      <Card>
        <CardHeader>
          <CardTitle>{none ? 'はじめに' : 'シフト希望の入力が必要な役職'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {none ? (
            <p className="text-sm">
              あなたにシフト希望の入力が必要な役職はありません。公開したシフトは「自分のシフト」で確認できます。
            </p>
          ) : (
            <>
              <ul className="list-disc pl-5">
                {roles.map((r) => (
                  <li key={r.departmentId}>{r.name}</li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="confirm"
                  checked={checked}
                  onCheckedChange={(v) => setChecked(v === true)}
                />
                <Label htmlFor="confirm">上記の内容を確認しました</Label>
              </div>
            </>
          )}
          {error && <ErrorAlert>{error}</ErrorAlert>}
        </CardContent>
        <CardFooter>
          <Button disabled={(!none && !checked) || pending} onClick={() => void submit()}>
            {none ? 'はじめる' : '確認して進む'}
          </Button>
        </CardFooter>
      </Card>
    </Page>
  );
}
