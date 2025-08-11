// apps/backend/src/modules/members/roleBootstrap.service.ts
import { google } from 'googleapis';
import prisma from '@backend/prismaClient';

export async function suggestMembersFromCalendar(me: string, sinceDays = 60) {
  const m = await prisma.member.findUnique({ where: { id: me } });
  if (!m?.googleRefresh) return [];
  const o = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, process.env.GOOGLE_CALLBACK_URL!
  );
  o.setCredentials({ refresh_token: m.googleRefresh });
  const cal = google.calendar({ version: 'v3', auth: o });

  const timeMin = new Date(); timeMin.setDate(timeMin.getDate() - sinceDays);
  const r = await cal.events.list({ calendarId: 'primary', timeMin: timeMin.toISOString(), singleEvents: true, maxResults: 2500 });
  const freq: Record<string, number> = {};
  for (const ev of r.data.items ?? []) {
    for (const a of ev.attendees ?? []) {
      const email = a.email?.toLowerCase();
      if (email && email !== m.email.toLowerCase()) freq[email] = (freq[email] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a,b)=>b[1]-a[1])
    .slice(0, 20)
    .map(([email, score]) => ({ email, score }));
}
