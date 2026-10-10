type SlotRef = { id: number; startsAt: string };

/** 次の不足へ: 選んでいる枠より後ろの不足から順に。最後まで行ったら先頭に戻る。不足がなければ null */
export function nextShortage<T extends SlotRef>(slots: T[], current: SlotRef | null): T | null {
  const sorted = [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
  if (sorted.length === 0) return null;
  const after = current
    ? sorted.find(
        (x) =>
          x.startsAt > current.startsAt || (x.startsAt === current.startsAt && x.id > current.id),
      )
    : undefined;
  return after ?? sorted[0]!;
}

type Cand = { userId: number; reasons: string[]; wants: boolean; assignedMinutes: number };

/**
 * 不足している枠への「おすすめ」。警告のない人の中から、入りたい人を優先し、
 * 次に目標までの残りが多い人（目標なしは最後）、最後に勤務時間が少ない人を選ぶ。
 */
export function pickRecommendation(
  cands: Cand[],
  targetOf: (userId: number) => number | null | undefined,
): Cand | null {
  const remain = (c: Cand) => {
    const t = targetOf(c.userId);
    return t == null ? -Infinity : t - c.assignedMinutes;
  };
  return (
    cands
      .filter((c) => c.reasons.length === 0)
      .sort(
        (a, b) =>
          Number(b.wants) - Number(a.wants) ||
          remain(b) - remain(a) ||
          a.assignedMinutes - b.assignedMinutes,
      )[0] ?? null
  );
}
