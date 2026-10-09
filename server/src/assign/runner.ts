import { findShortages } from './model.js';
import type { Solver } from './workerSolver.js';
import type { AssignStore, Run, RunSummary, SolveOptions } from './types.js';

/**
 * 自動割り当てを非同期に実行する。同時に走らせるのは1つだけ。
 * 進行状況（phase）と結果は assignment_runs に保存し、画面はそれをポーリングする。
 */
export function createAssignRunner(store: AssignStore, solver: Solver) {
  let current: Promise<void> | null = null;

  async function execute(run: Run, actorId: number, options: SolveOptions) {
    try {
      await store.updateRun(run.id, { phase: 'loading' });
      const input = await store.loadSolveInput();
      await store.updateRun(run.id, { phase: 'solving' });
      const result = await solver(input, options);
      await store.updateRun(run.id, { phase: 'saving' });
      const shortages = findShortages(input.slots, [...input.locked, ...result.assignments]);
      const summary: RunSummary = {
        assigned: result.assignments.length,
        shortageSlots: shortages.length,
        shortagePeople: shortages.reduce((n, s) => n + s.missing, 0),
        solverStatus: result.status,
      };
      await store.replaceAutoAssignments(result.assignments, actorId, summary);
      await store.updateRun(run.id, { status: 'done', phase: 'done', result: summary });
    } catch (e) {
      await store
        .updateRun(run.id, {
          status: 'failed',
          phase: 'failed',
          error: e instanceof Error ? e.message : String(e),
        })
        .catch(() => undefined);
    }
  }

  return {
    /** 実行中なら null */
    async start(actorId: number, options: SolveOptions): Promise<Run | null> {
      if (current) return null;
      const run = await store.createRun(actorId, options);
      if (!run) return null;
      current = execute(run, actorId, options).finally(() => {
        current = null;
      });
      return run;
    },
    /** テスト用: 実行中のジョブの完了を待つ */
    idle: () => current ?? Promise.resolve(),
  };
}
export type AssignRunner = ReturnType<typeof createAssignRunner>;
