import { useState } from 'react';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import { periodApi, type InputStatus, type Period } from '../api';
import { ErrorAlert, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type AdminAvailabilityData = { period: Period; status: InputStatus[] };

const pad = (n: number) => String(n).padStart(2, '0');
// ISO → <input type="datetime-local"> の値（ローカル時刻）
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '';

export function AdminAvailability() {
  const { period, status } = useLoaderData<AdminAvailabilityData>();
  const { revalidate } = useRevalidator();
  const [opens, setOpens] = useState(toLocal(period.opensAt));
  const [closes, setCloses] = useState(toLocal(period.closesAt));
  const [error, setError] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (opens && closes && closes <= opens) return setError('締切は開始より後にしてください');
    try {
      await periodApi.put({ opensAt: fromLocal(opens), closesAt: fromLocal(closes) });
      toast.success('受付期間を保存しました');
      void revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const required = status.filter((s) => s.required);
  const submitted = required.filter((s) => s.submittedAt).length;
  const rows = (onlyMissing ? required.filter((s) => !s.submittedAt) : status).filter(
    (s) => s.required || !onlyMissing,
  );

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">希望入力の受付・状況</h1>
      <Card>
        <CardHeader>
          <CardTitle>受付期間</CardTitle>
          <CardDescription>
            開始と締切の両方を設定すると受付が始まります。締切後、一般ユーザーは編集できません（管理者は常に編集可）。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void save(e)}>
            <div className="grid gap-1.5">
              <Label htmlFor="opens">開始</Label>
              <Input
                id="opens"
                type="datetime-local"
                value={opens}
                onChange={(e) => setOpens(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="closes">締切</Label>
              <Input
                id="closes"
                type="datetime-local"
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
              />
            </div>
            <Button type="submit">保存</Button>
          </form>
          {error && <ErrorAlert>{error}</ErrorAlert>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          入力状況: {submitted} / {required.length} 人が保存済み
        </h2>
        <div className="flex items-center gap-2">
          <Checkbox
            id="missing"
            checked={onlyMissing}
            onCheckedChange={(v) => setOnlyMissing(v === true)}
          />
          <Label htmlFor="missing">未入力の人だけ表示</Label>
        </div>
      </div>
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>氏名</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>状況</TableHead>
              <TableHead>最終保存</TableHead>
              <TableHead>入力数</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.userId}>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.email}</TableCell>
                <TableCell>
                  {!s.required ? (
                    <Badge variant="outline">入力不要</Badge>
                  ) : s.submittedAt ? (
                    <Badge>保存済み</Badge>
                  ) : (
                    <Badge variant="destructive">未入力</Badge>
                  )}
                </TableCell>
                <TableCell>{fmt(s.submittedAt)}</TableCell>
                <TableCell>{s.entryCount}</TableCell>
                <TableCell className="text-right">
                  {s.required && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/admin/users/${s.userId}/availability`}>代理入力</Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-center">
                  該当する人はいません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Page>
  );
}
