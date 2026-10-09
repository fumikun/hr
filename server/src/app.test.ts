import { describe, expect, it } from 'vitest';
import { app } from './app.js';

describe('health', () => {
  it('returns ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
