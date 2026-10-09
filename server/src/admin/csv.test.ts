import { describe, expect, it } from 'vitest';
import { parseCsv, parseUserCsv } from './csv.js';
import { testDepartments } from './testStore.js';

const H = 'email,name,is_admin,target_hours,max_hours,departments\n';
const parse = (body: string) => parseUserCsv(H + body, testDepartments);

describe('parseCsv', () => {
  it('handles BOM, CRLF, quotes and embedded newlines', () => {
    const rows = parseCsv('﻿a,b\r\n"x,1","y\n""z"""\r\n');
    expect(rows.map((r) => r.cells)).toEqual([
      ['a', 'b'],
      ['x,1', 'y\n"z"'],
    ]);
  });
});

describe('parseUserCsv', () => {
  it('parses a valid row', () => {
    const { users, errors } = parse('A@Example.test,山田,true,7.5,10,総務部|模擬店部:no\n');
    expect(errors).toEqual([]);
    expect(users).toEqual([
      {
        email: 'a@example.test',
        name: '山田',
        isAdmin: true,
        targetMinutes: 450,
        maxMinutes: 600,
        roles: [
          { departmentId: 1, requiresAvailability: true },
          { departmentId: 2, requiresAvailability: false },
        ],
      },
    ]);
  });
  it('allows optional columns to be blank or missing', () => {
    const { users, errors } = parseUserCsv('email,name\nb@example.test,佐藤\n', testDepartments);
    expect(errors).toEqual([]);
    expect(users[0]).toMatchObject({ isAdmin: false, targetMinutes: null, roles: [] });
  });
  it('reports duplicates, bad rows and unknown departments with line numbers', () => {
    const { users, errors } = parse(
      [
        'a@example.test,A,,,,総務部',
        'a@example.test,A2,,,,',
        'bad,B,,,,',
        'c@example.test,,,,,',
        'd@example.test,D,maybe,,,',
        'e@example.test,E,,10,5,',
        'f@example.test,F,,x,,',
        'g@example.test,G,,,,存在しない部',
        'h@example.test,H,,,,総務部|総務部',
      ].join('\n'),
    );
    expect(users).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(errors[0]!.message).toContain('重複');
  });
  it('rejects a missing header column', () => {
    expect(parseUserCsv('name\nA\n', testDepartments).errors[0]!.message).toContain('email');
    expect(parseUserCsv('', testDepartments).errors).toHaveLength(1);
  });
});
