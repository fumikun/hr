import { describe, expect, it } from 'vitest';
import { targetLabel, type TargetNames } from './auditTarget';

const names: TargetNames = {
  users: new Map([[10, '掛け持ちユーザー']]),
  departments: new Map([[1, '総務部']]),
  posts: new Map([[5, { name: '寮門警備', departmentId: 1 }]]),
  slots: new Map([
    [7, { startsAt: '2026-11-07T00:00:00.000Z', endsAt: '2026-11-07T01:30:00.000Z', postId: 5 }],
  ]),
};

describe('targetLabel', () => {
  it('ID 付きの対象は名前にする', () => {
    expect(targetLabel('user:10', names)).toBe('掛け持ちユーザー');
    expect(targetLabel('department:1', names)).toBe('総務部');
    expect(targetLabel('post:5', names)).toBe('総務部 / 寮門警備');
    expect(targetLabel('slot:7', names)).toMatch(/^総務部 \/ 寮門警備 11\/7\(土\) /);
  });
  it('削除済みなどで見つからないときは種類だけ出す', () => {
    expect(targetLabel('post:99', names)).toBe('持ち場（削除済み）');
    expect(targetLabel('slot:99', names)).toBe('シフト枠（削除済み）');
  });
  it('ID のない対象は決まった名前にする', () => {
    expect(targetLabel('availability_period', names)).toBe('全体の受付期間');
    expect(targetLabel('assignments', names)).toBe('割り当て');
    expect(targetLabel(null, names)).toBe('');
  });
});
