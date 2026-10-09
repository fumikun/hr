import { useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { departmentApi, type AdminUser, type Department, type Slot } from '../api';
import { useConfirm } from '@/components/ConfirmDialog';
import { ErrorAlert, Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAction } from '@/lib/useAction';

export type AdminDepartmentsData = { departments: Department[]; users: AdminUser[]; slots: Slot[] };

export function AdminDepartments() {
  const { departments, users, slots } = useLoaderData<AdminDepartmentsData>();
  const { revalidate } = useRevalidator();
  const confirm = useConfirm();
  const { run, pending, error } = useAction();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const refresh = () => void revalidate();

  async function remove(d: Department) {
    const ok = await confirm({
      title: `部門「${d.name}」を削除しますか？`,
      description: '持ち場も一緒に消えます。この操作は元に戻せません。',
      confirmLabel: '削除',
      destructive: true,
    });
    if (ok)
      await run(() => departmentApi.remove(d.id), {
        success: '部門を削除しました',
        onSuccess: refresh,
      });
  }

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">部門管理</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => departmentApi.create(name), {
            success: '部門を追加しました',
            onSuccess: () => {
              setName('');
              refresh();
            },
          });
        }}
      >
        <Input
          required
          placeholder="新しい部門の名前"
          aria-label="新しい部門の名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={pending}>
          部門を追加
        </Button>
      </form>
      <p className="text-muted-foreground text-sm">
        追加すると、持ち場「全体」（部門の誰でも）が自動で作られます。
      </p>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>部門</TableHead>
              <TableHead>所属者</TableHead>
              <TableHead>枠</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((d) => {
              const members = users.filter((u) =>
                u.roles.some((r) => r.departmentId === d.id),
              ).length;
              const slotCount = slots.filter((s) => s.departmentId === d.id).length;
              // 所属者か枠がある部門は削除できない。押せない理由を表示する
              const blocked =
                members > 0 || slotCount > 0
                  ? `所属者 ${members} 人・枠 ${slotCount} 件があるため削除できません`
                  : null;
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    {editing?.id === d.id ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(() => departmentApi.rename(d.id, editing.name), {
                            success: '名前を変更しました',
                            onSuccess: () => {
                              setEditing(null);
                              refresh();
                            },
                          });
                        }}
                      >
                        <Input
                          autoFocus
                          required
                          aria-label="部門の名前"
                          value={editing.name}
                          onChange={(e) => setEditing({ id: d.id, name: e.target.value })}
                        />
                        <Button type="submit" size="sm" disabled={pending}>
                          保存
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(null)}
                        >
                          取消
                        </Button>
                      </form>
                    ) : (
                      d.name
                    )}
                  </TableCell>
                  <TableCell>{members}人</TableCell>
                  <TableCell>{slotCount}枠</TableCell>
                  <TableCell className="space-x-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing({ id: d.id, name: d.name })}
                    >
                      名前を変更
                    </Button>
                    <span title={blocked ?? undefined}>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!!blocked || pending}
                        onClick={() => void remove(d)}
                      >
                        削除
                      </Button>
                    </span>
                    {blocked && (
                      <span className="text-muted-foreground block text-xs">{blocked}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Page>
  );
}
