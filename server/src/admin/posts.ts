import type { Post } from './types.js';

/**
 * 持ち場に入れるか。部門の所属者であることが前提で、
 * restricted な持ち場はさらに登録メンバーに限る。
 */
export function canWorkPost(
  post: Pick<Post, 'departmentId' | 'restricted' | 'memberIds'>,
  user: { id: number; departmentIds: readonly number[] },
): boolean {
  if (!user.departmentIds.includes(post.departmentId)) return false;
  return !post.restricted || post.memberIds.includes(user.id);
}
