import { describe, expect, it } from 'vitest';
import { createTtlCache } from './cache.js';

describe('createTtlCache', () => {
  it('reuses a value until it expires', async () => {
    let t = 0;
    let calls = 0;
    const cache = createTtlCache<string, number>(1000, () => t);
    const load = () => Promise.resolve(++calls);
    expect(await cache.get('a', load)).toBe(1);
    t = 999;
    expect(await cache.get('a', load)).toBe(1);
    t = 1000;
    expect(await cache.get('a', load)).toBe(2);
  });

  it('does not remember null, so a state change shows up at once', async () => {
    const cache = createTtlCache<string, boolean>(1000);
    expect(await cache.get('u', () => Promise.resolve(null))).toBeNull();
    expect(await cache.get('u', () => Promise.resolve(true))).toBe(true);
  });

  it('shares one lookup between simultaneous callers', async () => {
    let calls = 0;
    const cache = createTtlCache<string, number>(1000);
    const load = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return 7;
    };
    const [a, b] = await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect([a, b, calls]).toEqual([7, 7, 1]);
  });

  it('forgets everything on clear', async () => {
    let calls = 0;
    const cache = createTtlCache<string, number>(1000);
    const load = () => Promise.resolve(++calls);
    await cache.get('a', load);
    cache.clear();
    expect(await cache.get('a', load)).toBe(2);
  });
});
