export type Me = { id: number; email: string; name: string; isAdmin: boolean };
export type Onboarding = {
  confirmed: boolean;
  roles: { departmentId: number; name: string; requiresAvailability: boolean }[];
};
export type DevUser = Me;

export async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/api/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`);
  return (await res.json()) as Me;
}

export async function fetchOnboarding(): Promise<Onboarding> {
  const res = await fetch('/api/me/onboarding');
  if (!res.ok) throw new Error(`/api/me/onboarding failed: ${res.status}`);
  return (await res.json()) as Onboarding;
}

export async function confirmOnboarding(): Promise<void> {
  const res = await fetch('/api/me/onboarding/confirm', { method: 'POST' });
  if (!res.ok) throw new Error(`confirm failed: ${res.status}`);
}

// 開発用ログインが無効（本番）の場合は 404 になるので null を返す
export async function fetchDevUsers(): Promise<DevUser[] | null> {
  const res = await fetch('/api/dev/users');
  if (!res.ok) return null;
  return (await res.json()) as DevUser[];
}

// Auth.js は CSRF トークン付きのフォームPOSTを要求する。通常のフォーム送信でリダイレクトに従う。
export async function postAuthForm(action: string, fields: Record<string, string>): Promise<void> {
  const res = await fetch('/api/auth/csrf');
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  for (const [name, value] of Object.entries({ csrfToken, callbackUrl: '/', ...fields })) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}

export type Department = { id: number; name: string };
export type AdminUser = {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  targetMinutes: number | null;
  maxMinutes: number | null;
  roles: { departmentId: number; requiresAvailability: boolean }[];
};
export type UserInput = Omit<AdminUser, 'id'>;
export type CsvError = { line: number; message: string };

const ERROR_TEXT: Record<string, string> = {
  email_taken: 'このメールアドレスは既に登録されています',
  cannot_delete_self: '自分自身は削除できません',
  cannot_demote_self: '自分自身の管理者権限は外せません',
  not_found: '対象が見つかりません',
  forbidden: '権限がありません',
};

async function adminFetch<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.ok) return (await res.json()) as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: CsvError[] };
  if (data.errors) throw new CsvImportError(data.errors);
  throw new Error(ERROR_TEXT[data.error ?? ''] ?? `エラーが発生しました (${res.status})`);
}

export class CsvImportError extends Error {
  constructor(public errors: CsvError[]) {
    super('CSVに誤りがあります');
  }
}

export const adminApi = {
  departments: () => adminFetch<Department[]>('/departments'),
  users: () => adminFetch<AdminUser[]>('/users'),
  createUser: (u: UserInput) => adminFetch<AdminUser>('/users', 'POST', u),
  updateUser: (id: number, u: UserInput) => adminFetch<AdminUser>(`/users/${id}`, 'PUT', u),
  deleteUser: (id: number) => adminFetch<{ ok: true }>(`/users/${id}`, 'DELETE'),
  importCsv: (csv: string, dryRun: boolean) =>
    adminFetch<{ valid: number } | { created: number; updated: number }>('/users/import', 'POST', {
      csv,
      dryRun,
    }),
};

export type Post = {
  id: number;
  departmentId: number;
  name: string;
  /** true の持ち場は memberIds の人だけ入れる。false なら部門の全員 */
  restricted: boolean;
  memberIds: number[];
};
export type PostInput = Omit<Post, 'id' | 'departmentId'>;

export type Slot = {
  id: number;
  departmentId: number;
  postId: number;
  startsAt: string;
  endsAt: string;
  minPeople: number;
  maxPeople: number;
};
export type SlotEdit = { startsAt: string; endsAt: string; minPeople: number; maxPeople: number };
export type SlotGenerate = {
  postId: number;
  windows: { startsAt: string; endsAt: string }[];
  slotMinutes: number;
  minPeople: number;
  maxPeople: number;
};

Object.assign(ERROR_TEXT, {
  overlap: '同じ部門の既存の枠と時間が重なっています',
  unknown_department: '部門が存在しません',
  unknown_post: '持ち場が存在しません',
  name_taken: '同じ名前の持ち場が既にあります',
  has_slots: 'この持ち場には枠があるため削除できません。先に枠を削除してください',
  member_not_in_department: '部門に所属していない人はメンバーにできません',
});

export const postApi = {
  list: () => adminFetch<Post[]>('/posts'),
  create: (departmentId: number, p: PostInput) =>
    adminFetch<Post>(`/departments/${departmentId}/posts`, 'POST', p),
  update: (id: number, p: PostInput) => adminFetch<Post>(`/posts/${id}`, 'PUT', p),
  remove: (id: number) => adminFetch<{ ok: true }>(`/posts/${id}`, 'DELETE'),
};

export const slotApi = {
  list: () => adminFetch<Slot[]>('/slots'),
  generate: (g: SlotGenerate) => adminFetch<Slot[]>('/slots/generate', 'POST', g),
  create: (postId: number, s: SlotEdit) => adminFetch<Slot>('/slots', 'POST', { postId, ...s }),
  update: (id: number, s: SlotEdit) => adminFetch<Slot>(`/slots/${id}`, 'PUT', s),
  remove: (id: number) => adminFetch<{ ok: true }>(`/slots/${id}`, 'DELETE'),
};

export type Period = { opensAt: string | null; closesAt: string | null };
export type AvailabilityEntryDto = {
  type: 'want' | 'ok' | 'ng';
  departmentId: number | null;
  startsAt: string;
  endsAt: string;
};
export type AvailabilityData = {
  period: Period;
  open: boolean;
  departments: Department[];
  slots: { departmentId: number; startsAt: string; endsAt: string }[];
  submittedAt: string | null;
  entries: AvailabilityEntryDto[];
};
export type InputStatus = {
  userId: number;
  name: string;
  email: string;
  required: boolean;
  submittedAt: string | null;
  entryCount: number;
};

Object.assign(ERROR_TEXT, { period_closed: '受付期間外のため保存できません' });

export const availabilityApi = {
  get: async () => {
    const res = await fetch('/api/app/availability');
    if (!res.ok) throw new Error(`希望の取得に失敗しました (${res.status})`);
    return (await res.json()) as AvailabilityData;
  },
  save: async (entries: AvailabilityEntryDto[]) => {
    const res = await fetch('/api/app/availability', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    if (res.ok) return;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(ERROR_TEXT[data.error ?? ''] ?? `保存に失敗しました (${res.status})`);
  },
};

export const periodApi = {
  get: () => adminFetch<Period>('/settings/availability-period'),
  put: (p: Period) => adminFetch<Period>('/settings/availability-period', 'PUT', p),
  status: () => adminFetch<InputStatus[]>('/availability/status'),
};

export type RunStatus = 'running' | 'done' | 'failed';
export type AssignRun = {
  id: number;
  status: RunStatus;
  phase: string;
  startedAt: string;
  finishedAt: string | null;
  result: {
    assigned: number;
    shortageSlots: number;
    shortagePeople: number;
    solverStatus: string;
  } | null;
  error: string | null;
};
export type AssignmentRow = {
  userId: number;
  slotId: number;
  source: 'auto' | 'manual';
  locked: boolean;
  status: 'draft' | 'confirmed';
};
export type ViolationReason =
  'not_in_department' | 'post_restricted' | 'unavailable' | 'double_booked' | 'over_capacity';
export type Violation = { userId: number; slotId: number; reason: ViolationReason };
export type AssignData = {
  assignments: AssignmentRow[];
  shortages: { slotId: number; missing: number }[];
  violations: Violation[];
};

Object.assign(ERROR_TEXT, {
  already_running: '自動割り当てが実行中です。完了までお待ちください',
  exists: 'すでに割り当てられています',
  confirmed: '確定済みの割り当ては削除できません',
  unknown_user: 'ユーザーが存在しません',
  unknown_slot: '枠が存在しません',
});

export const assignApi = {
  data: () => adminFetch<AssignData>('/assign'),
  latestRun: () => adminFetch<AssignRun | null>('/assign/run'),
  run: (timeLimitSeconds: number) =>
    adminFetch<AssignRun>('/assign/run', 'POST', { timeLimitSeconds }),
  add: (userId: number, slotId: number) =>
    adminFetch<{ warnings: Violation[] }>('/assign/assignments', 'POST', { userId, slotId }),
  remove: (userId: number, slotId: number) =>
    adminFetch<{ ok: true }>(`/assign/assignments/${userId}/${slotId}`, 'DELETE'),
  setLocked: (userId: number, slotId: number, locked: boolean) =>
    adminFetch<{ ok: true }>(`/assign/assignments/${userId}/${slotId}/lock`, 'PUT', { locked }),
};

export type Candidate = {
  userId: number;
  reasons: ViolationReason[];
  wants: boolean;
  assignedMinutes: number;
};
export const candidatesApi = (slotId: number) =>
  adminFetch<Candidate[]>(`/assign/candidates/${slotId}`);

export const confirmApi = {
  confirm: () => adminFetch<{ changed: number }>('/assign/confirm', 'POST'),
  unconfirm: () => adminFetch<{ changed: number }>('/assign/unconfirm', 'POST'),
};

export type AuditRow = {
  id: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  target: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};
export const auditApi = {
  list: (before?: number) =>
    adminFetch<AuditRow[]>(`/audit?limit=50${before ? `&before=${before}` : ''}`),
};

export type MyShift = {
  slotId: number;
  startsAt: string;
  endsAt: string;
  department: string;
  post: string;
};
export async function fetchMyShifts(): Promise<MyShift[]> {
  const res = await fetch('/api/app/shifts');
  if (!res.ok) throw new Error(`シフトの取得に失敗しました (${res.status})`);
  return ((await res.json()) as { shifts: MyShift[] }).shifts;
}
