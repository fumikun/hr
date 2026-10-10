import { describe, expect, it } from 'vitest';
import { nextShortage, pickRecommendation } from './assignNav';

const s = (id: number, startsAt: string) => ({ id, startsAt });

describe('nextShortage', () => {
  const list = [s(3, '2026-10-10T10:00'), s(1, '2026-10-10T09:00'), s(2, '2026-10-10T09:00')];
  it('何も選んでいなければ、いちばん早い不足', () => {
    expect(nextShortage(list, null)?.id).toBe(1);
  });
  it('選んでいる枠より後ろに進む（同時刻は id 順）', () => {
    expect(nextShortage(list, s(1, '2026-10-10T09:00'))?.id).toBe(2);
    expect(nextShortage(list, s(2, '2026-10-10T09:00'))?.id).toBe(3);
  });
  it('最後まで行ったら先頭に戻る', () => {
    expect(nextShortage(list, s(3, '2026-10-10T10:00'))?.id).toBe(1);
  });
  it('選んでいる枠が不足リストに無くても、その時刻より後ろへ進む', () => {
    expect(nextShortage(list, s(9, '2026-10-10T09:30'))?.id).toBe(3);
  });
  it('不足がなければ null', () => {
    expect(nextShortage([], null)).toBeNull();
  });
});

describe('pickRecommendation', () => {
  const c = (userId: number, assignedMinutes: number, wants = false, reasons: string[] = []) => ({
    userId,
    assignedMinutes,
    wants,
    reasons,
  });
  const targets: Record<number, number | null> = { 1: 600, 2: 600, 3: null, 4: 600 };
  const target = (id: number) => targets[id];

  it('警告のある人は選ばない。全員警告ありなら null', () => {
    expect(pickRecommendation([c(1, 0, true, ['unavailable'])], target)).toBeNull();
    expect(pickRecommendation([], target)).toBeNull();
  });
  it('入りたい人を優先する', () => {
    expect(pickRecommendation([c(1, 0), c(2, 300, true)], target)?.userId).toBe(2);
  });
  it('入りたいが同じなら、目標までの残りが多い人', () => {
    expect(pickRecommendation([c(1, 300), c(2, 100)], target)?.userId).toBe(2);
  });
  it('目標のない人は最後。目標がない人どうしは勤務時間が少ない方', () => {
    expect(pickRecommendation([c(3, 0), c(4, 590)], target)?.userId).toBe(4);
    expect(pickRecommendation([c(3, 200), c(3, 100)], target)?.assignedMinutes).toBe(100);
  });
  it('元の配列を並べ替えない', () => {
    const arr = [c(1, 300), c(2, 100)];
    pickRecommendation(arr, target);
    expect(arr.map((x) => x.userId)).toEqual([1, 2]);
  });
});
