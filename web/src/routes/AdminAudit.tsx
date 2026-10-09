import { useEffect, useRef, useState } from 'react';
import { useLoaderData } from 'react-router';
import { auditApi, type AdminUser, type AuditRow } from '../api';
import { ACTION } from '../lib/auditLabels';
import { diffRows } from '../lib/auditDiff';
import { ErrorAlert, Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export type AdminAuditData = { rows: AuditRow[]; users: AdminUser[] };

// 操作の種類（先頭一致で絞り込む）
const KINDS: [string, string][] = [
  ['user.', 'ユーザー'],
  ['department.', '部門'],
  ['slot.', '枠'],
  ['post.', '持ち場'],
  ['availability.', '希望入力'],
  ['settings.', '設定'],
  ['assign.', '割り当て・確定'],
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
  const { rows: first, users } = useLoaderData<AdminAuditData>();
  const [rows, setRows] = useState(first);
  const [done, setDone] = useState(first.length < PAGE);
  const [actor, setActor] = useState('all');
  const [kind, setKind] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { run, pending, error } = useAction();
  const firstRender = useRef(true);

  const query = () => ({
    actor: actor === 'all' ? undefined : Number(actor),
    action: kind === 'all' ? undefined : kind,
    from: from ? new Date(`${from}T00:00`).toISOString() : undefined,
    // 終了日はその日の終わりまで含める
    to: to ? new Date(new Date(`${to}T00:00`).getTime() + 86_400_000).toISOString() : undefined,
  });

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
    // query() は actor/kind/from/to から作るため、これらの変化だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, kind, from, to]);

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
      <div className="flex flex-wrap items-center gap-3">
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="w-40" aria-label="操作した人">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての人</SelectItem>
            {users
              .filter((u) => u.isAdmin)
              .map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-44" aria-label="操作の種類">
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
        <label className="flex items-center gap-1 text-sm">
          期間
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
          〜
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </label>
        {(actor !== 'all' || kind !== 'all' || from || to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActor('all');
              setKind('all');
              setFrom('');
              setTo('');
            }}
          >
            絞り込みを解除
          </Button>
        )}
      </div>
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
                <TableCell className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</TableCell>
                <TableCell>{r.actorName ?? '（削除済み）'}</TableCell>
                <TableCell>{ACTION[r.action] ?? r.action}</TableCell>
                <TableCell className="text-muted-foreground">{r.target}</TableCell>
                <TableCell className="max-w-md whitespace-normal">
                  <Changes row={r} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  該当する履歴はありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {!done && (
        <Button variant="outline" disabled={pending} onClick={() => void more()}>
          {pending ? '読み込み中…' : 'さらに読み込む'}
        </Button>
      )}
    </Page>
  );
}
