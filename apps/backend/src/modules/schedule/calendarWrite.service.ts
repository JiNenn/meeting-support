// apps/backend/src/modules/schedule/calendarWrite.service.ts
import prisma from '@backend/prismaClient';
import { google } from 'googleapis';
import { isInvalidGrant } from '@backend/lib/googleErrors';
import { getMemberRefreshToken, clearMemberRefreshToken } from '@backend/lib/googleTokens';

function oauthFromRefresh(refresh: string) {
  const o = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_CALLBACK_URL!,
  );
  o.setCredentials({ refresh_token: refresh });
  return o;
}

export async function upsertMeetingEvent(meetingId: string) {
  // 1) ミーティング情報
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      organizer: true,
      members: { include: { member: true } },
    },
  });
  if (!m) throw new Error('meeting not found');
  if (!m.scheduledAt) throw new Error('meeting not scheduled');

  // 2) 主催者の refresh を「復号ヘルパー」経由で取得
  const refresh = await getMemberRefreshToken(m.organizerId);
  if (!refresh) return { ok: false as const, reason: 'no_token' as const };

  const auth = oauthFromRefresh(refresh);
  const cal = google.calendar({ version: 'v3', auth });

  // 3) attendees
  const attendees = [
    { email: m.organizer.email },
    ...m.members.map(mm => ({ email: mm.member.email })).filter(a => !!a.email),
  ].filter((v, i, arr) => arr.findIndex(x => x.email.toLowerCase() === v.email.toLowerCase()) === i);

  // 4) payload（duration 反映）
  const start = new Date(m.scheduledAt);
  const end = new Date(start.getTime() + (m.durationMinutes ?? 60) * 60000);

  const payload = {
    summary: `【会議】${m.title}`,
    description: `目的: ${m.purpose}\nMeeting ID: ${m.id}`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees,
  };

  let eventId = m.googleEventId ?? undefined;

  try {
    if (eventId) {
      // 5-a) 更新
      await cal.events.update({
        calendarId: 'primary',
        eventId,
        requestBody: payload,
        sendUpdates: 'all',
      });
    } else {
      // 5-b) 新規
      const created = await cal.events.insert({
        calendarId: 'primary',
        requestBody: payload,
        sendUpdates: 'all',
      });
      eventId = created.data.id!;
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { googleEventId: eventId },
      });
    }

    // 6) 参照リンク
    const ev = await cal.events.get({ calendarId: 'primary', eventId: eventId! });
    return { ok: true as const, htmlLink: ev.data.htmlLink, eventId };
  } catch (e: any) {
    // 7) invalid_grant 検知 → トークンをクリアして再連携を促す
    if (isInvalidGrant(e)) {
      await clearMemberRefreshToken(m.organizerId); // googleAccess/Refresh を null に
      return { ok: false as const, reason: 'relink_required' as const, message: 'invalid_grant' };
    }
    // その他エラーはそのまま上位に通知
    throw e;
  }
}

