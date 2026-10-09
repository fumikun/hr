import { describe, expect, it } from 'vitest';
import { diffRows } from './auditDiff';

describe('diffRows', () => {
  it('lists only the changed fields with Japanese labels', () => {
    const rows = diffRows({ name: '太郎', isAdmin: false }, { name: '太郎', isAdmin: true });
    expect(rows).toEqual([{ key: 'isAdmin', label: '管理者', before: 'いいえ', after: 'はい' }]);
  });
  it('shows every field for creations and deletions', () => {
    expect(diffRows(null, { name: '花子' })).toEqual([
      { key: 'name', label: '名前', before: null, after: '花子' },
    ]);
    expect(diffRows({ name: '花子' }, null)).toEqual([
      { key: 'name', label: '名前', before: '花子', after: null },
    ]);
  });
  it('returns nothing when nothing changed', () => {
    expect(diffRows({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
