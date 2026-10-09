import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, redirect, RouterProvider } from 'react-router';
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
  slotApi,
} from './api';
import './styles.css';
import { Toaster } from '@/components/ui/sonner';
import { AdminAudit } from './routes/AdminAudit';
import { AdminPrint } from './routes/AdminPrint';
import { MyShifts } from './routes/MyShifts';
import { AdminDashboard } from './routes/AdminDashboard';
import { AdminDepartments } from './routes/AdminDepartments';
import { AppShell } from '@/components/AppShell';
import { AdminAssign } from './routes/AdminAssign';
import { AdminAvailability } from './routes/AdminAvailability';
import { Availability } from './routes/Availability';
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

// 初回確認が済んだ一般ユーザー向けの画面
async function requireConfirmed() {
  const me = await requireUser();
  if (!(await fetchOnboarding()).confirmed) throw redirect('/onboarding');
  return me;
}

const router = createBrowserRouter([
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
    element: <AppShell />,
    loader: requireConfirmed,
    children: [
      {
        path: '/',
        element: <Home />,
        loader: async () => {
          const [me, availability, shifts] = await Promise.all([
            requireConfirmed(),
            availabilityApi.get(),
            fetchMyShifts(),
          ]);
          return { me, availability, shifts };
        },
      },
      {
        path: '/availability',
        element: <Availability />,
        loader: async () => {
          await requireConfirmed();
          return availabilityApi.get();
        },
      },
      {
        path: '/shifts',
        element: <MyShifts />,
        loader: async () => {
          await requireConfirmed();
          return fetchMyShifts();
        },
      },
      {
        path: '/admin',
        element: <AdminDashboard />,
        loader: async () => {
          await requireAdmin();
          const [period, status, slots, departments, users, assign, run, audit] = await Promise.all(
            [
              periodApi.get(),
              periodApi.status(),
              slotApi.list(),
              adminApi.departments(),
              adminApi.users(),
              assignApi.data(),
              assignApi.latestRun(),
              auditApi.list(),
            ],
          );
          return {
            period,
            status,
            slots,
            departments,
            users,
            assign,
            run,
            audit: audit.slice(0, 8),
          };
        },
      },
      {
        path: '/admin/users',
        element: <AdminUsers />,
        loader: async () => {
          await requireAdmin();
          const [users, departments] = await Promise.all([
            adminApi.users(),
            adminApi.departments(),
          ]);
          return { users, departments };
        },
      },
      {
        path: '/admin/users/:userId/availability',
        element: <Availability />,
        loader: async ({ params }) => {
          await requireAdmin();
          const id = Number(params.userId);
          const [view, users] = await Promise.all([adminAvailabilityApi.get(id), adminApi.users()]);
          return { ...view, userName: users.find((u) => u.id === id)?.name };
        },
      },
      {
        path: '/admin/departments',
        element: <AdminDepartments />,
        loader: async () => {
          await requireAdmin();
          const [departments, users, slots] = await Promise.all([
            adminApi.departments(),
            adminApi.users(),
            slotApi.list(),
          ]);
          return { departments, users, slots };
        },
      },
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
        path: '/admin/availability',
        element: <AdminAvailability />,
        loader: async () => {
          await requireAdmin();
          const [period, status] = await Promise.all([periodApi.get(), periodApi.status()]);
          return { period, status };
        },
      },
      {
        path: '/admin/assign',
        element: <AdminAssign />,
        loader: async () => {
          await requireAdmin();
          const [departments, posts, slots, users, assign, run] = await Promise.all([
            adminApi.departments(),
            postApi.list(),
            slotApi.list(),
            adminApi.users(),
            assignApi.data(),
            assignApi.latestRun(),
          ]);
          return { departments, posts, slots, users, assign, run };
        },
      },
      {
        path: '/admin/print',
        element: <AdminPrint />,
        loader: async () => {
          await requireAdmin();
          const [departments, posts, slots, users, assign] = await Promise.all([
            adminApi.departments(),
            postApi.list(),
            slotApi.list(),
            adminApi.users(),
            assignApi.data(),
          ]);
          return { departments, posts, slots, users, assign };
        },
      },
      {
        path: '/admin/audit',
        element: <AdminAudit />,
        loader: async () => {
          await requireAdmin();
          return auditApi.list();
        },
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster />
  </StrictMode>,
);
