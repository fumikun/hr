import { Link, useLoaderData, useNavigate, useParams } from 'react-router';
import { postApi } from '../api';
import { PostForm } from '@/components/PostsPanel';
import { Notice, Page } from '@/components/Page';
import { useQueryParam } from '@/lib/useQueryParam';
import type { AdminPostsData } from './AdminPosts';

/** 持ち場を1件編集する画面。/admin/posts/new?dept=ID で新規作成 */
export function AdminPostEdit() {
  const { departments, posts, users } = useLoaderData<AdminPostsData>();
  const { postId } = useParams();
  const [deptParam] = useQueryParam('dept');
  const navigate = useNavigate();
  const post = postId === 'new' ? null : posts.find((p) => String(p.id) === postId);
  const deptId = post
    ? post.departmentId
    : (departments.find((d) => String(d.id) === deptParam)?.id ?? departments[0]?.id ?? 0);
  const back = `/admin/posts?dept=${deptId}`;
  const candidates = users.filter((u) => u.roles.some((r) => r.departmentId === deptId));

  if (postId !== 'new' && !post)
    return (
      <Page>
        <Notice kind="error">持ち場が見つかりません。</Notice>
        <Link to="/admin/posts" className="text-sm underline">
          ← 持ち場の一覧に戻る
        </Link>
      </Page>
    );

  return (
    <Page>
      <Link to={back} className="text-muted-foreground text-sm hover:underline">
        ← 持ち場の一覧に戻る
      </Link>
      <h1 className="text-2xl font-bold">{post ? '持ち場を編集' : '持ち場を追加'}</h1>
      <p className="text-muted-foreground text-sm">
        部門：{departments.find((d) => d.id === deptId)?.name ?? ''}
      </p>
      <PostForm
        key={post?.id ?? 'new'}
        initial={post ?? { name: '', restricted: false, memberIds: [] }}
        candidates={candidates}
        onDone={() => navigate(back)}
        save={(p) => (post ? postApi.update(post.id, p) : postApi.create(deptId, p))}
        remove={post ? () => postApi.remove(post.id) : undefined}
      />
    </Page>
  );
}
