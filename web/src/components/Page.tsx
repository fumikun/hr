import type { ReactNode } from 'react';
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

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-destructive text-sm">
      {children}
    </p>
  );
}
