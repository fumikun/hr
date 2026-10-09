import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main
      id="main"
      className={cn('mx-auto w-full space-y-4 px-4 py-6 lg:py-8', wide ? 'max-w-6xl' : 'max-w-md')}
    >
      {children}
    </main>
  );
}

const NOTICE = {
  info: { variant: 'info', icon: Info },
  warning: { variant: 'warning', icon: AlertTriangle },
  error: { variant: 'destructive', icon: OctagonAlert },
} as const;

/** お知らせの表示。案内(info)・注意(warning)・エラー(error)を見た目で分ける */
export function Notice({
  kind = 'info',
  title,
  children,
  className,
}: {
  kind?: keyof typeof NOTICE;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { variant, icon: Icon } = NOTICE[kind];
  return (
    <Alert variant={variant} className={className} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon />
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription>{children}</AlertDescription>}
    </Alert>
  );
}

/** 操作した場所の近くに出すエラー */
export function ErrorAlert({ children }: { children: ReactNode }) {
  return <Notice kind="error">{children}</Notice>;
}
