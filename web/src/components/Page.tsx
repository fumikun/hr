import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function Page({
  children,
  wide,
  back,
}: {
  children: ReactNode;
  wide?: boolean;
  back?: boolean;
}) {
  return (
    <main className={cn('mx-auto w-full space-y-4 px-4 py-8', wide ? 'max-w-5xl' : 'max-w-md')}>
      {back && (
        <Link to="/" className="text-muted-foreground text-sm hover:underline">
          ← ホーム
        </Link>
      )}
      {children}
    </main>
  );
}

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-destructive text-sm">
      {children}
    </p>
  );
}
