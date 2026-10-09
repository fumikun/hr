import { describe, expect, it } from 'vitest';
import { canWorkPost } from './posts.js';

const open = { departmentId: 1, restricted: false, memberIds: [] };
const closed = { departmentId: 1, restricted: true, memberIds: [10] };

describe('canWorkPost', () => {
  it('lets anyone in the department work an unrestricted post', () => {
    expect(canWorkPost(open, { id: 5, departmentIds: [1] })).toBe(true);
  });
  it('never lets people from other departments in', () => {
    expect(canWorkPost(open, { id: 5, departmentIds: [2] })).toBe(false);
    expect(canWorkPost(closed, { id: 10, departmentIds: [2] })).toBe(false);
  });
  it('limits restricted posts to listed members', () => {
    expect(canWorkPost(closed, { id: 10, departmentIds: [1] })).toBe(true);
    expect(canWorkPost(closed, { id: 5, departmentIds: [1] })).toBe(false);
  });
});
