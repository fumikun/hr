import { useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import {
  adminApi,
  CsvImportError,
  type AdminUser,
  type CsvError,
  type Department,
  type UserInput,
} from '../api';
import { ErrorAlert, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';

export type AdminUsersData = { users: AdminUser[]; departments: Department[] };

const empty: UserInput = {
  email: '',
  name: '',
  isAdmin: false,
  targetMinutes: null,
  maxMinutes: null,
  roles: [],
};

// 分 ⇔ 時間（フォームは時間単位で入力）
const toHours = (m: number | null) => (m === null ? '' : String(m / 60));
const fromHours = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 60));

function UserForm({
  initial,
  departments,
  onSaved,
  onCancel,
  save,
}: {
  initial: UserInput;
  departments: Department[];
  onSaved: () => void;
  onCancel: () => void;
  save: (u: UserInput) => Promise<unknown>;
}) {
  const [u, setU] = useState(initial);
  const [target, setTarget] = useState(toHours(initial.targetMinutes));
  const [max, setMax] = useState(toHours(initial.maxMinutes));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const role = (id: number) => u.roles.find((r) => r.departmentId === id);
  const toggleDept = (id: number, on: boolean) =>
    setU({
      ...u,
      roles: on
        ? [...u.roles, { departmentId: id, requiresAvailability: true }]
        : u.roles.filter((r) => r.departmentId !== id),
    });
  const setRequires = (id: number, v: boolean) =>
    setU({
      ...u,
      roles: u.roles.map((r) => (r.departmentId === id ? { ...r, requiresAvailability: v } : r)),
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const targetMinutes = fromHours(target);
    const maxMinutes = fromHours(max);
    if ([targetMinutes, maxMinutes].some((v) => v !== null && (!Number.isFinite(v) || v < 0)))
      return setError('勤務時間は0以上の数値で入力してください');
    if (targetMinutes !== null && maxMinutes !== null && maxMinutes < targetMinutes)
      return setError('上限は目標以上にしてください');
    setBusy(true);
    setError('');
    try {
      await save({ ...u, targetMinutes, maxMinutes });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <div className="grid gap-1.5">
        <Label htmlFor="u-email">メールアドレス</Label>
        <Input
          id="u-email"
          type="email"
          required
          value={u.email}
          onChange={(e) => setU({ ...u, email: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="u-name">氏名</Label>
        <Input
          id="u-name"
          required
          value={u.name}
          onChange={(e) => setU({ ...u, name: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="u-admin"
          checked={u.isAdmin}
          onCheckedChange={(v) => setU({ ...u, isAdmin: v === true })}
        />
        <Label htmlFor="u-admin">管理者</Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="u-target">目標勤務時間（時間）</Label>
          <Input
            id="u-target"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="u-max">上限（時間・任意）</Label>
          <Input
            id="u-max"
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">所属部門</legend>
        {departments.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div className="flex min-w-32 items-center gap-2">
              <Checkbox
                id={`d-${d.id}`}
                checked={!!role(d.id)}
                onCheckedChange={(v) => toggleDept(d.id, v === true)}
              />
              <Label htmlFor={`d-${d.id}`}>{d.name}</Label>
            </div>
            {role(d.id) && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`r-${d.id}`}
                  checked={role(d.id)!.requiresAvailability}
                  onCheckedChange={(v) => setRequires(d.id, v === true)}
                />
                <Label htmlFor={`r-${d.id}`} className="text-muted-foreground font-normal">
                  希望入力が必要
                </Label>
              </div>
            )}
          </div>
        ))}
      </fieldset>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit" disabled={busy}>
          保存
        </Button>
      </div>
    </form>
  );
}

function CsvImport({ onDone }: { onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [errors, setErrors] = useState<CsvError[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    setErrors([]);
    setMessage('');
    try {
      const res = await adminApi.importCsv(csv, dryRun);
      if ('valid' in res) setMessage(`${res.valid} 件を取り込めます（まだ登録していません）`);
      else {
        setMessage(`登録しました（新規 ${res.created} 件、更新 ${res.updated} 件）`);
        setCsv('');
        onDone();
      }
    } catch (err) {
      if (err instanceof CsvImportError) setErrors(err.errors);
      else setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">CSV一括登録</h2>
      <p className="text-muted-foreground text-sm">
        ヘッダ: <code>email,name,is_admin,target_hours,max_hours,departments</code>
        。部門は <code>|</code> 区切り、希望入力が不要な部門は末尾に <code>:no</code>
        （例: <code>総務部|放送部:no</code>
        ）。同じメールは更新されます。1行でも誤りがあれば何も登録しません。
      </p>
      <Input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => void e.target.files?.[0]?.text().then(setCsv)}
      />
      <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy || !csv.trim()} onClick={() => void run(true)}>
          検証のみ
        </Button>
        <Button disabled={busy || !csv.trim()} onClick={() => void run(false)}>
          登録
        </Button>
      </div>
      {message && <p className="text-sm">{message}</p>}
      {errors.length > 0 && (
        <ul className="text-destructive list-disc pl-5 text-sm">
          {errors.map((e, i) => (
            <li key={i}>
              {e.line} 行目: {e.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminUsers() {
  const { users, departments } = useLoaderData<AdminUsersData>();
  const { revalidate } = useRevalidator();
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [error, setError] = useState('');
  const deptName = (id: number) => departments.find((d) => d.id === id)?.name ?? '?';
  const done = () => {
    setEditing(null);
    void revalidate();
  };

  async function remove(u: AdminUser) {
    if (!window.confirm(`${u.name}（${u.email}）を削除しますか？希望入力も消えます。`)) return;
    try {
      await adminApi.deleteUser(u.id);
      setError('');
      void revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Page wide back>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ユーザー管理</h1>
        <Button onClick={() => setEditing('new')}>ユーザーを追加</Button>
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'ユーザーを追加' : 'ユーザーを編集'}</DialogTitle>
            <DialogDescription>
              希望入力が必要な部門にチェックすると、本人の初回確認画面に表示されます。
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <UserForm
              key={editing === 'new' ? 'new' : editing.id}
              initial={editing === 'new' ? empty : editing}
              departments={departments}
              onSaved={done}
              onCancel={() => setEditing(null)}
              save={(input) =>
                editing === 'new'
                  ? adminApi.createUser(input)
                  : adminApi.updateUser(editing.id, input)
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>氏名</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>部門</TableHead>
              <TableHead>目標/上限(h)</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  {u.name}
                  {u.isAdmin && (
                    <Badge variant="secondary" className="ml-2">
                      管理者
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell className="whitespace-normal">
                  {u.roles
                    .map(
                      (r) =>
                        deptName(r.departmentId) + (r.requiresAvailability ? '' : '（入力不要）'),
                    )
                    .join('、')}
                </TableCell>
                <TableCell>
                  {toHours(u.targetMinutes) || '-'} / {toHours(u.maxMinutes) || '-'}
                </TableCell>
                <TableCell className="space-x-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                    編集
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void remove(u)}>
                    削除
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <CsvImport onDone={() => void revalidate()} />
    </Page>
  );
}
