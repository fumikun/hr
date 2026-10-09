import { jstDay, type ScopeContext } from './resolve.js';
import type { Period, ScopeStore } from './types.js';

/**
 * 受付期間・対象日の判断に必要な設定をまとめて読む。
 * イベントの日程が未設定のときは、作成済みの枠がある日を日程とみなす。
 */
export async function loadScopeContext(
  store: ScopeStore & {
    getPeriod(): Promise<Period>;
    listSlots(): Promise<{ startsAt: Date }[]>;
  },
): Promise<ScopeContext> {
  const [global, saved, scopes] = await Promise.all([
    store.getPeriod(),
    store.getEventDays(),
    store.listScopes(),
  ]);
  const eventDays =
    saved ?? [...new Set((await store.listSlots()).map((s) => jstDay(s.startsAt)))].sort();
  return { global, eventDays, scopes };
}
