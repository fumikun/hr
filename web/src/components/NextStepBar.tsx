import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { assignApi, periodApi, scopeApi, slotApi, adminApi } from '../api';
import { adminSteps, type Step } from '../lib/adminSteps';

/** 管理画面の上部に出す「次にやること」の帯。ダッシュボードの作業の流れと同じ判定を使う */
export function NextStepBar() {
  const { pathname } = useLocation();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const show = pathname.startsWith('/admin') && pathname !== '/admin';

  useEffect(() => {
    if (!show) return;
    let alive = true;
    Promise.all([
      periodApi.get(),
      periodApi.status(),
      slotApi.list(),
      adminApi.users(),
      assignApi.data(),
      assignApi.latestRun(),
      scopeApi.get(),
    ])
      .then(([period, status, slots, users, assign, run, scopes]) => {
        if (alive) setSteps(adminSteps({ period, status, slots, users, assign, run, scopes }));
      })
      .catch(() => alive && setSteps(null)); // 帯が出せなくても、画面の操作には影響しない
    return () => {
      alive = false;
    };
  }, [pathname, show]);

  const index = steps?.findIndex((s) => !s.done) ?? -1;
  if (!show || !steps || index < 0) return null;
  const step = steps[index]!;
  if (step.wait) return null;
  return (
    <div className="bg-primary/5 flex min-h-11 items-center gap-x-2 border-b px-4 py-1 text-sm print:hidden">
      <p className="min-w-0 flex-1">
        <span className="text-muted-foreground">次にやること：</span>
        <span className="font-medium">{step.title}</span>
        <span className="text-muted-foreground hidden sm:inline">（{step.detail}）</span>
      </p>
      {pathname !== step.to && (
        // スマホでも押しやすいよう、高さのあるボタンの形にする
        <Link
          to={step.to}
          className="text-primary -mr-2 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md px-2 font-medium underline"
        >
          {step.link}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
