import { useState } from 'react';
import { useLoaderData } from 'react-router';
import { auditApi, type AuditRow } from '../api';
import { ErrorAlert, Page } from '@/components/Page';
import { ACTION } from '../lib/auditLabels';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    <Page wide>
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
