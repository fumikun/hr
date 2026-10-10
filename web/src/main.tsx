import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  redirect,
  RouterProvider,
  type ShouldRevalidateFunction,
} from 'react-router';
import {
  adminApi,
  adminAvailabilityApi,
  assignApi,
  auditApi,
  availabilityApi,
  fetchMyShifts,
  fetchMe,
  fetchOnboarding,
  periodApi,
  postApi,
  scopeApi,
  slotApi,
} from './api';
import './styles.css';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/AppShell';
import { Home } from './routes/Home';
import { Login } from './routes/Login';
import { Onboarding } from './routes/Onboarding';
import { lazyRoute } from './routes/lazy';
import { RouteError } from './routes/RouteError';
import { ConfirmProvider } from '@/components/ConfirmDialog';

// ログイン必須。初回確認が済むまでは /onboarding 以外に進ませない（サーバー側でも業務APIを拒否する）。
// ログイン状態と「初回確認済みか」は /api/me の1回の通信で分かる。
async function requireUser() {
  const me = await fetchMe();
  if (!me) throw redirect('/login');
  return me;
}

// 初回確認が済んだ一般ユーザー向けの画面
async function requireConfirmed() {
  const me = await requireUser();
  if (!me.confirmed) throw redirect('/onboarding');
  return me;
}

// 管理者のみ。見た目の制限であり、本当の権限判定はサーバー側（/api/admin/*）で行う
async function requireAdmin() {
  const me = await requireConfirmed();
  if (!me.isAdmin) throw redirect('/');
  return me;
}

// 部門・日付タブなど、URL の ?query だけが変わるときは、データを取り直さない
const ignoreSearchChange: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) =>
  currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search
    ? false
    : defaultShouldRevalidate;

// 共通レイアウト（ログイン確認）は、別のページへ移るときだけ確認する。画面内の更新では取り直さない
const onlyOnNavigation: ShouldRevalidateFunction = ({ currentUrl, nextUrl }) =>
  currentUrl.pathname !== nextUrl.pathname;

/**
 * 画面の権限確認とデータ取得を同時に走らせる（確認を待ってからデータを取ると、通信が1往復分遅くなる）。
 * 権限がなければリダイレクトし、先に走らせたデータの結果は捨てる。
 */
function guarded<T>(guard: () => Promise<unknown>, load: () => Promise<T>): Promise<T> {
  const data = load();
  data.catch(() => undefined); // 権限エラーで捨てるとき、未処理のエラーにしない
  return guard().then(() => data);
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
    errorElement: <RouteError />,
    loader: async () => ((await fetchMe()) ? redirect('/') : null),
  },
  {
    path: '/onboarding',
    element: <Onboarding />,
    errorElement: <RouteError />,
    loader: async () => {
      const [me, data] = await Promise.all([requireUser(), fetchOnboarding()]);
      if (me.confirmed) throw redirect('/');
      return data;
    },
  },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    loader: requireConfirmed,
    shouldRevalidate: onlyOnNavigation,
    children: [
      {
        path: '/',
        element: <Home />,
        shouldRevalidate: ignoreSearchChange,
        loader: async () => {
          const [me, availability, shifts] = await Promise.all([
            requireConfirmed(),
            availabilityApi.get(),
            fetchMyShifts(),
          ]);
          return { me, availability, shifts: shifts.shifts };
        },
      },
      {
        path: '/availability',
        lazy: lazyRoute('Availability'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireConfirmed, async () => {
            return availabilityApi.get();
          }),
      },
      {
        path: '/shifts',
        lazy: lazyRoute('MyShifts'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireConfirmed, async () => {
            return fetchMyShifts();
          }),
      },
      {
        path: '/admin',
        lazy: lazyRoute('AdminDashboard'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [period, status, slots, departments, users, assign, run, scopes] =
              await Promise.all([
                periodApi.get(),
                periodApi.status(),
                slotApi.list(),
                adminApi.departments(),
                adminApi.users(),
                assignApi.data(),
                assignApi.latestRun(),
                scopeApi.get(),
              ]);
            return {
              scopes,
              period,
              status,
              slots,
              departments,
              users,
              assign,
              run,
            };
          }),
      },
      {
        path: '/admin/users',
        lazy: lazyRoute('AdminUsers'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [users, departments] = await Promise.all([
              adminApi.users(),
              adminApi.departments(),
            ]);
            return { users, departments };
          }),
      },
      {
        path: '/admin/users/:userId/availability',
        lazy: lazyRoute('Availability'),
        shouldRevalidate: ignoreSearchChange,
        loader: ({ params }) =>
          guarded(requireAdmin, async () => {
            const id = Number(params.userId);
            const [view, users] = await Promise.all([
              adminAvailabilityApi.get(id),
              adminApi.users(),
            ]);
            return { ...view, userName: users.find((u) => u.id === id)?.name };
          }),
      },
      {
        path: '/admin/departments',
        lazy: lazyRoute('AdminDepartments'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [departments, users, slots] = await Promise.all([
              adminApi.departments(),
              adminApi.users(),
              slotApi.list(),
            ]);
            return { departments, users, slots };
          }),
      },
      {
        path: '/admin/slots',
        lazy: lazyRoute('AdminSlots'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [departments, posts, slots, users] = await Promise.all([
              adminApi.departments(),
              postApi.list(),
              slotApi.list(),
              adminApi.users(),
            ]);
            return { departments, posts, slots, users };
          }),
      },
      {
        path: '/admin/posts',
        lazy: lazyRoute('AdminPosts'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [departments, posts, users] = await Promise.all([
              adminApi.departments(),
              postApi.list(),
              adminApi.users(),
            ]);
            return { departments, posts, users };
          }),
      },
      {
        path: '/admin/posts/:postId',
        lazy: lazyRoute('AdminPostEdit'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [departments, posts, users] = await Promise.all([
              adminApi.departments(),
              postApi.list(),
              adminApi.users(),
            ]);
            return { departments, posts, users };
          }),
      },
      {
        path: '/admin/availability',
        lazy: lazyRoute('AdminAvailability'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [period, status, users, departments, posts, scopes] = await Promise.all([
              periodApi.get(),
              periodApi.status(),
              adminApi.users(),
              adminApi.departments(),
              postApi.list(),
              scopeApi.get(),
            ]);
            return { period, status, users, departments, posts, scopes };
          }),
      },
      {
        path: '/admin/assign',
        lazy: lazyRoute('AdminAssign'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [departments, posts, slots, users, assign, run] = await Promise.all([
              adminApi.departments(),
              postApi.list(),
              slotApi.list(),
              adminApi.users(),
              assignApi.data(),
              assignApi.latestRun(),
            ]);
            return { departments, posts, slots, users, assign, run };
          }),
      },
      {
        path: '/admin/print',
        lazy: lazyRoute('AdminPrint'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            const [departments, posts, slots, users, assign] = await Promise.all([
              adminApi.departments(),
              postApi.list(),
              slotApi.list(),
              adminApi.users(),
              assignApi.data(),
            ]);
            return { departments, posts, slots, users, assign };
          }),
      },
      {
        path: '/admin/audit',
        lazy: lazyRoute('AdminAudit'),
        shouldRevalidate: ignoreSearchChange,
        loader: () =>
          guarded(requireAdmin, async () => {
            return { rows: await auditApi.list() };
          }),
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <RouterProvider router={router} />
    </ConfirmProvider>
    <Toaster />
  </StrictMode>,
);
