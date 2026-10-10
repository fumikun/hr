// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser, Department, Post } from '../api';
import { renderRoute } from '../test/renderRoute';
import { AdminPostEdit } from './AdminPostEdit';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  postApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
import { postApi } from '../api';

const departments = [
  { id: 1, name: '総務部' },
  { id: 2, name: '模擬店部' },
] as Department[];
const posts: Post[] = [
  { id: 10, departmentId: 1, name: '受付', restricted: false, memberIds: [] },
  { id: 11, departmentId: 2, name: '調理', restricted: true, memberIds: [101] },
];
const user = (id: number, name: string, departmentId: number) =>
  ({ id, name, email: `${name}@x.jp`, roles: [{ departmentId }] }) as unknown as AdminUser;
const users = [user(100, '山田', 1), user(101, '佐藤', 2), user(102, '鈴木', 2)];

function open(path: string) {
  return renderRoute(
    path,
    {
      path: '/admin/posts/:postId',
      element: <AdminPostEdit />,
      loaderData: { departments, posts, users },
    },
    [{ path: '/admin/posts', element: <p>持ち場の一覧</p> }],
  );
}

beforeEach(() => {
  vi.mocked(postApi.create)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(postApi.update)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(postApi.remove)
    .mockReset()
    .mockResolvedValue({} as never);
});

describe('持ち場の編集画面', () => {
  it('既存の持ち場を、いまの内容で開く', async () => {
    open('/admin/posts/11');
    expect(await screen.findByRole('heading', { name: '持ち場を編集' })).toBeInTheDocument();
    expect(screen.getByLabelText('持ち場の名前')).toHaveValue('調理');
    expect(screen.getByText('部門：模擬店部')).toBeInTheDocument();
    // 一部の人だけ → その部門の所属者だけが候補に出る
    expect(screen.getByLabelText(/佐藤/)).toBeChecked();
    expect(screen.getByLabelText(/鈴木/)).not.toBeChecked();
    expect(screen.queryByLabelText(/山田/)).not.toBeInTheDocument();
  });

  it('名前を変えて保存すると update が呼ばれ、一覧に戻る', async () => {
    open('/admin/posts/10');
    const name = await screen.findByLabelText('持ち場の名前');
    await userEvent.clear(name);
    await userEvent.type(name, '総合受付');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(postApi.update).toHaveBeenCalledWith(10, {
        name: '総合受付',
        restricted: false,
        memberIds: [],
      }),
    );
    expect(await screen.findByText('持ち場の一覧')).toBeInTheDocument();
  });

  it('新規作成は、?dept= の部門に create する', async () => {
    open('/admin/posts/new?dept=2');
    expect(await screen.findByRole('heading', { name: '持ち場を追加' })).toBeInTheDocument();
    expect(screen.getByText('部門：模擬店部')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('持ち場の名前'), '洗い場');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(postApi.create).toHaveBeenCalledWith(2, {
        name: '洗い場',
        restricted: false,
        memberIds: [],
      }),
    );
    expect(postApi.update).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'この持ち場を削除' })).not.toBeInTheDocument();
  });

  it('「一部の人だけ」で誰も選ばないと保存できない', async () => {
    open('/admin/posts/new?dept=1');
    await userEvent.type(await screen.findByLabelText('持ち場の名前'), '係');
    await userEvent.click(screen.getByRole('button', { name: '一部の人だけ' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('入れる人を1人以上選んでください')).toBeInTheDocument();
    expect(postApi.create).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText(/山田/));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(postApi.create).toHaveBeenCalledWith(1, {
        name: '係',
        restricted: true,
        memberIds: [100],
      }),
    );
  });

  it('「部門の誰でも」に戻すと、選んでいた人は送らない', async () => {
    open('/admin/posts/11');
    await screen.findByLabelText('持ち場の名前');
    await userEvent.click(screen.getByRole('button', { name: '部門の誰でも' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(postApi.update).toHaveBeenCalledWith(11, {
        name: '調理',
        restricted: false,
        memberIds: [],
      }),
    );
  });

  it('削除は確認ダイアログで「削除」を選んだときだけ行い、一覧に戻る', async () => {
    open('/admin/posts/10');
    await userEvent.click(await screen.findByRole('button', { name: 'この持ち場を削除' }));
    expect(await screen.findByText('この持ち場を削除しますか？')).toBeInTheDocument();
    expect(postApi.remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '削除' }));
    await waitFor(() => expect(postApi.remove).toHaveBeenCalledWith(10));
    expect(await screen.findByText('持ち場の一覧')).toBeInTheDocument();
  });

  it('保存に失敗したらエラーを出し、画面に残る', async () => {
    vi.mocked(postApi.update).mockRejectedValue(new Error('保存に失敗しました (500)'));
    open('/admin/posts/10');
    await screen.findByLabelText('持ち場の名前');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('保存に失敗しました (500)')).toBeInTheDocument();
    expect(screen.queryByText('持ち場の一覧')).not.toBeInTheDocument();
  });

  it('存在しない持ち場は、見つからない旨と戻るリンクを出す', async () => {
    open('/admin/posts/999');
    expect(await screen.findByText('持ち場が見つかりません。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /一覧に戻る/ })).toHaveAttribute(
      'href',
      '/admin/posts',
    );
  });
});
