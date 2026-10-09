import { parentPort, workerData } from 'node:worker_threads';
import { solve } from './solver.js';
import type { SolveInput, SolveOptions } from './types.js';

// HiGHS は同期的に動いてイベントループを止めるので、別スレッドで実行する
const { input, options } = workerData as { input: SolveInput; options: SolveOptions };
solve(input, options).then(
  (result) => parentPort!.postMessage({ ok: true, result }),
  (e: unknown) =>
    parentPort!.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) }),
);
