import { useEffect } from 'react';
import type { Department } from '../api';
import { useQueryParam } from './useQueryParam';

const KEY = 'hr:lastDept';

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // プライベートモードなどで使えないときは、覚えない
  }
};

/**
 * 管理画面で選んでいる部門。URL の ?dept= を優先し、なければ前に別の画面で選んだ部門、
 * それもなければ先頭の部門にする。「持ち場」「シフト枠」「割り当て」を行き来しても同じ部門のまま開ける。
 */
export function useDeptId(departments: Department[]): number {
  const [deptParam] = useQueryParam('dept');
  const pick = (v: string | null) => departments.find((d) => String(d.id) === v)?.id;
  const deptId = pick(deptParam) ?? pick(read()) ?? departments[0]?.id ?? 0;
  useEffect(() => {
    if (!deptId) return;
    try {
      localStorage.setItem(KEY, String(deptId));
    } catch {
      /* 覚えられなくても動作に影響はない */
    }
  }, [deptId]);
  return deptId;
}
