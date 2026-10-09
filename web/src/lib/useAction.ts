import { useCallback, useState } from 'react';
import { toast } from 'sonner';

/**
 * 保存・削除などの操作の共通処理。
 * - 実行中は pending（ボタンを無効にして二重送信を防ぐ）
 * - 成功は success のトースト、失敗は error（操作した場所の近くに出す）
 */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(
    async <T>(
      fn: () => Promise<T>,
      opts: { success?: string; onSuccess?: (v: T) => void } = {},
    ): Promise<{ ok: true; value: T } | { ok: false }> => {
      setPending(true);
      setError('');
      try {
        const value = await fn();
        if (opts.success) toast.success(opts.success);
        opts.onSuccess?.(value);
        return { ok: true, value };
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return { ok: false };
      } finally {
        setPending(false);
      }
    },
    [],
  );
  return { run, pending, error, clearError: () => setError('') };
}
