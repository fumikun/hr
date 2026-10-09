import { Worker } from 'node:worker_threads';
import type { SolveInput, SolveOptions, SolveResult } from './types.js';

export type Solver = (input: SolveInput, options: SolveOptions) => Promise<SolveResult>;

// ビルド後は .js、tsx での開発時は .ts を読み込む
const ext = import.meta.url.endsWith('.ts') ? 'ts' : 'js';

export const solveInWorker: Solver = (input, options) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL(`./solveWorker.${ext}`, import.meta.url), {
      workerData: { input, options },
      execArgv: process.execArgv,
    });
    worker.once('message', (m: { ok: boolean; result?: SolveResult; error?: string }) =>
      m.ok ? resolve(m.result!) : reject(new Error(m.error)),
    );
    worker.once('error', reject);
    worker.once('exit', (code) => code !== 0 && reject(new Error(`solver worker exited: ${code}`)));
  });
