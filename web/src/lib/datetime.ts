// 日付・時刻の表示を一か所にまとめる。日付は「10/9(木)」の形に統一する。
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
export const pad = (n: number) => String(n).padStart(2, '0');

type DateLike = Date | string | number;
const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d));

/** ローカル日付のキー（YYYY-MM-DD）。入力欄や URL に使う */
export const dateKey = (d: DateLike) => {
  const x = toDate(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
/** dateKey → その日の 0:00（ローカル） */
export const dayStart = (key: string) => new Date(`${key}T00:00`);
/** 09:05 */
export const hm = (d: DateLike) => {
  const x = toDate(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
/** 10/9(木)。YYYY-MM-DD の文字列も受け取れる */
export const md = (d: DateLike) => {
  const x = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? dayStart(d) : toDate(d);
  return `${x.getMonth() + 1}/${x.getDate()}(${WEEKDAYS[x.getDay()]})`;
};
/** 10/9(木) 09:05 */
export const mdhm = (d: DateLike) => `${md(d)} ${hm(d)}`;
/** 10/9(木) 09:05–10:30 */
export const mdRange = (a: DateLike, b: DateLike) => `${md(a)} ${hm(a)}–${hm(b)}`;
/** 未設定は fallback。履歴や受付期間など「いつ」を示す表示用 */
export const fmtDateTime = (iso: string | null | undefined, fallback = '未設定') =>
  iso ? mdhm(iso) : fallback;
/** 分 → 「1.5h」 */
export const hoursLabel = (min: number) => `${Math.round((min / 60) * 10) / 10}h`;
export const minutesBetween = (a: DateLike, b: DateLike) =>
  (toDate(b).getTime() - toDate(a).getTime()) / 60_000;
