import { useMemo, useState } from 'react';
import type { AdminUser } from '../api';
import { useConfirm } from '@/components/ConfirmDialog';
import { ErrorAlert } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAction } from '@/lib/useAction';

export function PostForm({
  initial,
  candidates,
  save,
  remove,
  onDone,
}: {
  initial: { name: string; restricted: boolean; memberIds: number[] };
  candidates: AdminUser[];
  save: (p: { name: string; restricted: boolean; memberIds: number[] }) => Promise<unknown>;
  remove?: () => Promise<unknown>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [restricted, setRestricted] = useState(initial.restricted);
  const [members, setMembers] = useState(new Set(initial.memberIds));
  const [query, setQuery] = useState('');
  const [localError, setLocalError] = useState('');
  const { run, pending, error: actionError } = useAction();
  const confirm = useConfirm();
  const error = localError || actionError;
  const shown = useMemo(
    () => candidates.filter((u) => u.name.includes(query) || u.email.includes(query)),
    [candidates, query],
  );

  async function del() {
    const ok = await confirm({
      title: 'この持ち場を削除しますか？',
      description: '枠が残っている持ち場は削除できません。',
      confirmLabel: '削除',
      destructive: true,
    });
    if (ok) await run(remove!, { success: '持ち場を削除しました', onSuccess: onDone });
  }
  const toggle = (id: number, on: boolean) =>
    setMembers((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (restricted && members.size === 0)
          return setLocalError('入れる人を1人以上選んでください');
        setLocalError('');
        void run(() => save({ name, restricted, memberIds: restricted ? [...members] : [] }), {
          success: '持ち場を保存しました',
          onSuccess: onDone,
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="post-name">持ち場の名前</Label>
        <Input id="post-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>入れる人</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={restricted ? 'outline' : 'default'}
            onClick={() => setRestricted(false)}
          >
            部門の誰でも
          </Button>
          <Button
            type="button"
            variant={restricted ? 'default' : 'outline'}
            onClick={() => setRestricted(true)}
          >
            一部の人だけ
          </Button>
        </div>
      </div>
      {restricted && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="名前・メールで絞り込み"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMembers((prev) => new Set([...prev, ...shown.map((u) => u.id)]))}
            >
              表示中を全員選択
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">選択中 {members.size} 人</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
            {shown.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <Checkbox
                  id={`m-${u.id}`}
                  checked={members.has(u.id)}
                  onCheckedChange={(v) => toggle(u.id, v === true)}
                />
                <Label htmlFor={`m-${u.id}`} className="font-normal">
                  {u.name}
                  <span className="text-muted-foreground ml-2 text-xs">{u.email}</span>
                </Label>
              </li>
            ))}
            {shown.length === 0 && <li className="text-muted-foreground text-sm">該当なし</li>}
          </ul>
        </div>
      )}
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <div className="flex justify-end gap-2">
        {remove && (
          <Button
            type="button"
            variant="destructive"
            className="mr-auto"
            disabled={pending}
            onClick={() => void del()}
          >
            削除
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  );
}
