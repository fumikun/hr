import type { ComponentType } from 'react';

// 画面ごとに別ファイルにして、必要になったときに読み込む（一般ユーザーに管理者画面を配信しない）
const modules = {
  AdminAssign: () => import('./AdminAssign'),
  AdminAudit: () => import('./AdminAudit'),
  AdminAvailability: () => import('./AdminAvailability'),
  AdminDashboard: () => import('./AdminDashboard'),
  AdminDepartments: () => import('./AdminDepartments'),
  AdminPrint: () => import('./AdminPrint'),
  AdminSlots: () => import('./AdminSlots'),
  AdminUsers: () => import('./AdminUsers'),
  Availability: () => import('./Availability'),
  MyShifts: () => import('./MyShifts'),
} as const;
type Name = keyof typeof modules;

export const lazyRoute = (name: Name) => () =>
  modules[name]().then((m) => ({ Component: (m as Record<string, ComponentType>)[name]! }));

const MEMBER: Name[] = ['Availability', 'MyShifts', 'Availability'];

/** 画面が落ち着いたあとに、これから使いそうな画面を先に読み込んでおく（初めて開くときの待ちをなくす） */
export function prefetchRoutes(isAdmin: boolean) {
  const names = (Object.keys(modules) as Name[]).filter((n) => isAdmin || MEMBER.includes(n));
  const load = () => names.forEach((n) => void modules[n]().catch(() => undefined));
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 2000);
}
