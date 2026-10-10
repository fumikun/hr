import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * スマホ用の一覧の1行。1行目に名前と状態、2行目に補足を小さく出し、行全体を押せるようにする。
 * 100人規模の一覧でも1件あたり約56pxに収まる。aside は行の右端に置く別の操作（任意）。
 */
export function ListRow({
  title,
  badge,
  sub,
  to,
  onClick,
  aside,
}: {
  title: ReactNode;
  badge?: ReactNode;
  sub?: ReactNode;
  to?: string;
  onClick?: () => void;
  aside?: ReactNode;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {badge}
        </span>
        {sub && <span className="text-muted-foreground block truncate text-xs">{sub}</span>}
      </span>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </>
  );
  const cls =
    'hover:bg-accent/60 flex min-h-14 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm';
  return (
    <li className="flex items-center">
      {to ? (
        <Link to={to} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" className={cls} onClick={onClick}>
          {body}
        </button>
      )}
      {aside && <span className="shrink-0 pr-2">{aside}</span>}
    </li>
  );
}

/** ListRow を並べる枠。sm 以上では隠す（表を使う） */
export function MobileList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn('bg-card divide-y rounded-lg border sm:hidden', className)}>{children}</ul>
  );
}
