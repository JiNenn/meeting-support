import { freeBusyForMembers, isFree } from './calendar.service';

export async function rankCandidates(
  requiredIds: string[],
  optionalIds: string[],
  from: Date,
  to: Date,
  durationMin = 60,              // ★ 追加
) {
  const ids = Array.from(new Set([...requiredIds, ...optionalIds]));
  const slots: { start: Date; end: Date }[] = [];

  // 30分刻みで開始点を打ち、end は duration 分後
  for (let t = new Date(from); t < to; t = new Date(t.getTime() + 30*60000)) {
    const start = new Date(t);
    const end   = new Date(t.getTime() + durationMin*60000); // ★ duration
    if (end > to) break;
    slots.push({ start, end });
  }

  const busy = await freeBusyForMembers(ids, from, to);

  return slots.map(s => {
    const okReq = requiredIds.filter(id => isFree(busy[id] ?? [], s.start, s.end)).length;
    const okOpt = optionalIds.filter(id => isFree(busy[id] ?? [], s.start, s.end)).length;
    return {
      start: s.start.toISOString(),
      end:   s.end.toISOString(),
      optionalOK: okOpt,
      requiredOK: okReq,
      score: okReq*1000 + okOpt,
    };
  })
  .filter(x => x.requiredOK === requiredIds.length)
  .sort((a,b)=> b.score - a.score);
}
