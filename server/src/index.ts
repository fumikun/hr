import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { app } from './app.js';

const root = new Hono();
root.route('/', app);
// ビルド済みSPAの静的配信（未知のパスは index.html にフォールバック）
root.use('*', serveStatic({ root: '../web/dist' }));
root.get('*', serveStatic({ path: '../web/dist/index.html' }));

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: root.fetch, port });
console.log(`listening on :${port}`);
