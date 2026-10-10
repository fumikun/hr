import { useMemo, useState } from 'react';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import {
  adminApi,
  CsvImportError,
  type AdminUser,
  type CsvError,
  type Department,
  type UserInput,
} from '../api';
import { downloadText } from '../lib/ics';
import { useConfirm } from '@/components/ConfirmDialog';
import { ErrorAlert, Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ListRow, MobileList } from '@/components/ListRow';
import { Textarea } from '@/components/ui/textarea';
import { useAction } from '@/lib/useAction';
import { useQueryParam } from '@/lib/useQueryParam';

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
  remove,
}: {
  initial: UserInput;
  departments: Department[];
  onSaved: () => void;
  onCancel: () => void;
  save: (u: UserInput) => Promise<unknown>;
  remove?: () => Promise<unknown>;
}) {
  const [u, setU] = useState(initial);
  const [target, setTarget] = useState(toHours(initial.targetMinutes));
  const [max, setMax] = useState(toHours(initial.maxMinutes));
  const [localError, setLocalError] = useState('');
  const { run, pending, error } = useAction();
  const confirm = useConfirm();

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const targetMinutes = fromHours(target);
    const maxMinutes = fromHours(max);
    if ([targetMinutes, maxMinutes].some((v) => v !== null && (!Number.isFinite(v) || v < 0)))
      return setLocalError('勤務時間は0以上の数値で入力してください');
    if (targetMinutes !== null && maxMinutes !== null && maxMinutes < targetMinutes)
      return setLocalError('上限は目標以上にしてください');
    setLocalError('');
    void run(() => save({ ...u, targetMinutes, maxMinutes }), {
      success: '保存しました',
      onSuccess: onSaved,
    });
  }
  async function del() {
    const ok = await confirm({
      title: `${initial.name}さんを削除しますか？`,
      description: '本人の希望入力と割り当ても一緒に消えます。この操作は元に戻せません。',
      confirmLabel: '削除',
      destructive: true,
    });
    if (ok) await run(remove!, { success: '削除しました', onSuccess: onSaved });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
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
      {(localError || error) && <ErrorAlert>{localError || error}</ErrorAlert>}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
      {/* 押し間違えないよう、削除は保存から離して置く */}
      {remove && (
        <div className="border-t pt-4">
          <Button
            type="button"
            variant="outline"
            className="text-destructive w-full sm:w-fit"
            disabled={pending}
            onClick={() => void del()}
          >
            このユーザーを削除
          </Button>
        </div>
      )}
    </form>
  );
}

function CsvDialog({
  open,
  onOpenChange,
  departments,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  departments: Department[];
  onDone: () => void;
}) {
  const [csv, setCsv] = useState('');
  const [errors, setErrors] = useState<CsvError[]>([]);
  const [preview, setPreview] = useState<UserInput[] | null>(null);
  const { run, pending, error } = useAction();
  const deptName = (id: number) => departments.find((d) => d.id === id)?.name ?? '?';

  const check = async () => {
    setErrors([]);
    setPreview(null);
    const res = await run(async () => {
      try {
        return await adminApi.importCsv(csv, true);
      } catch (e) {
        if (e instanceof CsvImportError) {
          setErrors(e.errors);
          return null;
        }
        throw e;
      }
    });
    if (res.ok && res.value && 'preview' in res.value) setPreview(res.value.preview);
  };
  const register = () =>
    run(() => adminApi.importCsv(csv, false), {
      success: '登録しました',
      onSuccess: (r) => {
        if (!('valid' in r)) {
          setCsv('');
          setPreview(null);
          onOpenChange(false);
          onDone();
        }
      },
    });

  // 取り込み用のひな形（部門名は実際の部門から作る）
  const template = () => {
    const a = departments[0]?.name ?? '総務部';
    const b = departments[1]?.name ?? '模擬店部';
    downloadText(
      'users-template.csv',
      '﻿email,name,is_admin,target_hours,max_hours,departments\r\n' +
        `taro@example.com,高専 太郎,,6,8,${a}\r\n` +
        `hanako@example.com,高専 花子,,4,,${a}|${b}:no\r\n`,
      'text/csv',
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>CSVで一括登録</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={template}>
            ひな形をダウンロード
          </Button>
          <Input
            type="file"
            accept=".csv,text/csv"
            className="max-w-xs"
            onChange={(e) => {
              setPreview(null);
              setErrors([]);
              void e.target.files?.[0]?.text().then(setCsv);
            }}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          列: <code>email,name,is_admin,target_hours,max_hours,departments</code>。部門は{' '}
          <code>|</code> 区切りで、希望入力が不要な部門は末尾に <code>:no</code>（例:{' '}
          <code>総務部|放送部:no</code>）。
        </p>
        <Textarea
          rows={6}
          value={csv}
          placeholder="ここに貼り付けるか、ファイルを選んでください"
          onChange={(e) => {
            setCsv(e.target.value);
            setPreview(null);
          }}
        />
        {error && <ErrorAlert>{error}</ErrorAlert>}
        {errors.length > 0 && (
          <Notice kind="error" title={`${errors.length} 件の誤りがあります`}>
            <ul className="list-disc pl-5">
              {errors.map((e, i) => (
                <li key={i}>
                  {e.line} 行目: {e.message}
                </li>
              ))}
            </ul>
          </Notice>
        )}
        {preview && (
          <div className="space-y-2">
            <Notice kind="info">{preview.length} 件を取り込めます。</Notice>
            <div className="max-h-48 overflow-auto rounded border">
              <Table stack>
                <TableHeader>
                  <TableRow>
                    <TableHead>氏名</TableHead>
                    <TableHead>メール</TableHead>
                    <TableHead>部門</TableHead>
                    <TableHead>目標/上限(h)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((u) => (
                    <TableRow key={u.email}>
                      <TableCell data-primary>
                        {u.name}
                        {u.isAdmin && <Badge className="ml-1">管理者</Badge>}
                      </TableCell>
                      <TableCell data-label="メール" className="break-all">
                        {u.email}
                      </TableCell>
                      <TableCell data-label="部門" className="whitespace-normal">
                        {u.roles
                          .map(
                            (r) =>
                              deptName(r.departmentId) +
                              (r.requiresAvailability ? '' : '（入力不要）'),
                          )
                          .join('、')}
                      </TableCell>
                      <TableCell data-label="目標/上限(h)">
                        {toHours(u.targetMinutes) || '-'} / {toHours(u.maxMinutes) || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending || !csv.trim()} onClick={() => void check()}>
            内容を確認
          </Button>
          <Button disabled={pending || !preview} onClick={() => void register()}>
            {preview ? `${preview.length} 件を登録` : '登録'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminUsers() {
  const { users, departments } = useLoaderData<AdminUsersData>();
  const { revalidate } = useRevalidator();
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [q, setQ] = useQueryParam('q');
  // IME変換中にURLを書き換えると入力が確定されてしまうため、入力欄は手元のstateで持ち、
  // 変換が終わってからURL(?q=)へ反映する
  const [searchText, setSearchText] = useState(q ?? '');
  const [deptParam, setDept] = useQueryParam('dept');
  const deptName = (id: number) => departments.find((d) => d.id === id)?.name ?? '?';
  const done = () => {
    setEditing(null);
    void revalidate();
  };

  const shown = useMemo(() => {
    const query = (q ?? '').trim();
    const dept = deptParam ? Number(deptParam) : null;
    return users
      .filter((u) => !query || u.name.includes(query) || u.email.includes(query))
      .filter((u) => dept === null || u.roles.some((r) => r.departmentId === dept))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
  }, [users, q, deptParam]);

  return (
    <Page wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">ユーザー管理</h1>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => setCsvOpen(true)}
          >
            CSVで一括登録
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => setEditing('new')}>
            ユーザーを追加
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <Input
          placeholder="名前・メールで検索"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            if (!(e.nativeEvent as InputEvent).isComposing) setQ(e.target.value || null);
          }}
          onCompositionEnd={(e) => setQ(e.currentTarget.value || null)}
          className="col-span-2 sm:max-w-xs"
          aria-label="名前・メールで検索"
        />
        <Select value={deptParam ?? 'all'} onValueChange={(v) => setDept(v === 'all' ? null : v)}>
          <SelectTrigger className="w-full sm:w-40" aria-label="部門で絞り込み">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての部門</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground col-span-2 text-sm">
          {shown.length} / {users.length} 人
        </span>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'ユーザーを追加' : 'ユーザーを編集'}</DialogTitle>
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
              remove={editing === 'new' ? undefined : () => adminApi.deleteUser(editing.id)}
            />
          )}
        </DialogContent>
      </Dialog>
      <CsvDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        departments={departments}
        onDone={() => void revalidate()}
      />

      {shown.length === 0 && (
        <p className="text-muted-foreground py-6 text-center text-sm">該当するユーザーがいません</p>
      )}
      <MobileList>
        {shown.map((u) => (
          <ListRow
            key={u.id}
            title={u.name}
            badge={u.isAdmin && <Badge variant="secondary">管理者</Badge>}
            sub={u.roles.map((r) => deptName(r.departmentId)).join('・') || '部門なし'}
            onClick={() => setEditing(u)}
            aside={
              <Button asChild size="sm" variant="ghost">
                <Link to={`/admin/users/${u.id}/availability`}>希望</Link>
              </Button>
            }
          />
        ))}
      </MobileList>
      <div className="bg-card hidden rounded-lg border sm:block">
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
            {shown.map((u) => (
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
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/admin/users/${u.id}/availability`}>希望</Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                    編集
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Page>
  );
}
