import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  History,
  Home,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Printer,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLoaderData, useLocation, useNavigation } from 'react-router';
import { postAuthForm, type Me } from '../api';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean };

const MEMBER: Item[] = [
  { to: '/', label: 'ホーム', icon: Home, end: true },
  { to: '/availability', label: 'シフト希望の入力', icon: CalendarCheck },
  { to: '/shifts', label: '自分のシフト', icon: CalendarDays },
];
const ADMIN: Item[] = [
  { to: '/admin', label: 'ダッシュボード', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'ユーザー', icon: Users },
  { to: '/admin/departments', label: '部門', icon: Building2 },
  { to: '/admin/slots', label: '枠・持ち場', icon: LayoutGrid },
  { to: '/admin/availability', label: '希望の受付・状況', icon: ClipboardList },
  { to: '/admin/assign', label: '割り当て', icon: Sparkles },
  { to: '/admin/print', label: '印刷・出力', icon: Printer },
  { to: '/admin/audit', label: '操作履歴', icon: History },
];

function NavGroup({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: Item[];
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground px-3 pb-1 text-xs font-medium">{title}</p>
      <ul className="space-y-0.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarContent({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-3">
        <p className="font-bold">高専祭 シフト調整</p>
      </div>
      <nav aria-label="メインメニュー" className="flex-1 space-y-6 overflow-y-auto">
        <NavGroup title="メニュー" items={MEMBER} onNavigate={onNavigate} />
        {me.isAdmin && <NavGroup title="管理者" items={ADMIN} onNavigate={onNavigate} />}
      </nav>
      <div className="border-t pt-4">
        <p className="truncate px-3 text-sm font-medium">{me.name}</p>
        <p className="text-muted-foreground truncate px-3 pb-2 text-xs">
          {me.isAdmin ? '管理者' : '一般'}・{me.email}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3"
          onClick={() => void postAuthForm('/api/auth/signout', {})}
        >
          <LogOut className="size-4" aria-hidden />
          ログアウト
        </Button>
      </div>
    </div>
  );
}

/**
 * ログイン後の共通レイアウト。デスクトップ(lg以上)は左サイドバー、
 * それより狭い画面は上部バー＋スライドメニュー。印刷時はどちらも隠す。
 */
export function AppShell() {
  const me = useLoaderData<Me>();
  const [open, setOpen] = useState(false);
  const loading = useNavigation().state === 'loading';
  const { pathname } = useLocation();

  // タブの表示名を、今開いているメニュー名にする
  useEffect(() => {
    const current = [...MEMBER, ...ADMIN]
      .filter((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))
      .sort((a, b) => b.to.length - a.to.length)[0];
    document.title = current ? `${current.label} | 高専祭 シフト調整` : '高専祭 シフト調整';
  }, [pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="bg-background sr-only z-50 rounded p-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        本文へ移動
      </a>
      <aside className="bg-card sticky top-0 hidden h-screen border-r lg:block print:hidden">
        <SidebarContent me={me} />
      </aside>

      <div className="min-w-0">
        <header className="bg-background sticky top-0 z-40 flex h-12 items-center gap-2 border-b px-2 lg:hidden print:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="メニューを開く"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <span className="font-bold">高専祭 シフト調整</span>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">メニュー</SheetTitle>
            <SheetDescription className="sr-only">ページを移動します</SheetDescription>
            <SidebarContent me={me} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* 画面遷移中は上端に細いバーを出して、押したことが分かるようにする */}
        <div
          aria-hidden
          className={cn(
            'bg-primary fixed top-0 right-0 left-0 z-50 h-0.5 transition-opacity print:hidden',
            loading ? 'animate-pulse opacity-100' : 'opacity-0',
          )}
        />
        <Outlet />
      </div>
    </div>
  );
}
