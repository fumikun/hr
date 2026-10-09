import { Hono, type Context } from 'hono';
import type { AdminStore } from '../admin/types.js';

/** 一般ユーザー: 自分の確定済みシフトだけ（下書きは公開しない） */
export function myShiftRoutes(store: AdminStore, userId: (c: Context) => number) {
  return new Hono().get('/shifts', async (c) => {
    const id = userId(c);
    const [assignments, slots, posts, departments, publishedAt] = await Promise.all([
      store.listAssignments(),
      store.listSlots(),
      store.listPosts(),
      store.listDepartments(),
      store.getPublishedAt(),
    ]);
    const mine = assignments
      .filter((a) => a.userId === id && a.status === 'confirmed')
      .flatMap((a) => {
        const slot = slots.find((s) => s.id === a.slotId);
        if (!slot) return [];
        return [
          {
            slotId: slot.id,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            department: departments.find((d) => d.id === slot.departmentId)?.name ?? '',
            post: posts.find((p) => p.id === slot.postId)?.name ?? '',
          },
        ];
      })
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return c.json({ shifts: mine, publishedAt });
  });
}
