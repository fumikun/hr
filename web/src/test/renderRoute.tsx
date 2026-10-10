import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { ConfirmProvider } from '@/components/ConfirmDialog';

/**
 * 画面を、本物のルーターとデータ取得（loader）つきで描画する。
 * routes に他のパスの目印を渡すと、画面遷移したことを確かめられる。
 */
export function renderRoute(
  path: string,
  route: { path: string; element: ReactNode; loaderData: unknown },
  others: RouteObject[] = [],
) {
  const router = createMemoryRouter(
    [{ path: route.path, element: route.element, loader: () => route.loaderData }, ...others],
    { initialEntries: [path] },
  );
  const utils = render(
    <ConfirmProvider>
      <RouterProvider router={router} />
    </ConfirmProvider>,
  );
  return { ...utils, router };
}
