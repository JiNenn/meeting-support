/* apps/backend/src/modules/schedule/ranking.algorithm.ts */

import prisma from '@backend/prismaClient';
import { fetchBusySlots } from './googleCalendar.service';
import { calendar_v3 } from 'googleapis';

type Busy = { start: string; end: string }[];
type Candidate = { start: Date; end: Date; requiredOK: number; optionalOK: number };
type TimePeriod = calendar_v3.Schema$TimePeriod;

function isFree(busy: TimePeriod[] | undefined, s: Date, e: Date): boolean {
  if (!busy) return true;
  return busy.every(b => {
    if (!b.start || !b.end) return true;
    const bs = new Date(b.start);
    const be = new Date(b.end);
    return e <= bs || s >= be;
  });
}

/** rangeStart〜rangeEnd を 30 分刻みでスキャンしソート済み候補を返す */
export async function rankCandidates(
  requiredIds: string[],
  optionalIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Candidate[]> {
  /* ❶ id → email マッピング */
  const reqMembers = await prisma.member.findMany({
    where: { id: { in: requiredIds } },
    select: { email: true },
  });
  const optMembers = await prisma.member.findMany({
    where: { id: { in: optionalIds } },
    select: { email: true },
  });
  const reqEmails = reqMembers.map(m => m.email);
  const optEmails = optMembers.map(m => m.email);

  /* ❷ freebusy API 呼び出し（メールアドレス配列で十分） */
  const busyReq = await fetchBusySlots(reqEmails, rangeStart, rangeEnd);
  const busyOpt = await fetchBusySlots(optEmails, rangeStart, rangeEnd);

  /* ❸ 30 分グリッドで空きスロット集計 */
  const slotMs = 30 * 60 * 1000;
  const results: Candidate[] = [];
  for (let t = +rangeStart; t + slotMs <= +rangeEnd; t += slotMs) {
    const s = new Date(t);
    const e = new Date(t + slotMs);

    const okReq = reqEmails.filter(em => isFree(busyReq[em]?.busy, s, e)).length;
    if (okReq !== reqEmails.length) continue;           // 必須全員 OK 以外は除外

    const okOpt = optEmails.filter(em => isFree(busyOpt[em]?.busy, s, e)).length;
    results.push({ start: s, end: e, requiredOK: okReq, optionalOK: okOpt });
  }

  /* ❹ 任意参加者数で降順ソート */
  return results.sort((a, b) => b.optionalOK - a.optionalOK);
}
