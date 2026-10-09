import type { Department, UserInput } from './types.js';

export type CsvError = { line: number; message: string };

/** 引用符・改行入りセル・BOM に対応した最小のCSV解析。各行に開始行番号を付ける。 */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== '')) rows.push({ line: rowLine, cells });
    cells = [];
    cell = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  endRow();
  return rows;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRUE = new Set(['1', 'true', 'yes', 'y', '○']);
const FALSE = new Set(['', '0', 'false', 'no', 'n']);

/**
 * ヘッダ: email,name,is_admin,target_hours,max_hours,departments（email と name は必須）
 * departments は `|` 区切り。末尾に `:no` を付けた部門は希望入力が不要（例: `総務部|放送部:no`）。
 */
export function parseUserCsv(
  text: string,
  departments: readonly Department[],
): { users: UserInput[]; errors: CsvError[] } {
  const rows = parseCsv(text);
  const errors: CsvError[] = [];
  const users: UserInput[] = [];
  const header = rows[0];
  if (!header) return { users, errors: [{ line: 1, message: 'ヘッダ行がありません' }] };

  const col = new Map(header.cells.map((c, i) => [c.trim().toLowerCase(), i]));
  for (const required of ['email', 'name']) {
    if (!col.has(required)) {
      errors.push({ line: header.line, message: `ヘッダに ${required} 列がありません` });
    }
  }
  if (errors.length > 0) return { users, errors };

  const deptByName = new Map(departments.map((d) => [d.name, d.id]));
  const seen = new Map<string, number>();
  const get = (cells: string[], name: string) => (cells[col.get(name) ?? -1] ?? '').trim();

  for (const { line, cells } of rows.slice(1)) {
    const fail = (message: string) => errors.push({ line, message });
    const before = errors.length;

    const email = get(cells, 'email').toLowerCase();
    const name = get(cells, 'name');
    if (!EMAIL.test(email)) fail(`メールアドレスが不正です: ${email}`);
    else if (seen.has(email))
      fail(`メールアドレスが重複しています（${seen.get(email)} 行目と同じ）: ${email}`);
    else seen.set(email, line);
    if (name === '') fail('name が空です');

    const adminCell = get(cells, 'is_admin').toLowerCase();
    if (!TRUE.has(adminCell) && !FALSE.has(adminCell)) fail(`is_admin が不正です: ${adminCell}`);

    const hours = (colName: string): number | null => {
      const v = get(cells, colName);
      if (v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        fail(`${colName} が不正です: ${v}`);
        return null;
      }
      return Math.round(n * 60);
    };
    const targetMinutes = hours('target_hours');
    const maxMinutes = hours('max_hours');
    if (targetMinutes !== null && maxMinutes !== null && maxMinutes < targetMinutes) {
      fail('max_hours が target_hours より小さいです');
    }

    const roles: UserInput['roles'] = [];
    for (const token of get(cells, 'departments')
      .split('|')
      .map((t) => t.trim())
      .filter(Boolean)) {
      const noInput = token.endsWith(':no');
      const deptName = noInput ? token.slice(0, -3).trim() : token;
      const departmentId = deptByName.get(deptName);
      if (departmentId === undefined) fail(`未知の部門です: ${deptName}`);
      else if (roles.some((r) => r.departmentId === departmentId))
        fail(`部門が重複しています: ${deptName}`);
      else roles.push({ departmentId, requiresAvailability: !noInput });
    }

    if (errors.length === before) {
      users.push({ email, name, isAdmin: TRUE.has(adminCell), targetMinutes, maxMinutes, roles });
    }
  }
  return { users, errors };
}
