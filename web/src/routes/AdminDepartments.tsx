import { useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { departmentApi, type AdminUser, type Department, type Slot } from '../api';
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

export type AdminDepartmentsData = { departments: Department[]; users: AdminUser[]; slots: Slot[] };

export function AdminDepartments() {
  const { departments, users, slots } = useLoaderData<AdminDepartmentsData>();
  const { revalidate } = useRevalidator();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState('');

  async function act(fn: () => Promise<unknown>) {
    try {
      setError('');
      await fn();
      void revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">部門管理</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await departmentApi.create(name);
            setName('');
          });
        }}
      >
        <Input
          required
          placeholder="新しい部門の名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit">部門を追加</Button>
      </form>
      <p className="text-muted-foreground text-sm">
        追加すると、持ち場「全体」（部門の誰でも）が自動で作られます。所属者または枠がある部門は削除できません。
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
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    {editing?.id === d.id ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(async () => {
                            await departmentApi.rename(d.id, editing.name);
                            setEditing(null);
                          });
                        }}
                      >
                        <Input
                          autoFocus
                          required
                          value={editing.name}
                          onChange={(e) => setEditing({ id: d.id, name: e.target.value })}
                        />
                        <Button type="submit" size="sm">
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
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        window.confirm(
                          `部門「${d.name}」を削除しますか？持ち場も一緒に消えます。`,
                        ) && void act(() => departmentApi.remove(d.id))
                      }
                    >
                      削除
                    </Button>
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
