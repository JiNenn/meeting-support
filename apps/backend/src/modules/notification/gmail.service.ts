// apps/backend/src/modules/notification/gmail.service.ts
import prisma from '@backend/prismaClient';
import { google } from 'googleapis';

export async function sendMeetingNotification(memberId: string, subject: string, text: string) {
  const mode = process.env.NOTIFY_MODE ?? 'log';

  if (mode !== 'gmail') {
    console.log(`[notify:${mode}] -> member=${memberId}\nSUBJECT: ${subject}\n${text}`);
    return;
  }

  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m) return;

  // ★ 開発用：宛先を差し替え
  const to = process.env.NOTIFY_OVERRIDE_TO ?? m.email;

  const oAuth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_CALLBACK_URL!,
  );

  if (!m.googleRefresh) {
    console.warn(`[notify:gmail] skip: member=${memberId} has no token`);
    return;
  }
  oAuth2.setCredentials({ refresh_token: m.googleRefresh });

  const gmail = google.gmail({ version: 'v1', auth: oAuth2 });
  const raw = buildRFC822(to, subject, text);
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}

function buildRFC822(to: string, subject: string, text: string) {
  const msg =
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    text;
  return Buffer.from(msg).toString('base64url');
}
