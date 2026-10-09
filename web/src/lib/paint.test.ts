import { describe, expect, it } from 'vitest';
import { paint, type PaintEntry } from './paint';

const H = 3_600_000;
const e = (
  type: PaintEntry['type'],
  departmentId: number | null,
  a: number,
  b: number,
): PaintEntry => ({ type, departmentId, start: a * H, end: b * H });
const r = (a: number, b: number) => ({ start: a * H, end: b * H });

describe('paint', () => {
  it('adds to an empty row', () => {
    expect(paint([], null, r(9, 10), 'ng')).toEqual([e('ng', null, 9, 10)]);
  });
  it('merges adjacent and overlapping ranges of the same type', () => {
    const once = paint([e('ng', null, 9, 10)], null, r(10, 11), 'ng');
    expect(paint(once, null, r(8, 9.5), 'ng')).toEqual([e('ng', null, 8, 11)]);
  });
  it('overwrites part of a different type, splitting it', () => {
    const out = paint([e('want', 1, 9, 12)], 1, r(10, 11), 'ok');
    expect(out).toEqual([e('want', 1, 9, 10), e('ok', 1, 10, 11), e('want', 1, 11, 12)]);
  });
  it('erases a middle part', () => {
    expect(paint([e('ng', null, 9, 12)], null, r(10, 11), null)).toEqual([
      e('ng', null, 9, 10),
      e('ng', null, 11, 12),
    ]);
  });
  it('never touches other rows', () => {
    const others = [e('want', 2, 9, 12), e('ng', null, 9, 12)];
    const out = paint(others, 1, r(9, 12), 'want');
    expect(out).toContainEqual(e('want', 2, 9, 12));
    expect(out).toContainEqual(e('ng', null, 9, 12));
    expect(out).toContainEqual(e('want', 1, 9, 12));
  });
});
