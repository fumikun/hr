import { Plus } from 'lucide-react';
import { useLoaderData, Link } from 'react-router';
import type { AdminUser, Department, Post } from '../api';
import { Notice, Page } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryParam, useSetQueryParams } from '@/lib/useQueryParam';

export type AdminPostsData = { departments: Department[]; posts: Post[]; users: AdminUser[] };

/** 持ち場の一覧。編集は1件ずつ別画面で行う */
export function AdminPosts() {
  const { departments, posts } = useLoaderData<AdminPostsData>();
  const [deptParam] = useQueryParam('dept');
  const setQuery = useSetQueryParams();
  const deptId = departments.find((d) => String(d.id) === deptParam)?.id ?? departments[0]?.id ?? 0;
  const deptPosts = posts.filter((p) => p.departmentId === deptId);

  return (
    <Page wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">持ち場</h1>
        <Button asChild>
          <Link to={`/admin/posts/new?dept=${deptId}`}>
            <Plus className="size-4" aria-hidden />
            持ち場を追加
          </Link>
        </Button>
      </div>
      <Tabs value={String(deptId)} onValueChange={(v) => setQuery({ dept: v })}>
        <TabsList className="h-auto! w-full flex-wrap justify-start gap-1">
          {departments.map((d) => (
            <TabsTrigger key={d.id} value={String(d.id)} className="h-8 flex-none">
              {d.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {deptPosts.length === 0 ? (
        <Notice kind="info">この部門にはまだ持ち場がありません。</Notice>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {deptPosts.map((p) => (
            <li key={p.id}>
              <Link to={`/admin/posts/${p.id}?dept=${deptId}`} className="block">
                <Card className="hover:bg-accent/50 py-3">
                  <CardContent className="flex items-center justify-between gap-2 px-4">
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <Badge variant={p.restricted ? 'default' : 'secondary'}>
                      {p.restricted ? `限定 ${p.memberIds.length}人` : '誰でも'}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
