import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, redirect, RouterProvider } from 'react-router';
import { fetchMe, fetchOnboarding } from './api';
import './styles.css';
import { Home } from './routes/Home';
import { Login } from './routes/Login';
import { Onboarding } from './routes/Onboarding';

// ログイン必須。初回確認が済むまでは /onboarding 以外に進ませない（サーバー側でも業務APIを拒否する）
async function requireUser() {
  const me = await fetchMe();
  if (!me) throw redirect('/login');
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
  </StrictMode>,
);
