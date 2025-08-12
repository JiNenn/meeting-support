// apps/backend/src/modules/schedule/ranking.algorithm.ts
import { freeBusyForMembers, isFree } from './calendar.service';

type RankOpts = {
  stepMin?: number;       // 15 / 30 / 60（既定 30）
  startHour?: number;     // 0..23（既定 9）
  endHour?: number;       // 1..24（既定 18, startHour < endHour）
  weekdaysOnly?: boolean; // 月〜金に限定（既定 true）
};

function isWeekday(d: Date) { const w = d.getDay(); return w >= 1 && w <= 5; }

/** from/to はローカル時間帯のつもりで扱う */
export async function rankCandidates(
  requiredIds: string[],
  optionalIds: string[],
  from: Date,
  to: Date,
  durationMin = 60,
  opts: RankOpts = {},
) {
  const stepMin   = Math.max(1, (opts.stepMin ?? 30));
  const stepMs    = stepMin * 60_000;
  const startHour = Math.max(0, Math.min(23, opts.startHour ?? 9));
  const endHour   = Math.max(startHour + 1, Math.min(24, opts.endHour ?? 18));
  const weekdays  = opts.weekdaysOnly ?? true;

  const ids   = Array.from(new Set([...requiredIds, ...optionalIds]));
  const slots: { start: Date; end: Date }[] = [];

  // 1) from を step 境界に揃える（分未満のズレを除去）
  const align = (d: Date) => {
    const a = new Date(d.getTime());
    a.setSeconds(0, 0);
    const m = a.getMinutes();
    const r = m % stepMin;
    if (r !== 0) a.setMinutes(m + (stepMin - r));
    return a;
  };
  let cursor = align(from);

  // 2) スロット生成（時間帯/平日/終端越えチェック込み）
  while (cursor < to) {
    const d = new Date(cursor.getTime());
    if (!Number.isFinite(+d)) { cursor = new Date(cursor.getTime() + stepMs); continue; }

    // 平日のみ
    if (weekdays && !isWeekday(d)) { cursor = new Date(cursor.getTime() + stepMs); continue; }

    const h = d.getHours();
    if (h < startHour || h >= endHour) { cursor = new Date(cursor.getTime() + stepMs); continue; }

    const start = new Date(d.getTime());
    const end   = new Date(d.getTime() + durationMin * 60_000);

    // 会議が時間帯終端を跨ぐなら除外（例: 17:45 開始で 60分 → 18:45 になる等）
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), endHour, 0, 0, 0);
    if (end > dayEnd) { cursor = new Date(cursor.getTime() + stepMs); continue; }

    // 期間外
    if (end > to) break;

    slots.push({ start, end });
    cursor = new Date(cursor.getTime() + stepMs);
  }

  // 3) FreeBusy は終端+duration まで取得（端の重なり漏れを防ぐ）
  const freeBusyMax = new Date(to.getTime() + durationMin * 60_000);
  const busy = await freeBusyForMembers(ids, from, freeBusyMax);

  // 4) 採点
  return slots
    .map(s => {
      const okReq = requiredIds.filter(id => isFree(busy[id] ?? [], s.start, s.end)).length;
      const okOpt = optionalIds.filter(id => isFree(busy[id] ?? [], s.start, s.end)).length;
      return {
        start: s.start.toISOString(),
        end:   s.end.toISOString(),
        optionalOK: okOpt,
        requiredOK: okReq,
        score: okReq * 1000 + okOpt,
      };
    })
    .filter(x => x.requiredOK === requiredIds.length)
    .sort((a, b) => b.score - a.score);
}
