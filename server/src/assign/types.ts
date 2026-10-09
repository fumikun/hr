export type SolveUser = {
  id: number;
  targetMinutes: number | null;
  maxMinutes: number | null;
  departmentIds: number[];
};
export type SolvePost = {
  id: number;
  departmentId: number;
  restricted: boolean;
  memberIds: number[];
};
/** 時刻はミリ秒 */
export type SolveSlot = {
  id: number;
  departmentId: number;
  postId: number;
  start: number;
  end: number;
  minPeople: number;
  maxPeople: number;
};
export type SolveAvailability = {
  userId: number;
  type: 'want' | 'ok' | 'ng';
  departmentId: number | null;
  start: number;
  end: number;
};
export type Pair = { userId: number; slotId: number };

export type SolveInput = {
  users: SolveUser[];
  posts: SolvePost[];
  slots: SolveSlot[];
  availabilities: SolveAvailability[];
  /** 固定された割り当て（手動で固定したもの・確定済み）。再実行しても動かさない */
  locked: Pair[];
};
export type SolveOptions = { timeLimitSeconds?: number };
export type SolveResult = {
  /** 新しく自動で割り当てた組（locked は含まない） */
  assignments: Pair[];
  status: string;
  objective: number | null;
};

export type AssignmentRow = {
  userId: number;
  slotId: number;
  source: 'auto' | 'manual';
  locked: boolean;
  status: 'draft' | 'confirmed';
};

export type RunStatus = 'running' | 'done' | 'failed';
export type RunSummary = {
  assigned: number;
  shortageSlots: number;
  shortagePeople: number;
  solverStatus: string;
};
export type Run = {
  id: number;
  status: RunStatus;
  phase: string;
  startedAt: Date;
  finishedAt: Date | null;
  result: RunSummary | null;
  error: string | null;
};

export interface AssignStore {
  loadSolveInput(): Promise<SolveInput>;
  listAssignments(): Promise<AssignmentRow[]>;
  /** 固定されていない下書きの割り当てをすべて消して、新しい自動割り当てに置き換える */
  replaceAutoAssignments(pairs: Pair[], actorId: number, summary: RunSummary): Promise<void>;
  addManual(pair: Pair, actorId: number): Promise<'ok' | 'exists'>;
  removeAssignment(pair: Pair, actorId: number): Promise<'ok' | 'not_found' | 'confirmed'>;
  setLocked(pair: Pair, locked: boolean, actorId: number): Promise<boolean>;
  createRun(actorId: number, options: SolveOptions): Promise<Run | null>;
  updateRun(
    id: number,
    patch: Partial<Pick<Run, 'status' | 'phase' | 'result' | 'error'>>,
  ): Promise<void>;
  latestRun(): Promise<Run | null>;
  /** 再起動で取り残された running を failed にする */
  failStaleRuns(): Promise<void>;
}
