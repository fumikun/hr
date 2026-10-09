import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, redirect, RouterProvider } from 'react-router';
import { adminApi, fetchMe, fetchOnboarding, postApi, slotApi } from './api';
import './styles.css';
import { Toaster } from '@/components/ui/sonner';
import { AdminSlots } from './routes/AdminSlots';
import { AdminUsers } from './routes/AdminUsers';
import { Home } from './routes/Home';
import { Login } from './routes/Login';
import { Onboarding } from './routes/Onboarding';

// ログイン必須。初回確認が済むまでは /onboarding 以外に進ませない（サーバー側でも業務APIを拒否する）
async function requireUser() {
  const me = await fetchMe();
  if (!me) throw redirect('/login');
  return me;
}

// 管理者のみ。見た目の制限であり、本当の権限判定はサーバー側（/api/admin/*）で行う
async function requireAdmin() {
  const me = await requireUser();
  if (!(await fetchOnboarding()).confirmed) throw redirect('/onboarding');
  if (!me.isAdmin) throw redirect('/');
  return me;
}

const router = createBrowserRouter([
  {
    path: '/admin/slots',
    element: <AdminSlots />,
    loader: async () => {
      await requireAdmin();
      const [departments, posts, slots, users] = await Promise.all([
        adminApi.departments(),
        postApi.list(),
        slotApi.list(),
        adminApi.users(),
      ]);
      return { departments, posts, slots, users };
    },
  },
  {
    path: '/admin/users',
    element: <AdminUsers />,
    loader: async () => {
      await requireAdmin();
      const [users, departments] = await Promise.all([adminApi.users(), adminApi.departments()]);
      return { users, departments };
    },
  },
  {
    path: '/login',
    element: <Login />,
    loader: async () => ((await fetchMe()) ? redirect('/') : null),
  },
  {
    path: '/onboarding',
    element: <Onboarding />,
    loader: async () => {
      await requireUser();
      const data = await fetchOnboarding();
      if (data.confirmed) throw redirect('/');
      return data;
    },
  },
  {
    path: '/',
    element: <Home />,
    loader: async () => {
      const me = await requireUser();
      if (!(await fetchOnboarding()).confirmed) throw redirect('/onboarding');
      return me;
    },
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster />
  </StrictMode>,
);
