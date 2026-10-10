// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityData } from '../api';
import { renderRoute } from '../test/renderRoute';
import { Availability } from './Availability';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  availabilityApi: { save: vi.fn() },
  adminAvailabilityApi: { save: vi.fn() },
}));
import { availabilityApi } from '../api';

const at = (h: number) => new Date(2026, 9, 10, h).toISOString();
const base: AvailabilityData = {
  period: { opensAt: null, closesAt: null },
  open: true,
  days: ['2026-10-10'],
  departments: [
    {
      id: 1,
      name: '総務部',
      open: true,
      opensAt: null,
      closesAt: null,
      days: ['2026-10-10'],
    },
  ],
  slots: [
    { departmentId: 1, startsAt: at(9), endsAt: at(10) },
    { departmentId: 1, startsAt: at(10), endsAt: at(11) },
  ],
  submittedAt: null,
  entries: [],
};

const open = (over: Partial<AvailabilityData> = {}) =>
  renderRoute('/availability', {
    path: '/availability',
    element: <Availability />,
    loaderData: { ...base, ...over },
  });
const cell = (name: RegExp) => screen.findByRole('button', { name });
const wantCell = () => cell(/09:00から10:00、総務部/);
const saveMock = vi.mocked(availabilityApi.save);
const flush = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  saveMock.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe('提出前（未提出）', () => {
  it('何も塗らなくても「提出する」を押せ、空の希望で提出される', async () => {
    open();
    const submit = await screen.findByRole('button', { name: '提出する' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await flush(0);
    expect(saveMock).toHaveBeenCalledWith([]);
  });

  it('塗っても自動保存はせず、端末に下書きを残す', async () => {
    open();
    fireEvent.click(await wantCell());
    await flush(5000);
    expect(saveMock).not.toHaveBeenCalled();
    const draft: unknown = JSON.parse(localStorage.getItem('availability-draft:me')!);
    expect(draft).toEqual([expect.objectContaining({ type: 'want', departmentId: 1 })]);
  });

  it('提出すると下書きを消す', async () => {
    open();
    fireEvent.click(await wantCell());
    fireEvent.click(screen.getByRole('button', { name: '提出する' }));
    await flush(0);
    expect(saveMock).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'want', departmentId: 1 }),
    ]);
    expect(localStorage.getItem('availability-draft:me')).toBeNull();
  });

  it('下書きがあれば開き直したときに知らせ、「続ける」で復元する', async () => {
    localStorage.setItem(
      'availability-draft:me',
      JSON.stringify([
        {
          type: 'want',
          departmentId: 1,
          start: new Date(at(9)).getTime(),
          end: new Date(at(10)).getTime(),
        },
      ]),
    );
    open();
    expect(await screen.findByText('保存していない入力があります')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '続ける' }));
    expect(await cell(/09:00から10:00、総務部：入りたい/)).toBeInTheDocument();
    expect(screen.queryByText('保存していない入力があります')).not.toBeInTheDocument();
  });

  it('「削除する」で下書きを消し、塗り直しにならない', async () => {
    localStorage.setItem(
      'availability-draft:me',
      JSON.stringify([
        {
          type: 'want',
          departmentId: 1,
          start: new Date(at(9)).getTime(),
          end: new Date(at(10)).getTime(),
        },
      ]),
    );
    open();
    await screen.findByText('保存していない入力があります');
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    expect(localStorage.getItem('availability-draft:me')).toBeNull();
    expect(await cell(/09:00から10:00、総務部：入れる/)).toBeInTheDocument();
  });

  it('空の下書きや保存済みと同じ下書きでは知らせない', async () => {
    localStorage.setItem('availability-draft:me', '[]');
    open();
    await wantCell();
    expect(screen.queryByText('保存していない入力があります')).not.toBeInTheDocument();
  });

  it('壊れた下書きがあっても画面は開ける', async () => {
    localStorage.setItem('availability-draft:me', '{not json');
    open();
    expect(await wantCell()).toBeInTheDocument();
  });
});

describe('提出後（自動保存）', () => {
  const submitted = { submittedAt: new Date(2026, 9, 1).toISOString() };

  it('変更の1秒後に自動で保存する（それより前には保存しない）', async () => {
    open(submitted);
    fireEvent.click(await wantCell());
    await flush(900);
    expect(saveMock).not.toHaveBeenCalled();
    await flush(200);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'want', departmentId: 1 }),
    ]);
    expect(await screen.findByText('保存しました ✓')).toBeInTheDocument();
  });

  it('続けて操作しても、保存は最後の1回にまとまる', async () => {
    open(submitted);
    fireEvent.click(await wantCell());
    await flush(600);
    fireEvent.click(await cell(/10:00から11:00、総務部/));
    await flush(600);
    expect(saveMock).not.toHaveBeenCalled();
    await flush(500);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0]![0]).toHaveLength(1); // 2つの枠は結合される
  });

  it('保存し終えたあとは、同じ内容を送り直さない', async () => {
    open(submitted);
    fireEvent.click(await wantCell());
    await flush(1500);
    await flush(5000);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('失敗したら、その旨を出し、保存ボタンで再送できる', async () => {
    saveMock.mockRejectedValueOnce(new Error('network'));
    open(submitted);
    fireEvent.click(await wantCell());
    await flush(1200);
    expect(await screen.findByText(/自動保存に失敗しました/)).toBeInTheDocument();
    // 失敗のあとは自動では再送しない
    await flush(5000);
    expect(saveMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '変更を保存' }));
    await flush(0);
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it('変更がなければ「変更を保存」は押せない', async () => {
    open(submitted);
    await wantCell();
    expect(screen.getByRole('button', { name: '変更を保存' })).toBeDisabled();
  });
});

describe('受付期間外', () => {
  it('提出も自動保存もできない', async () => {
    open({
      open: false,
      submittedAt: new Date(2026, 9, 1).toISOString(),
      departments: [{ ...base.departments[0]!, open: false }],
    });
    expect(await screen.findByText('受付期間外です')).toBeInTheDocument();
    const c = await wantCell();
    expect(c).toBeDisabled();
    fireEvent.click(c);
    await flush(3000);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
