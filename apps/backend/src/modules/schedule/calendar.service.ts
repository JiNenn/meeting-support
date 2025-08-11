// apps/backend/src/modules/schedule/calendar.service.ts
import { google } from 'googleapis';
import prisma from '@backend/prismaClient';

async function oauth(memberId: string) {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m?.googleRefresh) return null;
  const o = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, process.env.GOOGLE_CALLBACK_URL!
  );
  o.setCredentials({ refresh_token: m.googleRefresh });
  return o;
}

export async function freeBusy(memberIds: string[], timeMin: Date, timeMax: Date) {
  const byMember: Record<string, { start: string; end: string }[]> = {};
  for (const id of memberIds) {
    const auth = await oauth(id);
    if (!auth) { byMember[id] = []; continue; } // トークン無い人は「空き扱い」
    const cal = google.calendar({ version: 'v3', auth });
    const r = await cal.freebusy.query({
      requestBody: { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: [{ id: 'primary' }] }
    });
    const busy = r.data.calendars?.primary?.busy ?? [];
    byMember[id] = busy.map(b => ({ start: b.start!, end: b.end! }));
  }
  return byMember;
}

export function isFree(busy: { start: string; end: string }[], start: Date, end: Date) {
  const s = start.getTime(), e = end.getTime();
  return !busy.some(b => !(new Date(b.end).getTime() <= s || new Date(b.start).getTime() >= e));
}
