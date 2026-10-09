import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/** 選んだ部門・日付などを URL(?key=value) に残す。再読み込みや共有で同じ位置に戻れる */
export function useQueryParam(key: string): [string | null, (v: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (v: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === null) next.delete(key);
          else next.set(key, v);
          return next;
        },
        { replace: true },
      ),
    [key, setParams],
  );
  return [params.get(key), set];
}

/** 複数の値を1回でまとめて更新する。setSearchParams は連続呼び出しが上書きし合うため、同時に変える値はこちらを使う */
export function useSetQueryParams(): (changes: Record<string, string | null>) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (changes) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
}
