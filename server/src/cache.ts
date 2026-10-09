/**
 * 短時間だけ結果を覚えておく小さなキャッシュ（同時に同じものを聞かれたら1回の問い合わせを共有する）。
 * load が null を返した場合は覚えない（未登録・未確認の状態が、登録・確認の直後に反映されなくなるのを避ける）。
 */
export function createTtlCache<K, V>(ttlMs: number, now: () => number = Date.now) {
  const entries = new Map<K, { value: V; expires: number }>();
  const inflight = new Map<K, Promise<V | null>>();
  return {
    async get(key: K, load: () => Promise<V | null>): Promise<V | null> {
      const hit = entries.get(key);
      if (hit && hit.expires > now()) return hit.value;
      const pending = inflight.get(key);
      if (pending) return pending;
      const p = load()
        .then((value) => {
          if (value !== null && ttlMs > 0) entries.set(key, { value, expires: now() + ttlMs });
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },
    delete: (key: K) => entries.delete(key),
    clear: () => {
      entries.clear();
      inflight.clear();
    },
  };
}
