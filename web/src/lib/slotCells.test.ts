import { describe, expect, it } from 'vitest';
import { cellState, segments } from './slotCells';

const h = (n: number) => n * 3_600_000;

describe('segments', () => {
  it('区切りが揃っている枠は、そのままマスになる', () => {
    const spans = [
      { start: h(9), end: h(10) },
      { start: h(10), end: h(11) },
      { start: h(9), end: h(10) }, // 別の持ち場の同じ時間の枠
    ];
    expect(segments(spans)).toEqual([
      { start: h(9), end: h(10) },
      { start: h(10), end: h(11) },
    ]);
  });

  it('区切りがずれている枠は、すべての区切りで分ける', () => {
    const spans = [
      { start: h(9), end: h(11) },
      { start: h(10), end: h(12) },
    ];
    expect(segments(spans)).toEqual([
      { start: h(9), end: h(10) },
      { start: h(10), end: h(11) },
      { start: h(11), end: h(12) },
    ]);
  });

  it('枠のない時間（休憩など）はマスにしない', () => {
    const spans = [
      { start: h(9), end: h(10) },
      { start: h(13), end: h(14) },
    ];
    expect(segments(spans)).toEqual(spans);
  });
});

describe('cellState', () => {
  const cell = { start: h(9), end: h(10) };
  const want = (start: number, end: number) => ({
    type: 'want' as const,
    departmentId: 1,
    start,
    end,
  });

  it('マス全体が塗られていれば on', () => {
    expect(cellState([want(h(8), h(11))], 1, 'want', cell)).toBe('on');
  });
  it('隣り合う2つの入力でマス全体が埋まっていても on', () => {
    expect(cellState([want(h(9), h(9.5)), want(h(9.5), h(10))], 1, 'want', cell)).toBe('on');
  });
  it('一部だけなら partial', () => {
    expect(cellState([want(h(9), h(9.5))], 1, 'want', cell)).toBe('partial');
  });
  it('別の部門や別の種類は数えない', () => {
    expect(cellState([want(h(9), h(10))], 2, 'want', cell)).toBe('off');
    expect(cellState([{ ...want(h(9), h(10)), type: 'ok' }], 1, 'want', cell)).toBe('off');
  });
});
