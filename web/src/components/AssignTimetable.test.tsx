// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser, AssignmentRow, Post, Slot } from '../api';
import { AssignTimetable, SlotPanel } from './AssignTimetable';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  candidatesApi: vi.fn(),
}));
import { candidatesApi } from '../api';

const post: Post = { id: 1, departmentId: 1, name: '受付', restricted: false, memberIds: [] };
const slot = (id: number, h: number, minPeople = 1): Slot => ({
  id,
  departmentId: 1,
  postId: 1,
  startsAt: new Date(2026, 9, 10, h).toISOString(),
  endsAt: new Date(2026, 9, 10, h + 1).toISOString(),
  minPeople,
  maxPeople: 2,
});
const user = (id: number, name: string, targetMinutes: number | null = 600) =>
  ({ id, name, email: `${name}@x`, targetMinutes, roles: [] }) as unknown as AdminUser;
const row = (userId: number, slotId: number, over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  userId,
  slotId,
  source: 'auto',
  locked: false,
  status: 'draft',
  ...over,
});

function setup(over: Partial<React.ComponentProps<typeof AssignTimetable>> = {}) {
  const props = {
    posts: [post],
    slots: [slot(1, 9), slot(2, 10)],
    assignments: [row(1, 1), row(2, 1, { status: 'confirmed' })],
    userById: new Map([user(1, '山田'), user(2, '佐藤')].map((u) => [u.id, u])),
    missingOf: (id: number) => (id === 2 ? 1 : 0),
    warningsOf: () => [] as string[],
    selected: null,
    disabled: false,
    onSelect: vi.fn(),
    onMove: vi.fn(),
    onRemove: vi.fn(),
    onToggleLock: vi.fn(),
    ...over,
  };
  const { container } = render(<AssignTimetable {...props} />);
  // スマホ用の一覧と sm 以上の時間割は、両方を描画して CSS で切り替える
  const desk = within(container.querySelector<HTMLElement>('.hidden.sm\\:block')!);
  const mob = within(container.querySelector<HTMLElement>('.sm\\:hidden')!);
  return Object.assign(props, { desk, mob });
}

describe('AssignTimetable（sm 以上の時間割）', () => {
  // jsdom には DataTransfer が無い
  const dataTransfer = { effectAllowed: '', setData: () => {} };

  it('不足している枠に「あと◯人」を出す', () => {
    const { desk } = setup();
    expect(desk.getByRole('button', { name: /10:00から11:00.*あと1人必要/ })).toBeInTheDocument();
    expect(desk.getByRole('button', { name: /9:?00?から10:00/ })).not.toHaveAccessibleName(/あと/);
  });

  it('枠をクリックすると選択、選択中にもう一度で解除', async () => {
    const p = setup();
    const { desk } = p;
    await userEvent.click(desk.getByRole('button', { name: /10:00から11:00/ }));
    expect(p.onSelect).toHaveBeenCalledWith(2);
  });
  it('選択中の枠をクリックすると null で解除', async () => {
    const p = setup({ selected: 2 });
    const { desk } = p;
    await userEvent.click(desk.getByRole('button', { name: /10:00から11:00/ }));
    expect(p.onSelect).toHaveBeenCalledWith(null);
  });

  it('名前を別の枠へドラッグすると onMove が呼ばれる', () => {
    const p = setup();
    const { desk } = p;
    const chip = desk.getByText('山田').closest('li')!;
    const target = desk.getByRole('button', { name: /10:00から11:00/ });
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    expect(p.onMove).toHaveBeenCalledWith(1, 1, 2);
  });
  it('同じ枠へのドロップでは何も起きない', () => {
    const p = setup();
    const { desk } = p;
    const chip = desk.getByText('山田').closest('li')!;
    const same = desk.getByRole('button', { name: /9:?00?から10:00|09:00から10:00/ });
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.drop(same);
    expect(p.onMove).not.toHaveBeenCalled();
  });
  it('公開済みの割り当てはドラッグできない', () => {
    const { desk } = setup();
    expect(desk.getByText(/佐藤/).closest('li')).toHaveAttribute('draggable', 'false');
    expect(desk.getByText('山田').closest('li')).toHaveAttribute('draggable', 'true');
  });
  it('操作を無効にしているときはドラッグできない', () => {
    const { desk } = setup({ disabled: true });
    expect(desk.getByText('山田').closest('li')).toHaveAttribute('draggable', 'false');
  });

  it('外す・ピン留めのボタンが、枠の選択を巻き込まない', async () => {
    const p = setup();
    const { desk } = p;
    await userEvent.click(desk.getByRole('button', { name: '山田さんを外す' }));
    expect(p.onRemove).toHaveBeenCalledWith(1, 1);
    await userEvent.click(desk.getByRole('button', { name: '山田さんをピン留め' }));
    expect(p.onToggleLock).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('警告のある人には ⚠ と理由を出す', () => {
    const { desk } = setup({ warningsOf: (u) => (u === 1 ? ['入れない時間帯'] : []) });
    const chip = desk.getByText(/山田/).closest('li')!;
    expect(chip).toHaveTextContent('⚠');
    expect(chip).toHaveAttribute('title', expect.stringContaining('入れない時間帯'));
  });
});

describe('AssignTimetable（スマホの一覧）', () => {
  it('枠ごとに人数と不足を出し、タップで選択する', async () => {
    const p = setup();
    expect(p.mob.getByText('⚠ あと1人')).toBeInTheDocument();
    await userEvent.click(p.mob.getByRole('button', { name: /10:00–11:00/ }));
    expect(p.onSelect).toHaveBeenCalledWith(2);
  });
  it('選択した枠のすぐ下に renderPanel の内容を出す', () => {
    const renderPanel = vi.fn(() => <p>操作パネル</p>);
    const p = setup({ selected: 2, renderPanel });
    expect(p.mob.getByText('操作パネル')).toBeInTheDocument();
    expect(renderPanel).toHaveBeenCalledWith(2, true);
  });
  it('選択していない枠にはパネルを出さない', () => {
    const p = setup({ selected: null, renderPanel: () => <p>操作パネル</p> });
    expect(p.mob.queryByText('操作パネル')).not.toBeInTheDocument();
  });
  it('外す・ピン留め・警告の理由が使える', async () => {
    const p = setup({ warningsOf: (u) => (u === 1 ? ['入れない時間帯'] : []) });
    expect(p.mob.getByText('⚠ 入れない時間帯')).toBeInTheDocument();
    await userEvent.click(p.mob.getByRole('button', { name: '山田さんを外す' }));
    expect(p.onRemove).toHaveBeenCalledWith(1, 1);
    await userEvent.click(p.mob.getByRole('button', { name: '山田さんをピン留め' }));
    expect(p.onToggleLock).toHaveBeenCalled();
  });
  it('操作を無効にしているときは、外す・ピン留めを押せない', () => {
    const p = setup({ disabled: true });
    expect(p.mob.getByRole('button', { name: '山田さんを外す' })).toBeDisabled();
  });
});

describe('SlotPanel', () => {
  const s = slot(2, 10);
  const users = [user(1, '山田'), user(2, '佐藤', 600), user(3, '鈴木')];
  const cand = (userId: number, over = {}) => ({
    userId,
    reasons: [],
    wants: false,
    assignedMinutes: 0,
    ...over,
  });
  const render1 = (over: Partial<React.ComponentProps<typeof SlotPanel>> = {}) => {
    const props = {
      slot: s,
      postName: '受付',
      assigned: [] as number[],
      users,
      missing: 1,
      disabled: false,
      onAdd: vi.fn(),
      onPick: vi.fn(),
      ...over,
    };
    render(<SlotPanel {...props} />);
    return props;
  };

  it('不足していれば、おすすめを1人出して、押すと追加される', async () => {
    vi.mocked(candidatesApi).mockResolvedValue([
      cand(1, { reasons: ['unavailable'] }),
      cand(2, { wants: true, assignedMinutes: 60 }),
      cand(3),
    ]);
    const p = render1();
    const btn = await screen.findByRole('button', { name: /おすすめ：佐藤/ });
    expect(btn).toHaveTextContent('入りたい・目標まであと9h');
    await userEvent.click(btn);
    expect(p.onAdd).toHaveBeenCalledWith(2);
  });
  it('警告のない人がいなければ、その旨を出す', async () => {
    vi.mocked(candidatesApi).mockResolvedValue([cand(1, { reasons: ['double_booked'] })]);
    render1();
    expect(await screen.findByText('警告なしで入れる人がいません')).toBeInTheDocument();
  });
  it('不足がなければ候補を探さず、おすすめも出さない', async () => {
    vi.mocked(candidatesApi).mockClear();
    render1({ missing: 0, assigned: [1] });
    await waitFor(() => expect(screen.queryByText(/おすすめ/)).not.toBeInTheDocument());
    expect(candidatesApi).not.toHaveBeenCalled();
  });
  it('「ほかの人を選ぶ」で onPick が呼ばれる', async () => {
    vi.mocked(candidatesApi).mockResolvedValue([]);
    const p = render1();
    await userEvent.click(screen.getByRole('button', { name: 'ほかの人を選ぶ' }));
    expect(p.onPick).toHaveBeenCalled();
  });
});
