import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  /** 一覧など、説明の下に出したい内容（確定時の不足枠など） */
  content?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<Confirm | null>(null);

/** window.confirm の代わり。`const confirm = useConfirm(); if (!(await confirm({...}))) return;` */
export function useConfirm(): Confirm {
  const c = useContext(Ctx);
  if (!c) throw new Error('ConfirmProvider がありません');
  return c;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (o) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={opts !== null} onOpenChange={(o) => !o && close(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{opts?.title}</DialogTitle>
            {opts?.description && (
              <DialogDescription asChild>
                <div>{opts.description}</div>
              </DialogDescription>
            )}
          </DialogHeader>
          {opts?.content}
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {opts?.cancelLabel ?? 'キャンセル'}
            </Button>
            <Button
              variant={opts?.destructive ? 'destructive' : 'default'}
              onClick={() => close(true)}
            >
              {opts?.confirmLabel ?? 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
