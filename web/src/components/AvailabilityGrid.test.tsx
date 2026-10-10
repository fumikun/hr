// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PaintEntry } from '../lib/paint';
import { AvailabilityGrid, type GridRow } from './AvailabilityGrid';

const at = (h: number) => new Date(2026, 9, 10, h).getTime();
const rows: GridRow[] = [
  { row: null, label: '入れない', sub: '全部門共通 ×' },
  { row: 1, label: '総務部', sub: '入りたい ◎' },
];
const shifts = new Map([
  [
    1,
    [
      { start: at(9), end: at(10) },
      { start: at(10), end: at(11) },
    ],
  ],
]);

function setup(
  entries: PaintEntry[] = [],
  over: Partial<React.ComponentProps<typeof AvailabilityGrid>> = {},
) {
  const onChange = vi.fn();
  render(
    <AvailabilityGrid
      rows={rows}
      entries={entries}
      shifts={shifts}
      disabled={false}
      onChange={onChange}
      {...over}
    />,
  );
  return onChange;
}
const cell = (col: string, time: string) =>
  screen.getByRole('button', { name: new RegExp(`${time}、${col}：`) });
const want = (s: number, e: number): PaintEntry => ({
  type: 'want',
  departmentId: 1,
  start: at(s),
  end: at(e),
});
const ng = (s: number, e: number): PaintEntry => ({
  type: 'ng',
  departmentId: null,
  start: at(s),
  end: at(e),
});

describe('AvailabilityGrid', () => {
  it('部門の列のマスをタップすると「入りたい」になる', () => {
    const onChange = setup();
    fireEvent.click(cell('総務部', '09:00から10:00'));
    expect(onChange).toHaveBeenCalledWith([want(9, 10)]);
  });
  it('「入れない」の列のマスをタップすると「入れない」になる（全部門共通）', () => {
    const onChange = setup();
    fireEvent.click(cell('入れない', '10:00から11:00'));
    expect(onChange).toHaveBeenCalledWith([ng(10, 11)]);
  });
  it('塗ってあるマスをもう一度タップすると消える', () => {
    const onChange = setup([want(9, 10)]);
    fireEvent.click(cell('総務部', '09:00から10:00'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
  it('隣り合うマスを塗ると1つの範囲に結合される', () => {
    const onChange = setup([want(9, 10)]);
    fireEvent.click(cell('総務部', '10:00から11:00'));
    expect(onChange).toHaveBeenCalledWith([want(9, 11)]);
  });
  it('「入れない」で埋まった時間は、部門の列で押せない', () => {
    const onChange = setup([ng(9, 10)]);
    const c = cell('総務部', '09:00から10:00');
    expect(c).toBeDisabled();
    fireEvent.click(c);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('受付が終わった列は押せない。ほかの列は押せる', () => {
    const onChange = setup([], { rows: [rows[0]!, { ...rows[1]!, locked: true }] });
    expect(cell('総務部', '09:00から10:00')).toBeDisabled();
    fireEvent.click(cell('入れない', '09:00から10:00'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('全体を無効にすると、どのマスも押せない', () => {
    setup([], { disabled: true });
    expect(cell('入れない', '09:00から10:00')).toBeDisabled();
    expect(cell('総務部', '09:00から10:00')).toBeDisabled();
  });
  it('枠のない日は案内を出す', () => {
    setup([], { shifts: new Map() });
    expect(screen.getByText('この日はまだシフト枠がありません。')).toBeInTheDocument();
  });
  it('その日に枠のない部門は列を出さず、案内に出す', () => {
    setup([], { rows: [...rows, { row: 2, label: '模擬店部', sub: '入りたい ◎' }] });
    expect(screen.queryByRole('button', { name: /、模擬店部：/ })).not.toBeInTheDocument();
    expect(screen.getByText(/模擬店部は、この日のシフト枠がありません/)).toBeInTheDocument();
  });
  it('列見出しの「すべて」で、その列のマスをまとめて塗る・解除する', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'すべて ◎' }));
    expect(onChange).toHaveBeenLastCalledWith([want(9, 11)]);
  });
  it('マウスでは同じ列をドラッグして続けて塗れる', () => {
    const onChange = setup();
    const a = cell('総務部', '09:00から10:00');
    const b = cell('総務部', '10:00から11:00');
    fireEvent.pointerDown(a, { pointerType: 'mouse', button: 0 });
    expect(onChange).toHaveBeenCalledWith([want(9, 10)]);
    fireEvent.pointerEnter(b, { buttons: 1 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
