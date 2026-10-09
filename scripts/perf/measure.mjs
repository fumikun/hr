// 画面の速さを計測し、目標値（PERF_PLAN.md）を超えていたら失敗として終了する。
//
// 事前準備（別のデータベースで）:
//   DATABASE_URL=postgres://hr:hr@localhost:5432/hr_perf pnpm db:migrate
//   DATABASE_URL=postgres://hr:hr@localhost:5432/hr_perf pnpm perf:seed
//   pnpm build
//   DATABASE_URL=... PORT=3998 NODE_ENV=development AUTH_DEV_LOGIN=true \
//     AUTH_URL=http://localhost:3998 AUTH_SECRET=x pnpm --filter server exec tsx src/index.ts
// 実行:
//   CHROME_PATH=/path/to/chrome pnpm perf
// 環境変数: BASE_URL(既定 http://localhost:3998)、LATENCY_MS(往復遅延。既定 100)、
//           MBPS(下り回線の速さ。既定 10)、NO_BUDGET=1(目標値の判定をしない)
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:3998';
const LATENCY = Number(process.env.LATENCY_MS ?? 100);
const MBPS = Number(process.env.MBPS ?? 10);

// 目標値。往復遅延100ms・10Mbps での値
const BUDGET = {
  navigationMs: 300, // ページ移動
  coldLoadMs: 1500, // 初回表示（キャッシュなし）
  reloadMs: 900, // 2回目以降の表示（キャッシュあり）
  memberTransferKB: 200, // 一般ユーザーの初回転送量(圧縮後。あとで先読みする画面の分を含む)
  navigationApiCalls: 8, // 1回のページ移動での API 呼び出し数
};

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache)
      .filter((d) => d.startsWith('chromium_headless_shell'))
      .sort()
      .reverse()) {
      const exe = join(cache, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error('Chrome が見つかりません。CHROME_PATH にパスを指定してください。');
}

const browser = await puppeteer.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
const failures = [];
const check = (label, value, limit, unit) => {
  const ok = value <= limit;
  if (!ok) failures.push(`${label}: ${value}${unit} > 目標 ${limit}${unit}`);
  return ok ? '' : `  ✗ 目標 ${limit}${unit}`;
};

async function login(email) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('button');
  await page.evaluate(async (email) => {
    const { csrfToken } = await (await fetch('/api/auth/csrf')).json();
    await fetch('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken, email }),
    });
  }, email);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  return { page, cdp };
}

async function throttle(cdp) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: LATENCY,
    downloadThroughput: (MBPS * 1024 * 1024) / 8,
    uploadThroughput: (MBPS * 1024 * 1024) / 16,
  });
}

/** 操作を行い、ネットワークが落ち着くまでの時間・API の呼び出し数・転送量を返す */
async function timed(page, cdp, action) {
  let apiCalls = 0;
  let bytes = 0;
  const onReq = (r) => r.url().includes('/api/') && apiCalls++;
  const onDone = (e) => (bytes += e.encodedDataLength);
  page.on('request', onReq);
  cdp.on('Network.loadingFinished', onDone);
  const t0 = performance.now();
  await action();
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 30000 }).catch(() => {});
  const ms = Math.round(performance.now() - t0 - 300);
  page.off('request', onReq);
  cdp.off('Network.loadingFinished', onDone);
  return { ms, apiCalls, kb: Math.round(bytes / 1024) };
}

const scenarios = [
  {
    name: '管理者',
    email: 'admin@example.test',
    start: '/admin',
    pages: [
      '/admin/users',
      '/admin/slots',
      '/admin/availability',
      '/admin/assign',
      '/admin/print',
      '/admin/audit',
    ],
  },
  {
    name: '一般ユーザー',
    email: 'u3@example.test',
    start: '/',
    pages: ['/availability', '/shifts'],
  },
];

console.log(`計測条件: 往復遅延 ${LATENCY}ms、下り ${MBPS}Mbps、${BASE}`);
for (const sc of scenarios) {
  const { page, cdp } = await login(sc.email);
  await page.evaluate(() => fetch('/api/me/onboarding/confirm', { method: 'POST' }));
  await throttle(cdp);
  await cdp.send('Network.clearBrowserCache');

  console.log(`\n== ${sc.name} ==`);
  const cold = await timed(page, cdp, () => page.goto(BASE + sc.start));
  console.log(
    `初回表示 ${sc.start.padEnd(20)} ${String(cold.ms).padStart(5)} ms  API ${cold.apiCalls} 回  転送 ${cold.kb} KB${check(`${sc.name} 初回表示`, cold.ms, BUDGET.coldLoadMs, 'ms')}`,
  );
  if (sc.name === '一般ユーザー')
    console.log(
      `   ${check('一般ユーザーの初回転送量', cold.kb, BUDGET.memberTransferKB, 'KB') || '転送量は目標内'}`,
    );

  for (const path of sc.pages) {
    const link = await page.$(`nav a[href="${path}"]`);
    const r = await timed(page, cdp, () => (link ? link.click() : page.goto(BASE + path)));
    console.log(
      `移動 → ${path.padEnd(22)} ${String(r.ms).padStart(5)} ms  API ${r.apiCalls} 回  転送 ${r.kb} KB${check(`${sc.name} ${path}`, r.ms, BUDGET.navigationMs, 'ms')}${check(`${sc.name} ${path} の API 回数`, r.apiCalls, BUDGET.navigationApiCalls, '回')}`,
    );
  }
  const reload = await timed(page, cdp, () => page.reload());
  console.log(
    `リロード（キャッシュあり） ${String(reload.ms).padStart(5)} ms  転送 ${reload.kb} KB${check(`${sc.name} リロード`, reload.ms, BUDGET.reloadMs, 'ms')}`,
  );
  await page.close();
}
await browser.close();

if (failures.length > 0 && !process.env.NO_BUDGET) {
  console.error(`\n目標値を超えた項目があります:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  failures.length ? '\n（NO_BUDGET のため判定しません）' : '\nすべて目標値の範囲内です。',
);
