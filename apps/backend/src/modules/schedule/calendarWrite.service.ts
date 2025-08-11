import prisma from '@backend/prismaClient';
import { google } from 'googleapis';

function oauthFromRefresh(refresh: string) {
  const o = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, process.env.GOOGLE_CALLBACK_URL!
  );
  o.setCredentials({ refresh_token: refresh });
  return o;
}

export async function upsertMeetingEvent(meetingId: string) {
  // ミーティング＆主催者＆メンバー
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      organizer: true,
      members: { include: { member: true } },
    },
  });
  if (!m) throw new Error('meeting not found');
  if (!m.scheduledAt) throw new Error('meeting not scheduled');

  // 主催者のトークン
  if (!m.organizer.googleRefresh) return { ok:false as const, reason:'no_token' as const };

  const auth = oauthFromRefresh(m.organizer.googleRefresh);
  const cal = google.calendar({ version: 'v3', auth });

  // 参加者（主催＋メンバーのメール）
  const attendees = [
    { email: m.organizer.email },
    ...m.members
      .map(mm => ({ email: mm.member.email }))
      .filter(a => !!a.email),
  ].filter((v, i, arr) => arr.findIndex(x => x.email.toLowerCase() === v.email.toLowerCase()) === i);

  // 60分会議にしておく（必要なら duration を別で持つ）
  const start = new Date(m.scheduledAt);
  const end   = new Date(start); end.setMinutes(end.getMinutes() + 60);

  const payload = {
    summary: `【会議】${m.title}`,
    description: `目的: ${m.purpose}\nMeeting ID: ${m.id}`,
    start: { dateTime: start.toISOString() },
    end:   { dateTime: end.toISOString() },
    attendees,
  };

  let eventId = m.googleEventId ?? undefined;

  if (eventId) {
    // 更新
    await cal.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: payload,
      sendUpdates: 'all',
    });
  } else {
    // 新規作成
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

  // 参照リンク取得
  const ev = await cal.events.get({ calendarId: 'primary', eventId });
  return { ok:true as const, htmlLink: ev.data.htmlLink, eventId };
}
