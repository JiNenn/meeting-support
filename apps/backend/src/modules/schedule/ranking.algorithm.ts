// apps/backend/src/modules/schedule/ranking.algorithm.ts
import { freeBusy, isFree } from './calendar.service';

export async function rankCandidates(requiredIds: string[], optionalIds: string[], from: Date, to: Date) {
  // 30分グリッド
  const slots: { start: Date; end: Date }[] = [];
  const cur = new Date(from);
  while (cur < to) {
    const start = new Date(cur);
    const end = new Date(cur); end.setMinutes(end.getMinutes() + 30);
    slots.push({ start, end });
    cur.setMinutes(cur.getMinutes() + 30);
  }

  const busyReq = await freeBusy(requiredIds, from, to);
  const busyOpt = await freeBusy(optionalIds, from, to);

  const scored = slots.map(s => {
    const okReq = requiredIds.filter(id => isFree(busyReq[id] ?? [], s.start, s.end)).length;
    const okOpt = optionalIds.filter(id => isFree(busyOpt[id] ?? [], s.start, s.end)).length;
    const score = okReq * 1000 + okOpt; // 必須を重み付け
    return { start: s.start.toISOString(), end: s.end.toISOString(), optionalOK: okOpt, score, requiredOK: okReq };
  })
  .filter(x => x.requiredOK === requiredIds.length) // 必須全員が空いている枠のみ
  .sort((a,b) => b.score - a.score);

  return scored;
}
