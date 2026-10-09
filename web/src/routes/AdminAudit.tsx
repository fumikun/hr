import { useState } from 'react';
import { useLoaderData } from 'react-router';
import { auditApi, type AuditRow } from '../api';
import { ErrorAlert, Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ACTION: Record<string, string> = {
  'user.create': 'ユーザー追加',
  'user.update': 'ユーザー編集',
  'user.delete': 'ユーザー削除',
  'user.import': 'ユーザーCSV取込',
  'slot.create': '枠の作成',
  'slot.update': '枠の編集',
  'slot.delete': '枠の削除',
  'post.create': '持ち場の追加',
  'post.update': '持ち場の編集',
  'post.delete': '持ち場の削除',
  'settings.availability_period': '希望の受付期間を変更',
  'availability.save': '希望を保存',
  'availability.admin_edit': '希望を管理者が編集',
  'assign.run': '自動割り当て',
  'assign.add': '割り当てを追加',
  'assign.remove': '割り当てを削除',
  'assign.lock': '割り当てを固定',
  'assign.unlock': '固定を解除',
  'assign.confirm': 'シフトを確定',
  'assign.unconfirm': '確定を解除',
};

const brief = (v: unknown) => (v == null ? '' : JSON.stringify(v));

export function AdminAudit() {
  const first = useLoaderData<AuditRow[]>();
  const [rows, setRows] = useState(first);
  const [done, setDone] = useState(first.length < 50);
  const [error, setError] = useState('');

  async function more() {
    try {
      const next = await auditApi.list(rows[rows.length - 1]?.id);
      setRows([...rows, ...next]);
      setDone(next.length < 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Page wide back>
      <h1 className="text-2xl font-bold">操作履歴</h1>
      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日時</TableHead>
              <TableHead>操作者</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>対象</TableHead>
              <TableHead>変更内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString('ja-JP')}
                </TableCell>
                <TableCell>{r.actorName ?? '（削除済み）'}</TableCell>
                <TableCell>{ACTION[r.action] ?? r.action}</TableCell>
                <TableCell className="text-muted-foreground">{r.target}</TableCell>
                <TableCell className="max-w-md whitespace-normal">
                  <details>
                    <summary className="cursor-pointer text-xs">詳細</summary>
                    {r.before != null && (
                      <pre className="text-xs break-all whitespace-pre-wrap">
                        前: {brief(r.before)}
                      </pre>
                    )}
                    {r.after != null && (
                      <pre className="text-xs break-all whitespace-pre-wrap">
                        後: {brief(r.after)}
                      </pre>
                    )}
                  </details>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  履歴はまだありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {!done && (
        <Button variant="outline" onClick={() => void more()}>
          さらに読み込む
        </Button>
      )}
    </Page>
  );
}
