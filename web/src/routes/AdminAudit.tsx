import { useEffect, useMemo, useRef, useState } from 'react';
import { useLoaderData } from 'react-router';
import {
  auditApi,
  type AdminUser,
  type AuditRow,
  type Department,
  type Post,
  type Slot,
} from '../api';
import { ACTION } from '../lib/auditLabels';
import { diffRows } from '../lib/auditDiff';
import { targetLabel } from '../lib/auditTarget';
import { ErrorAlert, Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
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
import { fmtDateTime } from '@/lib/datetime';
import { useAction } from '@/lib/useAction';

export type AdminAuditData = {
  rows: AuditRow[];
  users: AdminUser[];
  departments: Department[];
  posts: Post[];
  slots: Slot[];
};

// 操作の種類（先頭一致で絞り込む）
const KINDS: [string, string][] = [
  ['user.', 'ユーザー'],
  ['department.', '部門'],
  ['slot.', '枠'],
  ['post.', '持ち場'],
  ['availability.', '希望入力'],
  ['settings.', '設定'],
  ['assign.', '割り当て・公開'],
];
const PAGE = 50;

function Changes({ row }: { row: AuditRow }) {
  const rows = diffRows(row.before, row.after);
  if (rows.length === 0)
    return <span className="text-muted-foreground text-xs">（変更内容なし）</span>;
  return (
    <details>
      <summary className="cursor-pointer text-xs">{rows.length} 項目</summary>
      <dl className="mt-1 space-y-0.5 text-xs">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd>
              {r.before !== null && <span className="text-red-700 line-through">{r.before}</span>}
              {r.before !== null && r.after !== null && ' → '}
              {r.after !== null && <span className="text-emerald-700">{r.after}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function AdminAudit() {
  const { rows: first, users, departments, posts, slots } = useLoaderData<AdminAuditData>();
  const names = useMemo(
    () => ({
      users: new Map(users.map((u) => [u.id, u.name])),
      departments: new Map(departments.map((d) => [d.id, d.name])),
      posts: new Map(posts.map((p) => [p.id, { name: p.name, departmentId: p.departmentId }])),
      slots: new Map(slots.map((x) => [x.id, x])),
    }),
    [users, departments, posts, slots],
  );
  const [rows, setRows] = useState(first);
  const [done, setDone] = useState(first.length < PAGE);
  const [kind, setKind] = useState('all');
  const { run, pending, error } = useAction();
  const firstRender = useRef(true);

  const query = () => ({ action: kind === 'all' ? undefined : kind });

  // 絞り込み条件が変わったら、先頭から取得し直す
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void run(() => auditApi.list(query()), {
      onSuccess: (r) => {
        setRows(r);
        setDone(r.length < PAGE);
      },
    });
    // query() は kind から作るため、kind の変化だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const more = () =>
    run(() => auditApi.list({ ...query(), before: rows[rows.length - 1]?.id }), {
      onSuccess: (next) => {
        setRows([...rows, ...next]);
        setDone(next.length < PAGE);
      },
    });

  return (
    <Page wide>
      <h1 className="text-2xl font-bold">操作履歴</h1>
      <Select value={kind} onValueChange={setKind}>
        <SelectTrigger className="w-full sm:w-44" aria-label="操作の種類">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべての操作</SelectItem>
          {KINDS.map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rows.length === 0 && (
        <p className="text-muted-foreground py-6 text-center text-sm">該当する履歴はありません</p>
      )}
      {/* スマホ: 1件を2行にまとめた一覧 */}
      {rows.length > 0 && (
        <ul className="bg-card divide-y rounded-lg border sm:hidden">
          {rows.map((r) => (
            <li key={r.id} className="space-y-0.5 px-3 py-2 text-sm">
              <p className="text-muted-foreground flex justify-between gap-2 text-xs">
                <span>{fmtDateTime(r.createdAt)}</span>
                <span className="truncate">{r.actorName ?? '（削除済み）'}</span>
              </p>
              <p>
                <span className="font-medium">{ACTION[r.action] ?? r.action}</span>
                <span className="text-muted-foreground ml-2">{targetLabel(r.target, names)}</span>
              </p>
              <Changes row={r} />
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="bg-card hidden overflow-x-auto rounded-lg border sm:block">
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
                  <TableCell className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</TableCell>
                  <TableCell>{r.actorName ?? '（削除済み）'}</TableCell>
                  <TableCell>{ACTION[r.action] ?? r.action}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-normal">
                    {targetLabel(r.target, names)}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    <Changes row={r} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {!done && (
        <Button variant="outline" disabled={pending} onClick={() => void more()}>
          {pending ? '読み込み中…' : 'さらに読み込む'}
        </Button>
      )}
    </Page>
  );
}
